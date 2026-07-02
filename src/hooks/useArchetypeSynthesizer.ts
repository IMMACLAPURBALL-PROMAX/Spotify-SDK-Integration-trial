import { useEffect, useRef, useState } from 'react';

export interface EnergySection {
  type: string;
  intensity: number;
  duration_bars: number;
}

export interface ArchetypeProfile {
  archetype_id: string;
  average_bpm: number;
  transient_density_ms: number;
  sub_bass_weight: number;
  energy_sections: EnergySection[];
}

export interface SynthesizedAudioData {
  subBass: number;
  bass: number;
  mid: number;
  high: number;
  impact: boolean;
}

interface UseArchetypeSynthesizerProps {
  archetype: ArchetypeProfile | null;
  isPlaying: boolean;
  /** Optional sync source from Spotify playback state. If not provided, uses internal timer. */
  progressMs?: number; 
}

export function useArchetypeSynthesizer({
  archetype,
  isPlaying,
  progressMs = 0,
}: UseArchetypeSynthesizerProps): SynthesizedAudioData {
  const [audioData, setAudioData] = useState<SynthesizedAudioData>({
    subBass: 0,
    bass: 0,
    mid: 0,
    high: 0,
    impact: false,
  });

  const requestRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const lastTransientTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!isPlaying || !archetype) {
      setAudioData({ subBass: 0, bass: 0, mid: 0, high: 0, impact: false });
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      return;
    }

    const msPerBeat = (60 / archetype.average_bpm) * 1000;
    // Calculate total duration of one full structural cycle (verse + drop)
    const cycleBars = archetype.energy_sections.reduce((acc, sec) => acc + sec.duration_bars, 0);
    const msPerBar = msPerBeat * 4; // Assuming 4/4 time signature
    const cycleMs = cycleBars * msPerBar;

    const animate = (time: number) => {
      if (startTimeRef.current === 0) {
        startTimeRef.current = time;
      }

      // Use either the provided progressMs (e.g. from Spotify) or fallback to internal timer
      const elapsedMs = progressMs > 0 ? progressMs : time - startTimeRef.current;

      // 1. Determine current section intensity (are we in a verse or a drop?)
      const positionInCycle = elapsedMs % cycleMs;
      let currentSectionIntensity = 0.5; // fallback
      let accumulatedMs = 0;
      
      for (const section of archetype.energy_sections) {
        const sectionMs = section.duration_bars * msPerBar;
        if (positionInCycle >= accumulatedMs && positionInCycle < accumulatedMs + sectionMs) {
          currentSectionIntensity = section.intensity;
          break;
        }
        accumulatedMs += sectionMs;
      }

      // 2. Synthesize transients / impact
      let isImpact = false;
      const timeSinceLastTransient = elapsedMs - lastTransientTimeRef.current;
      
      // We use the transient_density_ms, but slightly randomize it or snap to beat
      // For a more rhythmic feel, we'll pulse on the beat if we're near it
      const beatPhase = (elapsedMs % msPerBeat) / msPerBeat;
      
      // Impact logic: If enough time has passed and we are on a strong beat (phase < 0.1)
      if (timeSinceLastTransient >= archetype.transient_density_ms && beatPhase < 0.1) {
        isImpact = true;
        lastTransientTimeRef.current = elapsedMs;
      }

      // Decay variables for smoothness (so visuals don't just snap)
      // Pulse shape: quick attack, exponential decay based on beatPhase
      const pulseDecay = Math.max(0, 1 - beatPhase * 2); // Drops to 0 halfway through the beat

      // Base levels modified by the current section's intensity
      const baseIntensity = currentSectionIntensity;
      
      // Sub-bass relies heavily on the archetype's sub_bass_weight
      const subBass = baseIntensity * archetype.sub_bass_weight * (pulseDecay * 0.8 + 0.2);
      const bass = baseIntensity * (pulseDecay * 0.7 + 0.3);
      
      // Mids and highs are more constant but still follow the beat a bit
      const mid = baseIntensity * 0.6 + (isImpact ? 0.4 : 0);
      const high = baseIntensity * 0.4 + (isImpact ? 0.6 : 0);

      // Random jitter to make it feel organic, not strictly mathematical
      const jitter = (val: number) => val + (Math.random() * 0.05 - 0.025);

      setAudioData({
        subBass: Math.min(1, Math.max(0, jitter(subBass))),
        bass: Math.min(1, Math.max(0, jitter(bass))),
        mid: Math.min(1, Math.max(0, jitter(mid))),
        high: Math.min(1, Math.max(0, jitter(high))),
        impact: isImpact,
      });

      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [archetype, isPlaying, progressMs]);

  return audioData;
}
