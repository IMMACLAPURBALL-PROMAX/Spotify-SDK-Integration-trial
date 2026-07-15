"use client";

import { useSpotifyPlayer } from "./useSpotifyPlayer";
import { useLocalPlayer, AudioReactivityData } from "./useLocalPlayer";
import { useAudioSynthesizer } from "./useAudioSynthesizer";
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

  // Generate simulated audio data for Spotify
  const synthData = useAudioSynthesizer({
    isPlaying: isLoggedIn && !spotify.state.isPaused,
    progressMs: spotify.state.positionMs,
  });

  const getSpotifyAudioData = useCallback(() => synthData, [synthData]);

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
