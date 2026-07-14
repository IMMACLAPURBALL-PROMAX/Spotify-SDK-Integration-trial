"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import gsap from "gsap";
import {
  redirectToSpotifyLogin,
  getStoredAccessToken,
  clearSpotifyAuth,
} from "@/lib/spotify-auth";
import { LiquidBackground } from "@/components/LiquidBackground";
import { PlayerCard } from "@/components/PlayerCard";
import { useActivePlayer } from "@/hooks/useActivePlayer";
import { useImageBrightness } from "@/hooks/useImageBrightness";
import type { AccessibilitySettings } from "@/contexts/AccessibilityContext";
import { defaultAccessibilitySettings } from "@/contexts/AccessibilityContext";

// ── Static fallback data ──
const STATIC_IMAGES = [
  "/images/billie_1.jpg",
  "/images/billie7.jpg",
  "/images/billie8.jpg",
  "/images/billie9.jpg",
  "/images/billie5.jpg",
];

const STATIC_TRACK_DATA = [
  { title: "No Time To Die", artist: "Billie Eilish", duration: "4:02", time: "1:15", progress: "31%" },
  { title: "CHIHIRO", artist: "Billie Eilish", duration: "5:03", time: "2:42", progress: "53%" },
  { title: "dont smile at me", artist: "Billie Eilish", duration: "3:15", time: "0:58", progress: "29%" },
  { title: "BURY A FRIEND", artist: "Billie Eilish", duration: "3:13", time: "2:04", progress: "66%" },
  { title: "Happier Than Ever", artist: "Billie Eilish", duration: "4:58", time: "3:41", progress: "74%" },
];

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mood, setMood] = useState<"chill" | "energy" | "focus">("chill");
  const [boostValues, setBoostValues] = useState({ bass: 1.0, mids: 1.0, highs: 1.0 });
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [accessibilitySettings, setAccessibilitySettings] = useState<AccessibilitySettings>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("a11ySettings");
      if (saved) return JSON.parse(saved);
    }
    return defaultAccessibilitySettings;
  });

  useEffect(() => {
    localStorage.setItem("a11ySettings", JSON.stringify(accessibilitySettings));
  }, [accessibilitySettings]);

  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);

  const toggleAccessibilitySetting = useCallback((key: keyof AccessibilitySettings) => {
    setAccessibilitySettings((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleAllSettings = useCallback(() => {
    setAccessibilitySettings((prev) => {
      // If any setting is false, we want to enable all. If all are true, we disable all.
      // Wait, standard behavior for master switch: if all are false, enable all. Else, disable all.
      const allDisabled = Object.values(prev).every(val => val === false);
      if (allDisabled) {
        return defaultAccessibilitySettings; // enable all
      } else {
        // disable all
        const disabled = { ...prev };
        (Object.keys(disabled) as Array<keyof AccessibilitySettings>).forEach(k => {
          disabled[k] = false;
        });
        return disabled;
      }
    });
  }, []);

  // Animation and track state
  const lastTrackIdRef = useRef<string | null>(null);
  const masterIndexRef = useRef(0);
  const animatingRef = useRef(false);

  const { state: playerState, controls, isLocal, getAudioData } = useActivePlayer(isLoggedIn, mood);
  const isPlayerActive = (isLoggedIn && playerState.isReady) || (!isLoggedIn && isLocal);
  
  const currentBgUrl = isPlayerActive && playerState.currentTrack?.albumArtUrl
    ? playerState.currentTrack.albumArtUrl
    : STATIC_IMAGES[currentSlideIndex];
    
  const brightness = useImageBrightness(currentBgUrl);

  // ── Auth check on mount ──
  useEffect(() => {
    const token = getStoredAccessToken();
    if (token) setIsLoggedIn(true);
  }, []);

  // ── GSAP Initial Setup ──
  useEffect(() => {
    const cards = document.querySelectorAll(".album-card");
    if (cards.length > 0) {
      gsap.set(cards, { opacity: 0, scale: 0.95, y: 10, rotation: -2 });
      gsap.set(cards[0], { opacity: 1, scale: 1, y: 0, rotation: 0 });
      cards[0].classList.add("active");
    }
  }, []);

  // ── Sync background & trigger GSAP on Spotify track changes ──
  useEffect(() => {
    if (!isPlayerActive || !playerState.currentTrack) return;

    const trackId = playerState.currentTrack.id;
    const artUrl = playerState.currentTrack.albumArtUrl;

    if (trackId !== lastTrackIdRef.current && artUrl) {
      if (lastTrackIdRef.current === null) {
        // First track loaded, no GSAP transition needed yet
        const activeCard = document.querySelector(".album-card.active") as HTMLImageElement;
        if (activeCard) activeCard.src = artUrl;
      } else {
        // Track changed! Run GSAP transition visually.
        runGsapTransition(artUrl, playerState.currentTrack);
      }
      lastTrackIdRef.current = trackId;
    }
  }, [isPlayerActive, playerState.currentTrack]);

  // ── Core GSAP Animation Logic ──
  const runGsapTransition = (newImageUrl: string | null, newTrackData: any = null) => {
    if (animatingRef.current) return;
    animatingRef.current = true;

    const elems = document.querySelectorAll(".elem");
    const cards = document.querySelectorAll(".album-card");
    const totalSlides = 5; // We still cycle the 5 DOM elements for text and cards

    const currentIndex = masterIndexRef.current;
    const nextIndex = (currentIndex + 1) % totalSlides;

    // 1. Text rolling animation
    elems.forEach((elem, colIndex) => {
      const h1s = elem.querySelectorAll("h1");

      // Update the incoming h1 text for Spotify mode
      if (isPlayerActive && newTrackData && h1s[nextIndex]) {
        if (colIndex === 0) {
          // Column 1: Song Title
          h1s[nextIndex].textContent = newTrackData.name;
        } else if (colIndex === 1) {
          // Column 2: Artist (with featured artists appended)
          const featText = newTrackData.featuredArtists && newTrackData.featuredArtists.length > 0
            ? ` ft. ${newTrackData.featuredArtists.join(", ")}`
            : "";
          h1s[nextIndex].textContent = newTrackData.primaryArtist + featText;
        } else if (colIndex === 2) {
          // Column 3: Album Name (prevent duplicates for Singles)
          const isSingle = newTrackData.albumName && newTrackData.name &&
            newTrackData.albumName.toLowerCase() === newTrackData.name.toLowerCase();
          h1s[nextIndex].textContent = isSingle ? "Single" : (newTrackData.albumName || "");
        }
      }

      gsap.to(h1s[currentIndex], {
        top: "-=100%",
        ease: "expo.inOut",
        duration: 1,
        onComplete: () => {
          gsap.set(h1s[currentIndex], { top: "100%" });
          animatingRef.current = false;
        },
      });
      gsap.to(h1s[nextIndex], {
        top: "-=100%",
        ease: "expo.inOut",
        duration: 1,
      });
    });

    // 2. Card flying animation
    const outgoing = cards[currentIndex] as HTMLImageElement;
    const incoming = cards[nextIndex] as HTMLImageElement;

    // If Spotify is active, we dynamically update the incoming card's image to the new album art
    if (newImageUrl) {
      incoming.src = newImageUrl;
    }

    const isSpotify = !!newTrackData;
    const progressWidth = isSpotify ? "0%" : STATIC_TRACK_DATA[nextIndex].progress;

    gsap.timeline()
      .to(outgoing, {
        opacity: 0, x: -60, rotation: -8, scale: 0.9, duration: 0.35,
        ease: "power2.inOut",
        onComplete: () => {
          outgoing.classList.remove("active");
          gsap.set(outgoing, { x: 0, y: 10, rotation: -2, scale: 0.95 });
        },
      })
      .to([".track-title", ".artist-name", ".time-stamp:first-child", ".time-stamp:last-child"], {
        opacity: 0, y: -5, duration: 0.15, stagger: 0.02,
        onComplete: () => {
          gsap.to(".progress-slider", { backgroundSize: progressWidth, duration: 0.4, ease: "power1.out" });
        },
      }, "<")
      .to([".track-title", ".artist-name", ".time-stamp:first-child", ".time-stamp:last-child"], {
        opacity: 1, y: 0, duration: 0.2, stagger: 0.02,
      })
      .fromTo(incoming,
        { opacity: 0, scale: 1.1, y: -15, rotation: 6 },
        { opacity: 1, scale: 1, y: 0, rotation: 0, duration: 0.4, ease: "back.out(1.4)",
          onStart: () => incoming.classList.add("active"),
        }, "-=0.2"
      );
    masterIndexRef.current = nextIndex;
    setCurrentSlideIndex(nextIndex);
  };

  // ── Main click handler ──
  const handleMainClick = useCallback(() => {
    if (isPlayerActive) {
      // Trigger Spotify skip. The `useEffect` above will run the GSAP transition
      // automatically when Spotify confirms the track actually changed.
      controls.skipToNext();
    } else {
      // Static mode: trigger transition immediately
      runGsapTransition(null, null);
    }
  }, [isPlayerActive, controls]);

  // ── Premium / Login button ──
  const handlePremiumClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isLoggedIn) {
      clearSpotifyAuth();
      setIsLoggedIn(false);
      lastTrackIdRef.current = null;
      masterIndexRef.current = 0;
      setCurrentSlideIndex(0);
    } else {
      redirectToSpotifyLogin();
    }
  };

  // ── Autoplay slideshow in static mode ──
  useEffect(() => {
    if (isPlayerActive) return;

    const interval = setInterval(() => {
      if (animatingRef.current) return;
      runGsapTransition(null, null);
    }, 5000);

    return () => clearInterval(interval);
  }, [isPlayerActive]);

  // ── Playback timeline binding calculations ──
  const currentPosMs = isPlayerActive ? playerState.positionMs : 0;

  const nextBgUrl = isPlayerActive
    ? playerState.nextTrackArtUrl
    : STATIC_IMAGES[(currentSlideIndex + 1) % 5];

  const playbackState = isPlayerActive && playerState.currentTrack ? {
    positionMs: currentPosMs,
    isPaused: playerState.isPaused,
    volume: playerState.volume,
    durationMs: playerState.currentTrack.durationMs,
    getAudioData: getAudioData || undefined
  } : null;

  return (
    <>
      <div id="main" onClick={handleMainClick}>
        <div id="top">
          <LiquidBackground
            currentTrackUrl={currentBgUrl}
            hoverTrackUrl={nextBgUrl}
            mood={mood}
            playbackState={playbackState}
            boostValues={boostValues}
            accessibility={accessibilitySettings}
          />
          <div id="workingarea">
            <div id="nav" className={brightness.navIsLight ? "force-pill" : ""}>
              <div id="nleft">
                <img src="/images/Spotifylogo.png" alt="Spotify Logo" />
                <div className="mood-dropdown" onClick={(e) => e.stopPropagation()}>
                  <button className="mood-dropbtn">
                    <span>Mood: {mood}</span>
                  </button>
                  <div className="mood-dropdown-content">
                    <button onClick={() => setMood("chill")}>✨ Chill</button>
                    <button onClick={() => setMood("energy")}>⚡ Energy</button>
                    <button onClick={() => setMood("focus")}>👁️ Focus</button>
                  </div>
                </div>
                <div className="boost-dropdown" onClick={(e) => e.stopPropagation()}>
                  <button className="boost-dropbtn">
                    <span>Boost</span>
                  </button>
                  <div className="boost-dropdown-content">
                    <div className="boost-slider-row">
                      <span className="boost-slider-label">Bass</span>
                      <input
                        type="range"
                        min="0.5"
                        max="1.5"
                        step="0.1"
                        value={boostValues.bass}
                        onChange={(e) => setBoostValues(prev => ({ ...prev, bass: parseFloat(e.target.value) }))}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      />
                      <span className="boost-slider-value">{boostValues.bass.toFixed(1)}x</span>
                    </div>
                    <div className="boost-slider-row">
                      <span className="boost-slider-label">Mids</span>
                      <input
                        type="range"
                        min="0.5"
                        max="1.5"
                        step="0.1"
                        value={boostValues.mids}
                        onChange={(e) => setBoostValues(prev => ({ ...prev, mids: parseFloat(e.target.value) }))}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      />
                      <span className="boost-slider-value">{boostValues.mids.toFixed(1)}x</span>
                    </div>
                    <div className="boost-slider-row">
                      <span className="boost-slider-label">Highs</span>
                      <input
                        type="range"
                        min="0.5"
                        max="1.5"
                        step="0.1"
                        value={boostValues.highs}
                        onChange={(e) => setBoostValues(prev => ({ ...prev, highs: parseFloat(e.target.value) }))}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      />
                      <span className="boost-slider-value">{boostValues.highs.toFixed(1)}x</span>
                    </div>
                  </div>
                </div>
              </div>
              <div id="nright">
                <div className="audio-wrapper">
                  <span className="audio-text" style={{ textDecoration: playerState.volume === 0 ? "line-through" : "none" }}>Audio</span>
                  <div className="volume-slider-container">
                    <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.01" 
                      value={playerState.volume ?? 0.5} 
                      onChange={(e) => controls.setVolume(parseFloat(e.target.value))}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
                <a href="#" onClick={handlePremiumClick}>
                  <span>{isLoggedIn ? "Connected ✓" : "Premium"}</span>
                </a>
              </div>
            </div>
            
            <div id="hero" className={brightness.heroIsLight ? "force-black" : ""}>
              <div id="heroleft">
                {/* Column 1: Song name */}
                <div className="elem">
                  <h1>{isPlayerActive ? (playerState.currentTrack?.name || "Loading...") : "Loading..."}</h1>
                  <h1></h1>
                  <h1></h1>
                  <h1></h1>
                  <h1></h1>
                </div>
                {/* Column 2: Artist */}
                <div className="elem">
                  <h1>{isPlayerActive ? (playerState.currentTrack?.primaryArtist || "") : ""}</h1>
                  <h1></h1>
                  <h1></h1>
                  <h1></h1>
                  <h1></h1>
                </div>
                {/* Column 3: Album name */}
                <div className="elem">
                  <h1>{isPlayerActive && playerState.currentTrack ? (playerState.currentTrack.albumName.toLowerCase() === playerState.currentTrack.name.toLowerCase() ? "Single" : playerState.currentTrack.albumName) : ""}</h1>
                  <h1></h1>
                  <h1></h1>
                  <h1></h1>
                  <h1></h1>
                </div>
                <button>
                  Listen Now
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>
              </div>
              <PlayerCard 
                playerState={playerState}
                controls={controls}
                isPlayerActive={isPlayerActive}
                isLocal={isLocal}
                currentSlideIndex={currentSlideIndex}
                staticImages={STATIC_IMAGES}
                staticTrackData={STATIC_TRACK_DATA}
                backgroundUrl={currentBgUrl}
              />
            </div>
          </div>
          {/* Leftover footer collaboration block removed */}
        </div>
      </div>

      {/* ── Accessibility Settings Button & Panel ── */}
      <button
        className={`a11y-settings-btn${settingsPanelOpen ? " active" : ""}`}
        onClick={(e) => { e.stopPropagation(); setSettingsPanelOpen((v) => !v); }}
        aria-label="Accessibility settings"
        aria-expanded={settingsPanelOpen}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      <div className={`a11y-settings-panel${settingsPanelOpen ? " open" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="a11y-panel-header">Visual Settings</div>
        
        {/* Master Toggle */}
        <label className="a11y-toggle-row" style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "12px", marginBottom: "4px" }}>
          <div className="a11y-toggle-info">
            <span className="a11y-toggle-label">Master Switch</span>
            <span className="a11y-toggle-desc">Toggle all animations</span>
          </div>
          <div
            className={`a11y-toggle-switch${Object.values(accessibilitySettings).some(v => v) ? " on" : ""}`}
            role="switch"
            aria-checked={Object.values(accessibilitySettings).some(v => v)}
            tabIndex={0}
            onClick={(e) => { e.preventDefault(); toggleAllSettings(); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleAllSettings(); } }}
          >
            <div className="a11y-toggle-thumb" />
          </div>
        </label>

        {([
          { key: "imageBreathing" as const, label: "Image Breathing", desc: "Bass UV pulse · Chill" },
          { key: "sparkleEffects" as const, label: "Sparkle Effects", desc: "Particles · Chill" },
          { key: "colorSeparation" as const, label: "Color Separation", desc: "RGB cycling · Energy" },
          { key: "layerMovement" as const, label: "Layer Movement", desc: "Orbital drift · Energy" },
          { key: "frameBreathing" as const, label: "Frame Breathing", desc: "Bass frame · Focus" },
        ]).map(({ key, label, desc }) => (
          <label key={key} className="a11y-toggle-row">
            <div className="a11y-toggle-info">
              <span className="a11y-toggle-label">{label}</span>
              <span className="a11y-toggle-desc">{desc}</span>
            </div>
            <div
              className={`a11y-toggle-switch${accessibilitySettings[key] ? " on" : ""}`}
              role="switch"
              aria-checked={accessibilitySettings[key]}
              tabIndex={0}
              onClick={(e) => { e.preventDefault(); toggleAccessibilitySetting(key); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleAccessibilitySetting(key); } }}
            >
              <div className="a11y-toggle-thumb" />
            </div>
          </label>
        ))}
      </div>
    </>
  );
}
