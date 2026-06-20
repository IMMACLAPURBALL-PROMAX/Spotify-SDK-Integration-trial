"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import * as THREE from "three";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  redirectToSpotifyLogin,
  getStoredAccessToken,
  clearSpotifyAuth,
} from "@/lib/spotify-auth";

export default function Home() {
  const [scriptsLoaded, setScriptsLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Check for existing token on mount
  useEffect(() => {
    const token = getStoredAccessToken();
    if (token) {
      setIsLoggedIn(true);
      console.log("[Spotify] Already logged in. Token:", token.slice(0, 20) + "…");
    }
  }, []);

  const handlePremiumClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent the #main click listener from firing
    if (isLoggedIn) {
      clearSpotifyAuth();
      setIsLoggedIn(false);
      console.log("[Spotify] Logged out.");
    } else {
      redirectToSpotifyLogin();
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      // @ts-ignore
      window.THREE = THREE;
      // @ts-ignore
      window.gsap = gsap;
      gsap.registerPlugin(ScrollTrigger);
    }
  }, []);

  useEffect(() => {
    if (!scriptsLoaded || initializedRef.current) return;
    initializedRef.current = true;

    // @ts-ignore
    const Shery = window.Shery;
    if (!Shery) return;

    Shery.imageEffect("#back", {
      style: 5,
      gooey: true,
      config: {
        a: { value: 2, range: [0, 30] },
        b: { value: -0.91, range: [-1, 1] },
        zindex: { value: -9996999, range: [-9999999, 9999999] },
        aspect: { value: 2.1875719535735985 },
        ignoreShapeAspect: { value: true },
        shapePosition: { value: { x: 0, y: 0 } },
        shapeScale: { value: { x: 0.5, y: 0.5 } },
        shapeEdgeSoftness: { value: 0, range: [0, 0.5] },
        shapeRadius: { value: 0, range: [0, 2] },
        currentScroll: { value: 0 },
        scrollLerp: { value: 0.07 },
        gooey: { value: true },
        infiniteGooey: { value: true },
        durationIn: { value: 1.5, range: [0.1, 5] },
        durationOut: { value: 1.0, range: [0.1, 5] },
        growSize: { value: 3.99, range: [1, 15] },
        displaceAmount: { value: 0.5 },
        masker: { value: false },
        maskVal: { value: 1, range: [1, 5] },
        scrollType: { value: 0 },
        geoVertex: { range: [1, 64], value: 1 },
        noEffectGooey: { value: true },
        onMouse: { value: 0 },
        noise_speed: { value: 0.2, range: [0, 10] },
        metaball: { value: 0.14, range: [0, 2] },
        discard_threshold: { value: 0.46, range: [0, 1] },
        antialias_threshold: { value: 0, range: [0, 0.1] },
        noise_height: { value: 0.44, range: [0, 2] },
        noise_scale: { value: 10.69, range: [0, 100] },
      },
    });

    const elems = document.querySelectorAll(".elem");
    const cards = document.querySelectorAll(".album-card");

    const trackData = [
      { title: "No Time To Die", artist: "Billie Eilish", duration: "4:02", time: "1:15", progress: "31%" },
      { title: "CHIHIRO", artist: "Billie Eilish", duration: "5:03", time: "2:42", progress: "53%" },
      { title: "dont smile at me", artist: "Billie Eilish", duration: "3:15", time: "0:58", progress: "29%" },
      { title: "BURY A FRIEND", artist: "Billie Eilish", duration: "3:13", time: "2:04", progress: "66%" },
      { title: "Happier Than Ever", artist: "Billie Eilish", duration: "4:58", time: "3:41", progress: "74%" },
    ];

    let masterIndex = 0;
    let animating = false;
    const totalSlides = 5;

    gsap.set(cards, { opacity: 0, scale: 0.95, y: 10, rotation: -2 });
    gsap.set(cards[0], { opacity: 1, scale: 1, y: 0, rotation: 0 });

    const handleMainClick = () => {
      if (animating) return;
      animating = true;

      elems.forEach((elem) => {
        const h1s = elem.querySelectorAll("h1");
        const currentH1 = h1s[masterIndex];

        gsap.to(currentH1, {
          top: "-=100%",
          ease: "expo.inOut",
          duration: 1,
          onComplete: function () {
            gsap.set(currentH1, { top: "100%" });
            animating = false;
          },
        });

        let nextIndex = (masterIndex + 1) % totalSlides;

        gsap.to(h1s[nextIndex], {
          top: "-=100%",
          ease: "expo.inOut",
          duration: 1,
        });
      });

      const outgoingCard = cards[masterIndex];
      masterIndex = (masterIndex + 1) % totalSlides;
      const incomingCard = cards[masterIndex];
      const data = trackData[masterIndex];

      gsap.timeline()
        .to(outgoingCard, {
          opacity: 0,
          x: -60,
          rotation: -8,
          scale: 0.9,
          duration: 0.35,
          ease: "power2.inOut",
          onComplete: () => {
            outgoingCard.classList.remove("active");
            gsap.set(outgoingCard, { x: 0, y: 10, rotation: -2, scale: 0.95 });
          },
        })
        .to(
          [".track-title", ".artist-name", ".time-stamp:first-child", ".time-stamp:last-child"],
          { opacity: 0, y: -5, duration: 0.15, stagger: 0.02, onComplete: () => {
              (document.querySelector(".track-title") as HTMLElement).innerText = data.title;
              (document.querySelector(".artist-name") as HTMLElement).innerText = data.artist;
              (document.querySelector(".playback-timeline .time-stamp:first-child") as HTMLElement).innerText = data.time;
              (document.querySelector(".playback-timeline .time-stamp:last-child") as HTMLElement).innerText = data.duration;
              gsap.to(".progress-bar-fill", { width: data.progress, duration: 0.4, ease: "power1.out" });
            }
          },
          "<"
        )
        .to([".track-title", ".artist-name", ".time-stamp:first-child", ".time-stamp:last-child"], {
          opacity: 1,
          y: 0,
          duration: 0.2,
          stagger: 0.02,
        })
        .fromTo(
          incomingCard,
          { opacity: 0, scale: 1.1, y: -15, rotation: 6 },
          { opacity: 1, scale: 1, y: 0, rotation: 0, duration: 0.4, ease: "back.out(1.4)", onStart: () => incomingCard.classList.add("active") },
          "-=0.2"
        );
    };

    const mainElement = document.querySelector("#main");
    mainElement?.addEventListener("click", handleMainClick);

    return () => {
      mainElement?.removeEventListener("click", handleMainClick);
    };
  }, [scriptsLoaded]);

  return (
    <>
      <Script src="https://cdn.jsdelivr.net/gh/automat/controlkit.js@master/bin/controlKit.min.js" strategy="beforeInteractive" />
      <Script src="https://unpkg.com/sheryjs/dist/Shery.js" strategy="afterInteractive" onLoad={() => setScriptsLoaded(true)} />

      <div id="main">
        <div id="back" className="absolute top-0 left-0 w-full h-screen z-[1]">
          <img src="/images/billie_1.jpg" alt="Billie Eilish Aesthetic 1" />
          <img src="/images/billie7.jpg" alt="Billie Eilish Aesthetic 2" />
          <img src="/images/billie8.jpg" alt="Billie Eilish Aesthetic 3" />
          <img src="/images/billie9.jpg" alt="Billie Eilish Aesthetic 4" />
          <img src="/images/billie5.jpg" alt="Billie Eilish Aesthetic 5" />
        </div>
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
                <p>NOW PLAYING</p>

                <div className="imagediv">
                  <img src="/images/cover1.jpg" className="album-card active" alt="No Time To Die" />
                  <img src="/images/cover2.jpg" className="album-card" alt="HIT ME HARD AND SOFT Era" />
                  <img src="/images/cover3.jpg" className="album-card" alt="dont smile at me Era" />
                  <img src="/images/cover4.jpg" className="album-card" alt="WHEN WE ALL FALL ASLEEP Era" />
                  <img src="/images/cover5.jpg" className="album-card" alt="Happier Than Ever" />
                </div>
                
                <div className="player-meta">
                  <h3 className="track-title">LUNCH</h3>
                  <p className="artist-name">Billie Eilish</p>
                </div>

                <div className="playback-timeline">
                  <span className="time-stamp" id="current-time">0:00</span>
                  <div className="progress-bar-container">
                    <div className="progress-bar-fill"></div>
                  </div>
                  <span className="time-stamp" id="total-time">3:02</span>
                </div>

                <div className="player-controls">
                  <button className="control-btn secondary-btn" aria-label="Shuffle">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>
                  </button>

                  <button className="control-btn" id="prev-track" aria-label="Previous Track">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
                  </button>

                  <button className="control-btn master-play" id="play-trigger" aria-label="Play Track">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  </button>

                  <button className="control-btn" id="next-track" aria-label="Next Track">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6zm9-12h2v12h-2z" /></svg>
                  </button>

                  <button className="control-btn secondary-btn" aria-label="Repeat">
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
