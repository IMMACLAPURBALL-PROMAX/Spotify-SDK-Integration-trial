"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import gsap from "gsap";
import {
  redirectToSpotifyLogin,
  getStoredAccessToken,
  clearSpotifyAuth,
} from "@/lib/spotify-auth";
import { LiquidBackground } from "@/components/LiquidBackground";
import { useSpotifyPlayer } from "@/hooks/useSpotifyPlayer";
import { useImageBrightness } from "@/hooks/useImageBrightness";

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

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mood, setMood] = useState<"chill" | "energy" | "focus">("chill");
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  // Animation and track state
  const lastTrackIdRef = useRef<string | null>(null);
  const masterIndexRef = useRef(0);
  const animatingRef = useRef(false);

  // Playback slider dragging state
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [dragProgressMs, setDragProgressMs] = useState(0);

  const { state: playerState, controls } = useSpotifyPlayer();
  const isSpotifyActive = isLoggedIn && playerState.isReady && playerState.currentTrack !== null;
  const brightness = useImageBrightness(playerState.currentTrack?.albumArtUrl || STATIC_IMAGES[0]);

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
    if (!isSpotifyActive || !playerState.currentTrack) return;

    const trackId = playerState.currentTrack.id;
    const artUrl = playerState.currentTrack.albumArtUrl;

    if (trackId !== lastTrackIdRef.current && artUrl) {
      if (lastTrackIdRef.current === null) {
        // First track loaded, no GSAP transition needed yet
        // Also update the active card image manually for the first load
        const activeCard = document.querySelector(".album-card.active") as HTMLImageElement;
        if (activeCard) activeCard.src = artUrl;
      } else {
        // Track changed! Run GSAP transition visually.
        runGsapTransition(artUrl, playerState.currentTrack);
      }
      lastTrackIdRef.current = trackId;
    }
  }, [isSpotifyActive, playerState.currentTrack]);

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
      if (isSpotifyActive && newTrackData && h1s[nextIndex]) {
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

    // Determine what text to show in the metadata block
    const isSpotify = !!newTrackData;
    const title = isSpotify ? newTrackData.name : STATIC_TRACK_DATA[nextIndex].title;
    const artist = isSpotify
      ? (newTrackData.featuredArtists && newTrackData.featuredArtists.length > 0
          ? `${newTrackData.primaryArtist} feat. ${newTrackData.featuredArtists.join(", ")}`
          : newTrackData.primaryArtist)
      : STATIC_TRACK_DATA[nextIndex].artist;
    const timeStart = isSpotify ? "0:00" : STATIC_TRACK_DATA[nextIndex].time;
    const timeEnd = isSpotify ? formatMs(newTrackData.durationMs) : STATIC_TRACK_DATA[nextIndex].duration;
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
          const titleEl = document.querySelector(".track-title") as HTMLElement;
          const artistEl = document.querySelector(".artist-name") as HTMLElement;
          const ts1 = document.querySelector(".playback-timeline .time-stamp:first-child") as HTMLElement;
          const ts2 = document.querySelector(".playback-timeline .time-stamp:last-child") as HTMLElement;
          if (titleEl) titleEl.innerText = title;
          if (artistEl) artistEl.innerText = artist;
          if (ts1) ts1.innerText = timeStart;
          if (ts2) ts2.innerText = timeEnd;
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
    if (isSpotifyActive) {
      // Trigger Spotify skip. The `useEffect` above will run the GSAP transition
      // automatically when Spotify confirms the track actually changed.
      controls.skipToNext();
    } else {
      // Static mode: trigger transition immediately
      runGsapTransition(null, null);
    }
  }, [isSpotifyActive, controls]);

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
    if (isSpotifyActive) return;

    // Disabled auto-changing backgrounds for easier testing
    /*
    const interval = setInterval(() => {
      if (animatingRef.current) return;
      runGsapTransition(null, null);
    }, 5000);

    return () => clearInterval(interval);
    */
  }, [isSpotifyActive]);

  // ── Playback slider seek event handlers ──
  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setDragProgressMs(val);
    if (!isDraggingProgress) {
      setIsDraggingProgress(true);
    }
  };

  const handleProgressMouseDown = () => {
    setIsDraggingProgress(true);
    setDragProgressMs(isSpotifyActive && playerState.currentTrack ? playerState.positionMs : 0);
  };

  const handleProgressMouseUp = () => {
    setIsDraggingProgress(false);
    if (isSpotifyActive) {
      controls.seek(dragProgressMs);
    }
  };

  // ── Playback timeline binding calculations ──
  const maxDurationMs = isSpotifyActive && playerState.currentTrack ? playerState.currentTrack.durationMs : 182000;
  const currentPosMs = isDraggingProgress 
    ? dragProgressMs 
    : (isSpotifyActive ? playerState.positionMs : 0);

  const displayProgressPercent = isSpotifyActive
    ? `${(currentPosMs / maxDurationMs) * 100}%`
    : (STATIC_TRACK_DATA[currentSlideIndex]?.progress || "0%");

  const displayTimeStart = isSpotifyActive
    ? formatMs(currentPosMs)
    : (STATIC_TRACK_DATA[currentSlideIndex]?.time || "0:00");

  const displayTimeEnd = isSpotifyActive && playerState.currentTrack
    ? formatMs(playerState.currentTrack.durationMs)
    : (STATIC_TRACK_DATA[currentSlideIndex]?.duration || "3:02");

  const nowPlayingLabel = isSpotifyActive
    ? (playerState.isPaused ? "PAUSED" : "NOW PLAYING")
    : "NOW PLAYING";

  const currentBgUrl = isSpotifyActive && playerState.currentTrack?.albumArtUrl
    ? playerState.currentTrack.albumArtUrl
    : STATIC_IMAGES[currentSlideIndex];

  const nextBgUrl = isSpotifyActive
    ? playerState.nextTrackArtUrl
    : STATIC_IMAGES[(currentSlideIndex + 1) % 5];

  const playbackState = isSpotifyActive && playerState.currentTrack ? {
    positionMs: currentPosMs,
    isPaused: playerState.isPaused,
    volume: playerState.volume,
    durationMs: playerState.currentTrack.durationMs,
  } : null;

  return (
    <>
      <div id="main" onClick={handleMainClick}>
        <LiquidBackground
          currentTrackUrl={currentBgUrl}
          hoverTrackUrl={nextBgUrl}
          mood={mood}
          playbackState={playbackState}
        />

        <div id="top">
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
                <a href="#"><span>Visuals</span></a>
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
                  <h1>{isSpotifyActive ? playerState.currentTrack!.name : "No Time To Die"}</h1>
                  <h1>CHIHIRO</h1>
                  <h1>dont smile</h1>
                  <h1>BURY A FRIEND</h1>
                  <h1>Happier Than</h1>
                </div>
                {/* Column 2: Artist */}
                <div className="elem">
                  <h1>{isSpotifyActive ? playerState.currentTrack!.primaryArtist : "007 theme."}</h1>
                  <h1>ocean waves.</h1>
                  <h1>at me.</h1>
                  <h1>sleepwalk.</h1>
                  <h1>Ever Before.</h1>
                </div>
                {/* Column 3: Album name */}
                <div className="elem">
                  <h1>{isSpotifyActive ? (playerState.currentTrack!.albumName.toLowerCase() === playerState.currentTrack!.name.toLowerCase() ? "Single" : playerState.currentTrack!.albumName) : "orchestral."}</h1>
                  <h1>deep blue.</h1>
                  <h1>colors.</h1>
                  <h1>alone.</h1>
                  <h1>heaven.</h1>
                </div>
                <button>
                  Listen Now
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>
              </div>

              <div id="heroright">
                <p>{nowPlayingLabel}</p>

                {/* We render all 5 cards so GSAP can cycle through them. 
                    In Spotify mode, GSAP dynamically swaps the src of the incoming card. */}
                <div className="imagediv">
                  <img src="/images/cover1.jpg" className="album-card" alt="Deck Card 1" />
                  <img src="/images/cover2.jpg" className="album-card" alt="Deck Card 2" />
                  <img src="/images/cover3.jpg" className="album-card" alt="Deck Card 3" />
                  <img src="/images/cover4.jpg" className="album-card" alt="Deck Card 4" />
                  <img src="/images/cover5.jpg" className="album-card" alt="Deck Card 5" />
                </div>

                <div className="player-meta">
                  <h3 className="track-title">LUNCH</h3>
                  <p className="artist-name">Billie Eilish</p>
                </div>

                <div className="playback-timeline" onClick={e => e.stopPropagation()}>
                  <span className="time-stamp">{displayTimeStart}</span>
                  <div className="progress-slider-container">
                    <input 
                      type="range"
                      className="progress-slider"
                      min="0"
                      max={maxDurationMs}
                      value={currentPosMs}
                      style={{ backgroundSize: `${displayProgressPercent} 100%` }}
                      onChange={handleProgressChange}
                      onMouseDown={handleProgressMouseDown}
                      onMouseUp={handleProgressMouseUp}
                      onTouchStart={handleProgressMouseDown}
                      onTouchEnd={handleProgressMouseUp}
                    />
                  </div>
                  <span className="time-stamp">{displayTimeEnd}</span>
                </div>

                <div className="player-controls">
                  <button className="control-btn secondary-btn" aria-label="Shuffle" onClick={e => e.stopPropagation()}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>
                  </button>

                  <button className="control-btn" id="prev-track" aria-label="Previous Track"
                    onClick={(e) => { e.stopPropagation(); if (isSpotifyActive) controls.skipToPrevious(); }}>
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
                  </button>

                  <button className="control-btn master-play" id="play-trigger" aria-label={playerState.isPaused ? "Play Track" : "Pause Track"}
                    onClick={(e) => { e.stopPropagation(); if (isSpotifyActive) controls.togglePlay(); }}>
                    {playerState.isPaused ? (
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                    )}
                  </button>

                  <button className="control-btn" id="next-track" aria-label="Next Track"
                    onClick={(e) => { e.stopPropagation(); if (isSpotifyActive) controls.skipToNext(); }}>
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6zm9-12h2v12h-2z" /></svg>
                  </button>

                  <button className="control-btn secondary-btn" aria-label="Repeat" onClick={e => e.stopPropagation()}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
          {/* Leftover footer collaboration block removed */}
        </div>
      </div>
    </>
  );
}
