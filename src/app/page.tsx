"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import gsap from "gsap";
import {
  redirectToSpotifyLogin,
  getStoredAccessToken,
  clearSpotifyAuth,
} from "@/lib/spotify-auth";
import { BackgroundEffect } from "@/lib/background-effect";
import { useSpotifyPlayer } from "@/hooks/useSpotifyPlayer";

// ── Static fallback data (used when Spotify is not connected) ──
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
  const backRef = useRef<HTMLDivElement>(null);
  const bgEffectRef = useRef<BackgroundEffect | null>(null);
  const lastTrackIdRef = useRef<string | null>(null);

  // Static mode state (when Spotify is not connected)
  const staticIndexRef = useRef(0);
  const animatingRef = useRef(false);

  // Spotify player hook
  const { state: playerState, controls } = useSpotifyPlayer();
  const isSpotifyActive = isLoggedIn && playerState.isReady && playerState.currentTrack !== null;

  // ── Auth check on mount ──
  useEffect(() => {
    const token = getStoredAccessToken();
    if (token) setIsLoggedIn(true);
  }, []);

  // ── Initialize the Three.js background effect ──
  useEffect(() => {
    if (!backRef.current) return;

    const fx = new BackgroundEffect(backRef.current);
    bgEffectRef.current = fx;

    // Load the first static image as the initial background
    fx.setImage(STATIC_IMAGES[0]);

    return () => {
      fx.dispose();
      bgEffectRef.current = null;
    };
  }, []);

  // ── Sync background with Spotify track changes ──
  useEffect(() => {
    if (!isSpotifyActive || !bgEffectRef.current || !playerState.currentTrack) return;

    const trackId = playerState.currentTrack.id;
    const artUrl = playerState.currentTrack.albumArtUrl;

    // Only transition if the track actually changed
    if (trackId !== lastTrackIdRef.current && artUrl) {
      if (lastTrackIdRef.current === null) {
        // First track — set immediately
        bgEffectRef.current.setImage(artUrl);
      } else {
        // Subsequent tracks — smooth gooey transition
        bgEffectRef.current.transitionTo(artUrl, 1.5);
      }
      lastTrackIdRef.current = trackId;
    }
  }, [isSpotifyActive, playerState.currentTrack]);

  // ── Premium / Login button ──
  const handlePremiumClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isLoggedIn) {
      clearSpotifyAuth();
      setIsLoggedIn(false);
      lastTrackIdRef.current = null;
      // Reset to static background
      if (bgEffectRef.current) {
        bgEffectRef.current.setImage(STATIC_IMAGES[0]);
        staticIndexRef.current = 0;
      }
      console.log("[Spotify] Logged out.");
    } else {
      redirectToSpotifyLogin();
    }
  };

  // ── Main click handler ──
  const handleMainClick = useCallback(() => {
    if (isSpotifyActive) {
      // Spotify is active — skip to next track
      // The player_state_changed event will update the background automatically
      controls.skipToNext();
      return;
    }

    // Static fallback mode — cycle through local images and text
    if (animatingRef.current) return;
    animatingRef.current = true;

    const elems = document.querySelectorAll(".elem");
    const totalSlides = 5;
    const currentIndex = staticIndexRef.current;
    const nextIndex = (currentIndex + 1) % totalSlides;

    // Text animation
    elems.forEach((elem) => {
      const h1s = elem.querySelectorAll("h1");
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

    // Background transition
    if (bgEffectRef.current) {
      bgEffectRef.current.transitionTo(STATIC_IMAGES[nextIndex], 1.5);
    }

    // Player card animation (static mode)
    const cards = document.querySelectorAll(".album-card");
    const outgoing = cards[currentIndex];
    const incoming = cards[nextIndex];
    const data = STATIC_TRACK_DATA[nextIndex];

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
          const timeStart = document.querySelector(".playback-timeline .time-stamp:first-child") as HTMLElement;
          const timeEnd = document.querySelector(".playback-timeline .time-stamp:last-child") as HTMLElement;
          if (titleEl) titleEl.innerText = data.title;
          if (artistEl) artistEl.innerText = data.artist;
          if (timeStart) timeStart.innerText = data.time;
          if (timeEnd) timeEnd.innerText = data.duration;
          gsap.to(".progress-bar-fill", { width: data.progress, duration: 0.4, ease: "power1.out" });
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

    staticIndexRef.current = nextIndex;
  }, [isSpotifyActive, controls]);

  // ── Derive display values ──
  const displayTrackTitle = isSpotifyActive
    ? playerState.currentTrack!.name
    : "LUNCH";
  const displayArtistName = isSpotifyActive
    ? playerState.currentTrack!.artist
    : "Billie Eilish";
  const displayCurrentTime = isSpotifyActive
    ? formatMs(playerState.positionMs)
    : "0:00";
  const displayTotalTime = isSpotifyActive
    ? formatMs(playerState.currentTrack!.durationMs)
    : "3:02";
  const displayProgress = isSpotifyActive
    ? `${Math.round((playerState.positionMs / playerState.currentTrack!.durationMs) * 100)}%`
    : "25%";
  const displayAlbumArt = isSpotifyActive
    ? playerState.currentTrack!.albumArtUrl
    : "/images/cover1.jpg";
  const nowPlayingLabel = isSpotifyActive
    ? (playerState.isPaused ? "PAUSED" : "NOW PLAYING")
    : "NOW PLAYING";

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-before-interactive-script-outside-document */}
      <div id="main" onClick={handleMainClick}>
        {/* Three.js canvas mounts here */}
        <div id="back" ref={backRef} />

        <div id="top">
          <div id="workingarea">
            <div id="nav">
              <div id="nleft">
                <img src="/images/Spotifylogo.png" alt="Spotify Logo" />
                <a href="#"><span>Soundscapes</span></a>
                <a href="#"><span>Visuals</span></a>
              </div>
              <div id="nright">
                <a href="#"><span>Audio</span></a>
                <a href="#" onClick={handlePremiumClick}>
                  <span>{isLoggedIn ? "Connected ✓" : "Premium"}</span>
                </a>
              </div>
            </div>
            <div id="hero">
              <div id="heroleft">
                <div className="elem">
                  <h1>No Time To Die</h1>
                  <h1>CHIHIRO</h1>
                  <h1>dont smile</h1>
                  <h1>BURY A FRIEND</h1>
                  <h1>Happier Than</h1>
                </div>
                <div className="elem">
                  <h1>007 theme.</h1>
                  <h1>ocean waves.</h1>
                  <h1>at me.</h1>
                  <h1>sleepwalk.</h1>
                  <h1>Ever Before.</h1>
                </div>
                <div className="elem">
                  <h1>orchestral.</h1>
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

                {isSpotifyActive ? (
                  <div className="imagediv">
                    <img src={displayAlbumArt} className="album-card active" alt="Now Playing Album Art" />
                  </div>
                ) : (
                  <div className="imagediv">
                    <img src="/images/cover1.jpg" className="album-card active" alt="No Time To Die" />
                    <img src="/images/cover2.jpg" className="album-card" alt="HIT ME HARD AND SOFT Era" />
                    <img src="/images/cover3.jpg" className="album-card" alt="dont smile at me Era" />
                    <img src="/images/cover4.jpg" className="album-card" alt="WHEN WE ALL FALL ASLEEP Era" />
                    <img src="/images/cover5.jpg" className="album-card" alt="Happier Than Ever" />
                  </div>
                )}

                <div className="player-meta">
                  <h3 className="track-title">{displayTrackTitle}</h3>
                  <p className="artist-name">{displayArtistName}</p>
                </div>

                <div className="playback-timeline">
                  <span className="time-stamp" id="current-time">{displayCurrentTime}</span>
                  <div className="progress-bar-container">
                    <div className="progress-bar-fill" style={isSpotifyActive ? { width: displayProgress } : undefined} />
                  </div>
                  <span className="time-stamp" id="total-time">{displayTotalTime}</span>
                </div>

                <div className="player-controls">
                  <button className="control-btn secondary-btn" aria-label="Shuffle"
                    onClick={(e) => e.stopPropagation()}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>
                  </button>

                  <button className="control-btn" id="prev-track" aria-label="Previous Track"
                    onClick={(e) => { e.stopPropagation(); if (isSpotifyActive) controls.skipToPrevious(); }}>
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
                  </button>

                  <button className="control-btn master-play" id="play-trigger" aria-label="Play Track"
                    onClick={(e) => { e.stopPropagation(); if (isSpotifyActive) controls.togglePlay(); }}>
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  </button>

                  <button className="control-btn" id="next-track" aria-label="Next Track"
                    onClick={(e) => { e.stopPropagation(); if (isSpotifyActive) controls.skipToNext(); }}>
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6zm9-12h2v12h-2z" /></svg>
                  </button>

                  <button className="control-btn secondary-btn" aria-label="Repeat"
                    onClick={(e) => e.stopPropagation()}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div id="footer-collab">
            <span className="collab-tag">In Collaboration With</span>
            <img src="/images/billie_signature.png" alt="Billie Eilish Signature Logo" className="collab-logo" />
          </div>
        </div>
      </div>
    </>
  );
}
