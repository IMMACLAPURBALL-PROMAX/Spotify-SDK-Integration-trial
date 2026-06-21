/**
 * Spotify Web Playback SDK type declarations.
 * These describe the global objects that the SDK script injects.
 */

interface Window {
  onSpotifyWebPlaybackSDKReady: (() => void) | undefined;
  Spotify: typeof Spotify;
}

declare namespace Spotify {
  interface PlayerOptions {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
  }

  interface Track {
    uri: string;
    id: string | null;
    type: "track" | "episode" | "ad";
    media_type: "audio" | "video";
    name: string;
    is_playable: boolean;
    album: {
      uri: string;
      name: string;
      images: Array<{ url: string; height: number; width: number }>;
    };
    artists: Array<{ uri: string; name: string }>;
    duration_ms: number;
  }

  interface PlaybackState {
    context: {
      uri: string | null;
      metadata: Record<string, unknown> | null;
    };
    disallows: {
      pausing: boolean;
      peeking_next: boolean;
      peeking_prev: boolean;
      resuming: boolean;
      seeking: boolean;
      skipping_next: boolean;
      skipping_prev: boolean;
    };
    duration: number;
    paused: boolean;
    position: number;
    repeat_mode: 0 | 1 | 2;
    shuffle: boolean;
    track_window: {
      current_track: Track;
      previous_tracks: Track[];
      next_tracks: Track[];
    };
  }

  interface WebPlaybackError {
    message: string;
  }

  class Player {
    constructor(options: PlayerOptions);
    connect(): Promise<boolean>;
    disconnect(): void;
    addListener(
      event: "ready",
      cb: (data: { device_id: string }) => void
    ): void;
    addListener(
      event: "not_ready",
      cb: (data: { device_id: string }) => void
    ): void;
    addListener(
      event: "player_state_changed",
      cb: (state: PlaybackState | null) => void
    ): void;
    addListener(
      event: "initialization_error" | "authentication_error" | "account_error" | "playback_error",
      cb: (error: WebPlaybackError) => void
    ): void;
    removeListener(event: string): void;
    getCurrentState(): Promise<PlaybackState | null>;
    setName(name: string): Promise<void>;
    getVolume(): Promise<number>;
    setVolume(volume: number): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    togglePlay(): Promise<void>;
    seek(positionMs: number): Promise<void>;
    previousTrack(): Promise<void>;
    nextTrack(): Promise<void>;
  }
}
