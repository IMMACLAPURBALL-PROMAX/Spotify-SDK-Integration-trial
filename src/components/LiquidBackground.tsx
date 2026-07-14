"use client";

import React, { useRef, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { useTrackTextures } from "@/hooks/useTrackTextures";
import { ChillScene } from "./moods/ChillScene";
import { EnergyScene } from "./moods/EnergyScene";
import { FocusScene } from "./moods/FocusScene";
import type { AccessibilitySettings } from "@/contexts/AccessibilityContext";

// ──────────────────────────────────────────
//  R3F Scene Component Orchestrator
// ──────────────────────────────────────────

interface LiquidBackgroundSceneProps {
  currentTrackUrl: string;
  hoverTrackUrl: string | null;
  mood: "chill" | "energy" | "focus";
  mouseTarget: React.MutableRefObject<THREE.Vector2>;
  hoverActive: boolean;
  playbackState: any;
  boostValues: { bass: number; mids: number; highs: number };
  accessibility?: AccessibilitySettings;
}

function LiquidBackgroundScene({
  currentTrackUrl,
  hoverTrackUrl,
  mood,
  mouseTarget,
  hoverActive,
  playbackState,
  boostValues,
  accessibility,
}: LiquidBackgroundSceneProps) {
  // Centralized texture loading and GSAP transition state
  const textures = useTrackTextures(currentTrackUrl, hoverTrackUrl, hoverActive);

  return (
    <>
      {mood === "chill" && (
        <ChillScene textures={textures} mouseTarget={mouseTarget} hoverActive={hoverActive} playbackState={playbackState} boostValues={boostValues} accessibility={accessibility} />
      )}
      {mood === "energy" && (
        <EnergyScene textures={textures} mouseTarget={mouseTarget} hoverActive={hoverActive} playbackState={playbackState} boostValues={boostValues} accessibility={accessibility} />
      )}
      {mood === "focus" && (
        <FocusScene textures={textures} mouseTarget={mouseTarget} hoverActive={hoverActive} playbackState={playbackState} boostValues={boostValues} accessibility={accessibility} />
      )}
    </>
  );
}

// ──────────────────────────────────────────
//  Main Exported Component
// ──────────────────────────────────────────

interface LiquidBackgroundProps {
  currentTrackUrl: string;
  hoverTrackUrl: string | null;
  mood: "chill" | "energy" | "focus";
  playbackState?: any;
  boostValues: { bass: number; mids: number; highs: number };
  accessibility?: AccessibilitySettings;
}

export function LiquidBackground({
  currentTrackUrl,
  hoverTrackUrl,
  mood,
  playbackState,
  boostValues,
  accessibility,
}: LiquidBackgroundProps) {
  const mouseTarget = useRef(new THREE.Vector2(0.5, 0.5));
  const [hoverActive, setHoverActive] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = 1.0 - (e.clientY - rect.top) / rect.height;
    mouseTarget.current.set(x, y);
  };

  const onMouseEnter = () => {
    if (hoverTrackUrl) setHoverActive(true);
  };

  const onMouseLeave = () => {
    setHoverActive(false);
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        zIndex: -1,
        pointerEvents: "auto",
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <Canvas
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        dpr={[1, 2]}
        camera={{ position: [0, 0, 1] }}
        style={{ width: "100%", height: "100%", position: "absolute" }}
      >
        <LiquidBackgroundScene
          currentTrackUrl={currentTrackUrl}
          hoverTrackUrl={hoverTrackUrl}
          mood={mood}
          mouseTarget={mouseTarget}
          hoverActive={hoverActive}
          playbackState={playbackState}
          boostValues={boostValues}
          accessibility={accessibility}
        />
      </Canvas>
    </div>
  );
}

export default LiquidBackground;
