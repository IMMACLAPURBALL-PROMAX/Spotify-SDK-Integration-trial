import { useEffect, useRef, useState } from 'react';
import type { SynthesizedAudioData } from './useAudioSynthesizer';

interface UseChillSynthesizerProps {
  isPlaying: boolean;
}

export function useChillSynthesizer({
  isPlaying,
}: UseChillSynthesizerProps): SynthesizedAudioData {
  const [audioData, setAudioData] = useState<SynthesizedAudioData>({
    subBass: 0,
    bass: 0,
    mid: 0,
    high: 0,
    impact: 0,
  });

  const requestRef = useRef<number>(0);
  const lastTriggerMsRef = useRef<number>(0);
  const nextTriggerMsRef = useRef<number>(0);
  const lastBassTriggerMsRef = useRef<number>(0);
  const nextBassTriggerMsRef = useRef<number>(0);

  useEffect(() => {
    if (!isPlaying) {
      setAudioData({ subBass: 0, bass: 0, mid: 0, high: 0, impact: 0 });
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      return;
    }

    const animate = (time: number) => {
      let isImpact = false;
      
      // Initialize timers on first frame
      if (nextTriggerMsRef.current === 0) {
        nextTriggerMsRef.current = time + 500;
        nextBassTriggerMsRef.current = time + 2000;
      }

      // Sparkles Timer (0.5s - 1.5s)
      if (time >= nextTriggerMsRef.current) {
        isImpact = true;
        lastTriggerMsRef.current = time;
        nextTriggerMsRef.current = time + 500 + Math.random() * 1000;
      }

      // Independent Sub-Bass Timer (2.0s - 4.0s)
      if (time >= nextBassTriggerMsRef.current) {
        lastBassTriggerMsRef.current = time;
        nextBassTriggerMsRef.current = time + 2000 + Math.random() * 2000;
      }

      const timeSinceTrigger = time - lastTriggerMsRef.current;
      const timeSinceBassTrigger = time - lastBassTriggerMsRef.current;
      
      // Sparkle Decay
      let pulseDecay = 0;
      if (timeSinceTrigger < 50) {
        pulseDecay = 1.0;
      } else if (timeSinceTrigger < 450) {
        pulseDecay = 1.0 - (timeSinceTrigger - 50) / 400.0;
      }

      // Sub-Bass Decay (heavy punch that fades out over 600ms)
      let bassPulseDecay = 0;
      if (timeSinceBassTrigger < 50) {
        bassPulseDecay = 1.0;
      } else if (timeSinceBassTrigger < 650) {
        bassPulseDecay = 1.0 - (timeSinceBassTrigger - 50) / 600.0;
      }

      // Strong spike for sparkles
      const high = pulseDecay * 1.5; 

      // Massive sub-bass punch on its own independent timer!
      const subBass = 0.05 + bassPulseDecay * 0.9; 

      // Gentle, slow breathing for the normal bass (completes a full breath cycle every ~10 seconds)
      const slowBreath = Math.sin(time / 1500) * 0.5 + 0.5;
      const bass = 0.15 + slowBreath * 0.2;
      // Gentle subtle warmth for the mid ranges
      const mid = 0.4 + (isImpact ? 0.2 : 0);

      // Mild organic jitter
      const jitter = (val: number) => val + (Math.random() * 0.02 - 0.01);

      setAudioData({
        subBass: Math.min(1, Math.max(0, jitter(subBass))),
        bass: Math.min(1, Math.max(0, jitter(bass))),
        mid: Math.min(1, Math.max(0, jitter(mid))),
        high: Math.min(1, Math.max(0, jitter(high))),
        impact: isImpact ? 1 : 0,
      });

      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isPlaying]);

  return audioData;
}
