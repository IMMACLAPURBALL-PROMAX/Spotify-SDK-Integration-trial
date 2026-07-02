import { useRef } from "react";
import archetypeData from "../data/archetype_a.json";

export interface PlaybackState {
  positionMs: number;
  isPaused: boolean;
  volume: number;
  durationMs: number;
}

export function useArchetypePulse() {
  const stateRef = useRef({
    localTimeSec: 0,
    pulseValue: 0,
  });

  const update = (delta: number, playbackState: PlaybackState | null) => {
    const s = stateRef.current;
    if (!playbackState) {
      s.localTimeSec += delta;
    } else {
      if (playbackState.isPaused) {
        s.pulseValue *= 0.85;
        return s.pulseValue;
      }
      const playerTimeSec = playbackState.positionMs / 1000;
      if (Math.abs(s.localTimeSec - playerTimeSec) > 0.5) {
        s.localTimeSec = playerTimeSec;
      } else {
        s.localTimeSec += delta;
      }

      const bpm = archetypeData.average_bpm;
      const transientRateSec = archetypeData.transient_density_ms / 1000;
      
      const beatsPerSecond = bpm / 60;
      const beatPhase = (s.localTimeSec * beatsPerSecond) % 1.0;
      
      // 1. Heavy Kick (Sub-Bass) Drop
      // The larger the sub_bass_weight in the JSON, the more explosive the kick
      const kickPulse = Math.pow(1.0 - beatPhase, 3.0) * archetypeData.sub_bass_weight * 3.0;
      
      // 2. High Frequency Transients (Drill Hi-Hats / Snares)
      // Rapid, erratic ticks running at exactly the transient_density speed
      const transientPhase = (s.localTimeSec / transientRateSec) % 1.0;
      const hihatPulse = Math.pow(1.0 - transientPhase, 4.0) * 0.4;

      // 3. Energy Section Mapping
      // Alternate between verse intensity and drop intensity every 16 bars
      let currentIntensity = archetypeData.energy_sections[0].intensity;
      const currentBar = Math.floor((s.localTimeSec * beatsPerSecond) / 4);
      if (currentBar % 32 >= 16) {
        currentIntensity = archetypeData.energy_sections[1].intensity; // Drop section
      }

      // Combine math - Only use the heavy kick for the main background pulse to avoid a strobe effect
      s.pulseValue = kickPulse * currentIntensity * playbackState.volume;
    }
    return s.pulseValue;
  };

  return { update };
}
