import React, { useState, useEffect } from "react";

export function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

interface PlayerCardProps {
  playerState: any;
  controls: any;
  isPlayerActive: boolean;
  isLocal: boolean;
  currentSlideIndex: number;
  staticImages: string[];
  staticTrackData: any[];
}

export function PlayerCard({
  playerState,
  controls,
  isPlayerActive,
  isLocal,
  currentSlideIndex,
  staticImages,
  staticTrackData,
}: PlayerCardProps) {
  // Playback slider dragging state (Moved from page.tsx!)
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [dragProgressMs, setDragProgressMs] = useState(0);

  // ── Playback slider seek event handlers ──
  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setDragProgressMs(val);
    if (!isDraggingProgress) {
      setIsDraggingProgress(true);
    }
  };

  const handleProgressMouseDown = () => {
    setIsDraggingProgress(true);
    setDragProgressMs(isPlayerActive && playerState.currentTrack ? playerState.positionMs : 0);
  };

  const handleProgressMouseUp = () => {
    setIsDraggingProgress(false);
    if (isPlayerActive) {
      controls.seek(dragProgressMs);
    }
  };

  // ── Playback timeline binding calculations ──
  const maxDurationMs = isPlayerActive && playerState.currentTrack ? playerState.currentTrack.durationMs : 182000;
  const currentPosMs = isDraggingProgress 
    ? dragProgressMs 
    : (isPlayerActive ? playerState.positionMs : 0);

  const displayProgressPercent = isPlayerActive && maxDurationMs > 0
    ? `${(currentPosMs / maxDurationMs) * 100}%`
    : (staticTrackData[currentSlideIndex]?.progress || "0%");

  const displayTimeStart = isPlayerActive
    ? formatMs(currentPosMs)
    : (staticTrackData[currentSlideIndex]?.time || "0:00");

  const displayTimeEnd = isPlayerActive && playerState.currentTrack
    ? formatMs(playerState.currentTrack.durationMs)
    : (staticTrackData[currentSlideIndex]?.duration || "3:02");

  const nowPlayingLabel = isPlayerActive
    ? (playerState.isPaused ? "PAUSED" : (isLocal ? "LOCAL AUDIO" : "NOW PLAYING"))
    : "NOW PLAYING";

  return (
    <div id="heroright" onClick={(e) => e.stopPropagation()}>
      <p>{nowPlayingLabel}</p>

      <div className="imagediv">
        <img src="/images/cover1.jpg" className="album-card" alt="Deck Card 1" />
        <img src="/images/cover2.jpg" className="album-card" alt="Deck Card 2" />
        <img src="/images/cover3.jpg" className="album-card" alt="Deck Card 3" />
        <img src="/images/cover4.jpg" className="album-card" alt="Deck Card 4" />
        <img src="/images/cover5.jpg" className="album-card" alt="Deck Card 5" />
      </div>

      <div className="player-meta">
        <h3 className="track-title">{isPlayerActive ? (playerState.currentTrack?.name || "Loading...") : (staticTrackData[currentSlideIndex]?.title || "Unknown")}</h3>
        <p className="artist-name">{isPlayerActive ? (playerState.currentTrack?.primaryArtist || "Unknown") : (staticTrackData[currentSlideIndex]?.artist || "Unknown")}</p>
      </div>

      <div className="playback-timeline">
        <span className="time-stamp">{displayTimeStart}</span>
        <div className="progress-slider-container">
          <input 
            type="range"
            className="progress-slider"
            min="0"
            max={maxDurationMs}
            value={currentPosMs}
            style={{ backgroundSize: `${displayProgressPercent} 100%` }}
            onChange={handleProgressChange}
            onMouseDown={handleProgressMouseDown}
            onMouseUp={handleProgressMouseUp}
            onTouchStart={handleProgressMouseDown}
            onTouchEnd={handleProgressMouseUp}
          />
        </div>
        <span className="time-stamp">{displayTimeEnd}</span>
      </div>

      <div className="player-controls">
        <button className="control-btn secondary-btn" aria-label="Shuffle" onClick={e => e.stopPropagation()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>
        </button>

        <button className="control-btn" id="prev-track" aria-label="Previous Track"
          onClick={(e) => { e.stopPropagation(); if (isPlayerActive) controls.skipToPrevious(); }}>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
        </button>

        <button className="control-btn master-play" id="play-trigger" aria-label={playerState.isPaused ? "Play Track" : "Pause Track"}
          onClick={(e) => { e.stopPropagation(); if (isPlayerActive) controls.togglePlay(); }}>
          {playerState.isPaused ? (
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
          )}
        </button>

        <button className="control-btn" id="next-track" aria-label="Next Track"
          onClick={(e) => { e.stopPropagation(); if (isPlayerActive) controls.skipToNext(); }}>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6zm9-12h2v12h-2z" /></svg>
        </button>

        <button className="control-btn secondary-btn" aria-label="Repeat" onClick={e => e.stopPropagation()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>
        </button>
      </div>
    </div>
  );
}
