"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { SpotifyPlayerState, SpotifyPlayerControls, SpotifyTrackInfo } from "./useSpotifyPlayer";

export const LOCAL_PLAYLISTS = {
  chill: [
    {
      id: "local-chill-1",
      name: "The Color Violet",
      primaryArtist: "Tory Lanez",
      featuredArtists: [],
      albumName: "Alone At Prom",
      albumArtUrl: "/images/alone-at-prom.webp",
      audioUrl: "/audio/tory-lanez-the-color-violet.mp3",
    },
    {
      id: "local-chill-2",
      name: "LET GO",
      primaryArtist: "Central Cee",
      featuredArtists: [],
      albumName: "LET GO",
      albumArtUrl: "/images/let-go.jpg",
      audioUrl: "/audio/central-cee-let-go.mp3",
    },
    {
      id: "local-chill-3",
      name: "MY EYES",
      primaryArtist: "Travis Scott",
      featuredArtists: [],
      albumName: "UTOPIA",
      albumArtUrl: "/images/my-eyes.webp",
      audioUrl: "/audio/travis-scott-my-eyes.mp3",
    },
    {
      id: "local-chill-4",
      name: "ocean eyes",
      primaryArtist: "Billie Eilish",
      featuredArtists: [],
      albumName: "dont smile at me",
      albumArtUrl: "/images/cover3.jpg",
      audioUrl: "/audio/billie-eilish-ocean-eyes.mp3",
    },
    {
      id: "local-chill-5",
      name: "CHIHIRO",
      primaryArtist: "Billie Eilish",
      featuredArtists: [],
      albumName: "HIT ME HARD AND SOFT",
      albumArtUrl: "/images/cover2.jpg",
      audioUrl: "/audio/billie-eilish-chihiro.mp3",
    },
    {
      id: "local-chill-6",
      name: "Happier Than Ever",
      primaryArtist: "Billie Eilish",
      featuredArtists: [],
      albumName: "Happier Than Ever",
      albumArtUrl: "/images/img10.jpg",
      audioUrl: "/audio/billie-eilish-happier-than-ever.mp3",
    },
    {
      id: "local-chill-7",
      name: "I Wanna Be Yours",
      primaryArtist: "Arctic Monkeys",
      featuredArtists: [],
      albumName: "AM",
      albumArtUrl: "/images/i-wanna-be-yours.jpg",
      audioUrl: "/audio/arctic-monkeys-i-wanna-be-yours.mp3",
    }
  ],
  energy: [
    {
      id: "local-energy-1",
      name: "4 Raws",
      primaryArtist: "EsDeeKid",
      featuredArtists: [],
      albumName: "Rebel",
      albumArtUrl: "/images/Rebel-4raws.webp",
      audioUrl: "/audio/4 Raws.mp3",
    },
    {
      id: "local-energy-2",
      name: "In Da Club",
      primaryArtist: "50 Cent",
      featuredArtists: [],
      albumName: "Get Rich or Die Tryin'",
      albumArtUrl: "/images/In Da Club.jpg",
      audioUrl: "/audio/50 Cent - In Da Club (Official Music Video).mp3",
    },
    {
      id: "local-energy-3",
      name: "Clash",
      primaryArtist: "Dave",
      featuredArtists: ["Stormzy"],
      albumName: "We're All Alone In This Together",
      albumArtUrl: "/images/dave-WERE-ALL-ALONE-IN-THIS-TOGETHER-.jpeg",
      audioUrl: "/audio/Dave - Clash (ft. Stormzy).mp3",
    },
    {
      id: "local-energy-4",
      name: "Jimmy Cooks",
      primaryArtist: "Drake",
      featuredArtists: ["21 Savage"],
      albumName: "Honestly, Nevermind",
      albumArtUrl: "/images/Honestly Nevermind.webp",
      audioUrl: "/audio/Drake - Jimmy Cooks (Audio) ft. 21 Savage.mp3",
    },
    {
      id: "local-energy-5",
      name: "MURDER IN MY MIND",
      primaryArtist: "KORDHELL",
      featuredArtists: [],
      albumName: "Murder In My Mind",
      albumArtUrl: "/images/Kordhell cover art.avif",
      audioUrl: "/audio/KORDHELL - MURDER IN MY MIND.mp3",
    },
    {
      id: "local-energy-6",
      name: "DIOR",
      primaryArtist: "POP SMOKE",
      featuredArtists: [],
      albumName: "Meet The Woo",
      albumArtUrl: "/images/Dior.webp",
      audioUrl: "/audio/POP SMOKE - DIOR (OFFICIAL VIDEO).mp3",
    }
  ],
  focus: [
    // Fallback tracks for Focus until you upload specific Focus tracks
    {
      id: "local-focus-1",
      name: "bury a friend",
      primaryArtist: "Billie Eilish",
      featuredArtists: [],
      albumName: "WHEN WE ALL FALL ASLEEP",
      albumArtUrl: "/images/cover4.jpg",
      audioUrl: "/audio/billie-eilish-bury-a-friend.mp3",
    },
    {
      id: "local-focus-2",
      name: "dont smile at me",
      primaryArtist: "Billie Eilish",
      featuredArtists: [],
      albumName: "dont smile at me",
      albumArtUrl: "/images/cover3.jpg",
      audioUrl: "/audio/billie-eilish-dont-smile-at-me.mp3",
    }
  ]
};

export interface AudioReactivityData {
  subBass: number;
  bass: number;
  mid: number;
  high: number;
  impact: number; // Volume transient (spikes) for hi-hats/snares
}

export function useLocalPlayer(mood: "chill" | "energy" | "focus", isEnabled: boolean) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const timeDomainDataArrayRef = useRef<Uint8Array | null>(null);
  const lastRmsRef = useRef<number>(0);
  const impactRef = useRef<number>(0);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  
  // Cache the audio data per-frame so multiple components calling it don't cause double-decay
  const lastProcessedTimeRef = useRef<number>(0);
  const cachedAudioDataRef = useRef<any>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const playlist = LOCAL_PLAYLISTS[mood];

  const [state, setState] = useState<SpotifyPlayerState>({
    currentTrack: null,
    isPaused: true,
    positionMs: 0,
    deviceId: "local-device",
    isReady: false,
    volume: 0.5,
    nextTrackArtUrl: null,
  });

  // Init audio element once
  useEffect(() => {
    if (!isEnabled) return;
    
    if (!audioRef.current) {
      const audio = new Audio();
      audio.crossOrigin = "anonymous";
      audioRef.current = audio;

      // Listeners
      audio.addEventListener("timeupdate", () => {
        setState(s => {
          const currentDuration = (audio.duration && !isNaN(audio.duration) && audio.duration !== Infinity) ? audio.duration * 1000 : 180000;
          return {
            ...s, 
            positionMs: audio.currentTime * 1000,
            currentTrack: s.currentTrack ? { ...s.currentTrack, durationMs: currentDuration } : null
          };
        });
      });
      
      audio.addEventListener("ended", () => {
        skipToNext();
      });

      audio.addEventListener("loadedmetadata", () => {
        setState(s => {
          if (!s.currentTrack) return s;
          return {
            ...s,
            currentTrack: { ...s.currentTrack, durationMs: audio.duration * 1000 }
          };
        });
      });

      audio.addEventListener("play", () => setState(s => ({ ...s, isPaused: false })));
      audio.addEventListener("pause", () => setState(s => ({ ...s, isPaused: true })));
    }

    return () => {
      if (audioRef.current && !isEnabled) {
        audioRef.current.pause();
      }
    };
  }, [isEnabled]);

  // Load track when index or mood changes
  useEffect(() => {
    if (!isEnabled || !audioRef.current) return;
    
    const trackData = playlist[currentIndex];
    if (!trackData) return;

    const trackInfo: SpotifyTrackInfo = {
      id: trackData.id,
      name: trackData.name,
      primaryArtist: trackData.primaryArtist,
      featuredArtists: trackData.featuredArtists,
      albumName: trackData.albumName,
      albumArtUrl: trackData.albumArtUrl,
      durationMs: 180000, // placeholder until loadedmetadata fires
    };

    const nextTrackData = playlist[(currentIndex + 1) % playlist.length];

    setState(s => ({
      ...s,
      currentTrack: trackInfo,
      nextTrackArtUrl: nextTrackData?.albumArtUrl || null,
      isReady: true,
    }));

    if (trackData.audioUrl) {
      // If the audio was playing OR if it just naturally finished (ended is true), we want to autoplay the next track
      const wasPlaying = (!audioRef.current.paused && audioRef.current.currentTime > 0) || audioRef.current.ended;
      audioRef.current.src = trackData.audioUrl;
      audioRef.current.load();
      if (wasPlaying) {
        audioRef.current.play().catch(console.error);
      }
    }
  }, [currentIndex, mood, isEnabled]); // Re-run if mood changes to reset track

  // Initialize Web Audio API on first play
  const initWebAudio = () => {
    if (!audioCtxRef.current && audioRef.current) {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioContext();
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 4096; // 2048 bins, ~10.7Hz per bin
      
      gainNodeRef.current = audioCtxRef.current.createGain();
      gainNodeRef.current.gain.value = state.volume; // Initialize to current UI volume
      
      // CRITICAL: Force audio element to full volume so the Analyser always
      // receives the full-strength signal. The GainNode above controls the
      // actual speaker output. Without this, if the user changed volume
      // before pressing play (via the fallback path), audioRef.volume would
      // still be reduced, double-attenuating the analyser input.
      audioRef.current.volume = 1.0;
      
      sourceNodeRef.current = audioCtxRef.current.createMediaElementSource(audioRef.current);
      // Route: MediaElement (1.0) → Analyser (full signal) → GainNode (UI volume) → Speakers
      sourceNodeRef.current.connect(analyserRef.current);
      analyserRef.current.connect(gainNodeRef.current);
      gainNodeRef.current.connect(audioCtxRef.current.destination);

      dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
      timeDomainDataArrayRef.current = new Uint8Array(analyserRef.current.fftSize);
    }
    if (audioCtxRef.current?.state === "suspended") {
      audioCtxRef.current.resume();
    }
  };

  const togglePlay = useCallback(async () => {
    if (!audioRef.current) return;
    initWebAudio();
    if (audioRef.current.paused) {
      await audioRef.current.play().catch(console.error);
    } else {
      audioRef.current.pause();
    }
  }, []);

  const skipToNext = useCallback(async () => {
    setCurrentIndex(i => (i + 1) % playlist.length);
  }, [playlist.length]);

  const skipToPrevious = useCallback(async () => {
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }
    setCurrentIndex(i => (i - 1 + playlist.length) % playlist.length);
  }, [playlist.length]);

  const seek = useCallback(async (positionMs: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = positionMs / 1000;
      setState(s => ({ ...s, positionMs }));
    }
  }, []);

  const setVolume = useCallback(async (volume: number) => {
    // We do NOT change audioRef.current.volume because we want the AnalyserNode to always receive a 1.0 full-scale signal.
    // Instead, we adjust the Web Audio GainNode which controls the speaker output after the analyzer.
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume;
    } else if (audioRef.current) {
      // Fallback if Web Audio isn't initialized yet
      audioRef.current.volume = volume;
    }
    setState(s => ({ ...s, volume }));
  }, []);

  // Expose frequency data for 3D scenes
  const getAudioData = useCallback((): AudioReactivityData | null => {
    if (!analyserRef.current || !dataArrayRef.current || !timeDomainDataArrayRef.current) return null;
    if (state.isPaused) return null;

    // Prevent multiple components from double-processing the audio data in the same frame (60fps = ~16ms)
    const now = performance.now();
    if (now - lastProcessedTimeRef.current < 10 && cachedAudioDataRef.current) {
      return cachedAudioDataRef.current;
    }
    lastProcessedTimeRef.current = now;
    
    // Get Frequency Data (FFT)
    analyserRef.current.getByteFrequencyData(dataArrayRef.current as any);
    
    // Get Waveform Data (Time Domain)
    analyserRef.current.getByteTimeDomainData(timeDomainDataArrayRef.current as any);
    
    // fftSize = 4096 -> 2048 bins -> ~10.7Hz per bin
    let subBassSum = 0;
    for (let i = 2; i < 6; i++) subBassSum += dataArrayRef.current[i]; // ~20Hz to 60Hz
    
    let bassSum = 0;
    for (let i = 6; i < 24; i++) bassSum += dataArrayRef.current[i]; // ~60Hz to 250Hz
    
    let midSum = 0;
    for (let i = 24; i < 186; i++) midSum += dataArrayRef.current[i]; // ~250Hz to 2000Hz
    
    let highSum = 0;
    for (let i = 186; i < 930; i++) highSum += dataArrayRef.current[i]; // ~2000Hz to 10000Hz

    // Calculate RMS (Root Mean Square) for the waveform volume
    let sumSquares = 0;
    for (let i = 0; i < timeDomainDataArrayRef.current.length; i++) {
      // Data is 0-255 centered at 128
      const normalize = (timeDomainDataArrayRef.current[i] - 128) / 128;
      sumSquares += normalize * normalize;
    }
    const currentRms = Math.sqrt(sumSquares / timeDomainDataArrayRef.current.length);
    
    // Detect transient impact (volume spike)
    // If the current volume is significantly higher than the previous frame, we register a hit
    let currentImpact = 0;
    const transientThreshold = 1.3; // Requires a 30% volume spike to trigger
    if (currentRms > lastRmsRef.current * transientThreshold && currentRms > 0.05) {
      // Calculate how hard the spike was (normalized 0 to 1)
      const rawImpact = Math.min(1.0, (currentRms - (lastRmsRef.current * transientThreshold)) * 10.0);
      
      // THE "AND GATE" (Isolate Hi-Hats/Snares):
      // Multiply the physical impact by the high-frequency energy.
      // - Deep piano chord = high rawImpact, low highEnergy -> 0.2 (Suppressed)
      // - Vocal sustain = low rawImpact, high highEnergy -> 0.0 (Suppressed)
      // - Hi-hat hit = high rawImpact, high highEnergy -> 1.0 (Triggered!)
      const highEnergy = Math.min(1.0, (highSum / 744) / 255);
      
      // Give it a small boost (e.g., 1.5x) since the multiplication naturally lowers the peak value
      currentImpact = Math.min(1.0, rawImpact * highEnergy * 1.5);
    }
    
    // Smooth the impact so it acts like a spring (bounces up instantly, decays slowly)
    if (currentImpact > impactRef.current) {
      impactRef.current = currentImpact; // Instant pop
    } else {
      impactRef.current *= 0.85; // Smooth decay
    }
    
    // Slowly decay the lastRms so it creates a rolling average
    lastRmsRef.current = lastRmsRef.current * 0.8 + currentRms * 0.2;

    // Normalize and cache
    cachedAudioDataRef.current = {
      subBass: Math.min(1.0, (subBassSum / 4) / 255),
      bass: Math.min(1.0, (bassSum / 18) / 255),
      mid: Math.min(1.0, (midSum / 162) / 255),
      high: Math.min(1.0, (highSum / 744) / 255),
      impact: impactRef.current,
    };
    
    return cachedAudioDataRef.current;
  }, [state.isPaused]);

  return {
    state,
    controls: { skipToNext, skipToPrevious, togglePlay, seek, setVolume },
    getAudioData,
  };
}
