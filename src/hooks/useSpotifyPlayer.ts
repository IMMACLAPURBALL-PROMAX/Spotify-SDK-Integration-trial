/**
 * React hook for integrating the Spotify Web Playback SDK.
 *
 * Handles:
 * - Loading the SDK script
 * - Creating and connecting a Player instance
 * - Listening to playback state changes
 * - Exposing current track info, play/pause state, and controls
 */

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getStoredAccessToken } from "@/lib/spotify-auth";

export interface SpotifyTrackInfo {
  id: string | null;
  name: string;
  primaryArtist: string;
  featuredArtists: string[];
  albumName: string;
  albumArtUrl: string; // Largest available image
  durationMs: number;
}

export interface SpotifyPlayerState {
  /** Info about the currently playing track, or null if nothing is playing. */
  currentTrack: SpotifyTrackInfo | null;
  /** True when playback is paused. */
  isPaused: boolean;
  /** Current playback position in milliseconds. */
  positionMs: number;
  /** The SDK player's device ID (needed to transfer playback). */
  deviceId: string | null;
  /** Whether the SDK is connected and ready. */
  isReady: boolean;
  /** Current volume level (0.0 to 1.0). */
  volume: number;
  /** URL of the next track's album art in the queue (for hover preview). */
  nextTrackArtUrl: string | null;
}

export interface SpotifyPlayerControls {
  skipToNext: () => Promise<void>;
  skipToPrevious: () => Promise<void>;
  togglePlay: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
}

// Load the SDK script once globally
let sdkScriptLoaded = false;
function loadSpotifySDKScript(): Promise<void> {
  if (sdkScriptLoaded) return Promise.resolve();
  return new Promise((resolve) => {
    if (document.getElementById("spotify-sdk-script")) {
      sdkScriptLoaded = true;
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.id = "spotify-sdk-script";
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;

    // The SDK calls window.onSpotifyWebPlaybackSDKReady when it's loaded
    window.onSpotifyWebPlaybackSDKReady = () => {
      sdkScriptLoaded = true;
      resolve();
    };

    document.body.appendChild(script);
  });
}

export function useSpotifyPlayer(): {
  state: SpotifyPlayerState;
  controls: SpotifyPlayerControls;
} {
  const playerRef = useRef<Spotify.Player | null>(null);
  const [state, setState] = useState<SpotifyPlayerState>({
    currentTrack: null,
    isPaused: true,
    positionMs: 0,
    deviceId: null,
    isReady: false,
    volume: 0.5,
    nextTrackArtUrl: null,
  });

  // Extract track info from the SDK state object
  const extractTrackInfo = useCallback(
    (track: Spotify.Track): SpotifyTrackInfo => {
      const images = track.album.images;
      // Pick the largest image (first in array is usually largest)
      const artUrl = images.length > 0 ? images[0].url : "";
      return {
        id: track.id,
        name: track.name.replace(/\s*(?:\(|\[|-)?\s*(?:feat\.?|featuring|with)\s+.*?(?:\)|\])?$/i, "").trim(),
        primaryArtist: track.artists.length > 0 ? track.artists[0].name : "Unknown Artist",
        featuredArtists: track.artists.length > 1 ? track.artists.slice(1).map(a => a.name) : [],
        albumName: track.album.name,
        albumArtUrl: artUrl,
        durationMs: track.duration_ms,
      };
    },
    []
  );

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) return; // Not logged in — don't initialize

    let disposed = false;

    async function init() {
      await loadSpotifySDKScript();
      if (disposed) return;

      const player = new window.Spotify.Player({
        name: "SpotifyxStudio",
        getOAuthToken: (cb) => {
          const t = getStoredAccessToken();
          cb(t || "");
        },
        volume: 0.5,
      });

      playerRef.current = player;

      // ── Error listeners ──
      player.addListener("initialization_error", ({ message }) => {
        console.error("[Spotify Player] Init error:", message);
      });
      player.addListener("authentication_error", ({ message }) => {
        console.error("[Spotify Player] Auth error:", message);
      });
      player.addListener("account_error", ({ message }) => {
        console.error("[Spotify Player] Account error (Premium required):", message);
      });
      player.addListener("playback_error", ({ message }) => {
        console.error("[Spotify Player] Playback error:", message);
      });

      // ── Ready ──
      player.addListener("ready", ({ device_id }) => {
        console.log("[Spotify Player] ✅ Ready. Device ID:", device_id);
        setState((prev) => ({ ...prev, deviceId: device_id, isReady: true }));

        // Transfer playback to this device so we get state events
        const accessToken = getStoredAccessToken();
        if (accessToken) {
          fetch("https://api.spotify.com/v1/me/player", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              device_ids: [device_id],
              play: false, // Don't auto-play, just transfer
            }),
          }).catch((err) =>
            console.error("[Spotify Player] Failed to transfer playback:", err)
          );
        }
      });

      player.addListener("not_ready", ({ device_id }) => {
        console.log("[Spotify Player] Device went offline:", device_id);
        setState((prev) => ({ ...prev, isReady: false }));
      });

      // ── State Change ──
      player.addListener("player_state_changed", (playerState) => {
        if (!playerState) {
          setState((prev) => ({ ...prev, currentTrack: null, nextTrackArtUrl: null }));
          return;
        }

        const trackInfo = extractTrackInfo(playerState.track_window.current_track);
        
        // Find the next track's art url
        const nextTracks = playerState.track_window.next_tracks;
        let nextArtUrl = null;
        if (nextTracks && nextTracks.length > 0) {
          const imgs = nextTracks[0].album.images;
          if (imgs && imgs.length > 0) {
            nextArtUrl = imgs[0].url;
          }
        }

        setState((prev) => ({
          ...prev,
          currentTrack: trackInfo,
          isPaused: playerState.paused,
          positionMs: playerState.position,
          nextTrackArtUrl: nextArtUrl,
        }));
      });

      // Connect!
      const connected = await player.connect();
      if (connected) {
        console.log("[Spotify Player] Connected successfully.");
      } else {
        console.error("[Spotify Player] Failed to connect.");
      }
    }

    init();

    return () => {
      disposed = true;
      if (playerRef.current) {
        playerRef.current.disconnect();
        playerRef.current = null;
      }
    };
  }, [extractTrackInfo]);

  // ── Controls ──
  const skipToNext = useCallback(async () => {
    if (playerRef.current) {
      await playerRef.current.nextTrack();
    }
  }, []);

  const skipToPrevious = useCallback(async () => {
    if (playerRef.current) {
      await playerRef.current.previousTrack();
    }
  }, []);

  const togglePlay = useCallback(async () => {
    if (playerRef.current) {
      await playerRef.current.togglePlay();
    }
  }, []);

  const seek = useCallback(async (positionMs: number) => {
    if (playerRef.current) {
      await playerRef.current.seek(positionMs);
    }
  }, []);

  const setVolume = useCallback(async (volume: number) => {
    if (playerRef.current) {
      await playerRef.current.setVolume(volume);
      setState((prev) => ({ ...prev, volume }));
    }
  }, []);

  return {
    state,
    controls: { skipToNext, skipToPrevious, togglePlay, seek, setVolume },
  };
}
