"use client";

import { useSpotifyPlayer } from "./useSpotifyPlayer";
import { useLocalPlayer, AudioReactivityData } from "./useLocalPlayer";
import { useAudioSynthesizer } from "./useAudioSynthesizer";
import { useChillSynthesizer } from "./useChillSynthesizer";
import type { SpotifyPlayerState, SpotifyPlayerControls } from "./useSpotifyPlayer";
import { useCallback } from "react";

export function useActivePlayer(
  isLoggedIn: boolean,
  mood: "chill" | "energy" | "focus"
): {
  state: SpotifyPlayerState;
  controls: SpotifyPlayerControls;
  isLocal: boolean;
  getAudioData?: () => AudioReactivityData | null;
} {
  const spotify = useSpotifyPlayer(isLoggedIn);
  const local = useLocalPlayer(mood, !isLoggedIn);

  // Run the standard heavy synth only for Energy/Focus
  const baseSynthData = useAudioSynthesizer({
    isPlaying: isLoggedIn && !spotify.state.isPaused && mood !== "chill",
    progressMs: spotify.state.positionMs,
  });

  // Run the sparse, random synth only for Chill
  const chillSynthData = useChillSynthesizer({
    isPlaying: isLoggedIn && !spotify.state.isPaused && mood === "chill",
  });

  // Dynamically pass the correct audio data to the visualizers
  const activeSynthData = mood === "chill" ? chillSynthData : baseSynthData;
  const getSpotifyAudioData = useCallback(() => activeSynthData, [activeSynthData]);

  if (isLoggedIn) {
    return {
      state: spotify.state,
      controls: spotify.controls,
      isLocal: false,
      getAudioData: getSpotifyAudioData,
    };
  }

  return {
    state: local.state,
    controls: local.controls,
    isLocal: true,
    getAudioData: local.getAudioData,
  };
}
