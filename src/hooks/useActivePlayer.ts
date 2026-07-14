"use client";

import { useSpotifyPlayer } from "./useSpotifyPlayer";
import { useLocalPlayer, AudioReactivityData } from "./useLocalPlayer";
import type { SpotifyPlayerState, SpotifyPlayerControls } from "./useSpotifyPlayer";

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

  if (isLoggedIn) {
    return {
      state: spotify.state,
      controls: spotify.controls,
      isLocal: false,
    };
  }

  return {
    state: local.state,
    controls: local.controls,
    isLocal: true,
    getAudioData: local.getAudioData,
  };
}
