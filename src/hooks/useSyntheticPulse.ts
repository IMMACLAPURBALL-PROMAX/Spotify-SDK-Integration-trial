import { useRef } from "react";

export interface PlaybackState {
  positionMs: number;
  isPaused: boolean;
  volume: number;
  durationMs: number;
}

export function useSyntheticPulse(bpm: number = 120) {
  // We use a ref to store internal state so we don't trigger React re-renders
  const stateRef = useRef({
    localTimeSec: 0,
    lastPositionMs: 0,
    pulseValue: 0,
  });

  const update = (delta: number, playbackState: PlaybackState | null) => {
    const s = stateRef.current;

    // If no playback state provided, we run an autonomous internal clock for static mode
    if (!playbackState) {
      s.localTimeSec += delta;
    } else {
      // Sync local timer with Spotify player
      if (playbackState.isPaused) {
        s.pulseValue *= 0.85; // Decay quickly when paused
        return s.pulseValue;
      }

      // Smooth interpolation between the 100ms updates from the player
      const playerTimeSec = playbackState.positionMs / 1000;
      
      // If we seeked or got out of sync by more than 0.5s, hard reset
      if (Math.abs(s.localTimeSec - playerTimeSec) > 0.5) {
        s.localTimeSec = playerTimeSec;
      } else {
        s.localTimeSec += delta; // Smooth tick
      }
      
      // Track edge fading logic (fade out pulse in first 5s and last 10s)
      const durationSec = playbackState.durationMs / 1000;
      let edgeFade = 1.0;
      if (durationSec > 30) { // Only apply to full songs
        if (s.localTimeSec < 5) {
          edgeFade = s.localTimeSec / 5; // fade in 0->1
        } else if (durationSec - s.localTimeSec < 10) {
          edgeFade = Math.max(0, (durationSec - s.localTimeSec) / 10); // fade out 1->0
        }
      }

      // ── The Core Math Engine ──
      const beatsPerSecond = bpm / 60;
      const beatPhase = (s.localTimeSec * beatsPerSecond) % 1.0;

      // Create a sharp, decaying transient mimicking a kick drum
      let rawPulse = Math.pow(1.0 - beatPhase, 3.0);

      // Add "organic" noise so every beat hits slightly differently
      // We use the current beat number to seed a pseudo-random hash
      const currentBeat = Math.floor(s.localTimeSec * beatsPerSecond);
      const randomIntensity = 0.5 + 0.5 * Math.abs(Math.sin(currentBeat * 13.37 + 4.2));

      s.pulseValue = rawPulse * randomIntensity * edgeFade * playbackState.volume;
    }

    return s.pulseValue;
  };

  return { update };
}
