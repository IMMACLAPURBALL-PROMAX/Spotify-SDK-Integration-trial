import { useState, useEffect } from "react";
import { getStoredAccessToken } from "@/lib/spotify-auth";

export interface SpotifyAudioAnalysis {
  segments: {
    start: number; // in seconds
    duration: number; // in seconds
    loudness_start: number;
    loudness_max: number;
    loudness_max_time: number;
    loudness_end: number;
    pitches: number[]; // 12 values from 0.0 to 1.0
    timbre: number[]; // 12 values
  }[];
  beats: {
    start: number;
    duration: number;
    confidence: number;
  }[];
}

const analysisCache = new Map<string, SpotifyAudioAnalysis>();

export function useSpotifyAudioAnalysis(trackId: string | null | undefined) {
  const [analysis, setAnalysis] = useState<SpotifyAudioAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!trackId) {
      setAnalysis(null);
      return;
    }

    if (analysisCache.has(trackId)) {
      setAnalysis(analysisCache.get(trackId)!);
      return;
    }

    let isMounted = true;

    const fetchAnalysis = async () => {
      const token = getStoredAccessToken();
      if (!token) return;

      setIsLoading(true);
      try {
        const response = await fetch(`https://api.spotify.com/v1/audio-analysis/${trackId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        
        if (!response.ok) {
          throw new Error("Failed to fetch audio analysis");
        }

        const data = await response.json();
        
        if (!isMounted) return;

        const analysisData = {
          segments: data.segments,
          beats: data.beats,
        };

        analysisCache.set(trackId, analysisData);
        setAnalysis(analysisData);
      } catch (error) {
        console.error("Error fetching Spotify audio analysis:", error);
        if (isMounted) setAnalysis(null);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchAnalysis();

    return () => {
      isMounted = false;
    };
  }, [trackId]);

  return { analysis, isLoading };
}
