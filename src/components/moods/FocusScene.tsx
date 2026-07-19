"use client";

import React, { useRef, useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { TrackTextures } from "@/hooks/useTrackTextures";
import { useSyntheticPulse, PlaybackState } from "@/hooks/useSyntheticPulse";
import type { AccessibilitySettings } from "@/contexts/AccessibilityContext";

// ──────────────────────────────────────────
//  Props
// ──────────────────────────────────────────

interface FocusSceneProps {
  textures: TrackTextures;
  mouseTarget: React.MutableRefObject<THREE.Vector2>;
  hoverActive: boolean;
  playbackState?: PlaybackState | null;
  boostValues: { bass: number; mids: number; highs: number };
  accessibility?: AccessibilitySettings;
}

// ──────────────────────────────────────────
//  Fallback 1×1 transparent texture
// ──────────────────────────────────────────

const fallbackTex = (() => {
  const t = new THREE.DataTexture(
    new Uint8Array([0, 0, 0, 0]),
    1,
    1,
    THREE.RGBAFormat
  );
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
})();

// ──────────────────────────────────────────
//  GLSL – Vertex Shader
// ──────────────────────────────────────────

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// ──────────────────────────────────────────
//  GLSL – Fragment Shader
//
//  Single clean album art with:
//  - Slight desaturation (muted, calm feel)
//  - Strong vignette (draws the eye inward)
// ──────────────────────────────────────────

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform sampler2D uTexture1;
  uniform sampler2D uTexture2;
  uniform float uProgress;
  uniform vec2 uResolution;
  uniform vec2 uImageRes1;
  uniform vec2 uImageRes2;

  vec2 coverUv(vec2 uv, vec2 imgRes, vec2 screenRes) {
    float screenAspect = screenRes.x / screenRes.y;
    float imgAspect = imgRes.x / imgRes.y;
    vec2 scale = vec2(1.0);
    if (screenAspect > imgAspect) {
      scale.y = imgAspect / screenAspect;
    } else {
      scale.x = screenAspect / imgAspect;
    }
    return (uv - 0.5) * scale + 0.5;
  }

  void main() {
    vec2 uv1 = coverUv(vUv, uImageRes1, uResolution);
    vec2 uv2 = coverUv(vUv, uImageRes2, uResolution);

    vec4 tex1 = texture2D(uTexture1, uv1);
    vec4 tex2 = texture2D(uTexture2, uv2);
    vec4 color = mix(tex1, tex2, uProgress);

    // Desaturation — muted, calm colors
    float lum = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
    vec3 desat = mix(color.rgb, vec3(lum), 0.55);
    desat *= 0.45;

    // Vignette — strong, draws the eye to center
    float dist = length(vUv - 0.5) * 1.414;
    float vig = smoothstep(0.15, 1.1, dist);
    desat *= 1.0 - vig * 0.6;

    gl_FragColor = vec4(desat, 1.0);
  }
`;

// ──────────────────────────────────────────
//  Album Art Plane (Single, clean, no layers)
// ──────────────────────────────────────────

function FocusArtPlane({ textures }: { textures: TrackTextures }) {
  const { width, height } = useThree((s) => s.viewport);
  const size = useThree((s) => s.size);
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTexture1: { value: fallbackTex },
      uTexture2: { value: fallbackTex },
      uProgress: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uImageRes1: { value: new THREE.Vector2(1, 1) },
      uImageRes2: { value: new THREE.Vector2(1, 1) },
    }),
    []
  );

  useFrame(() => {
    const mat = materialRef.current;
    const mesh = meshRef.current;
    if (!mat || !mesh) return;

    mat.uniforms.uResolution.value.set(size.width, size.height);
    mat.uniforms.uTexture1.value = textures.texture1Ref.current ?? fallbackTex;
    mat.uniforms.uTexture2.value = textures.texture2Ref.current ?? fallbackTex;
    mat.uniforms.uProgress.value = textures.progress.value;
    mat.uniforms.uImageRes1.value.copy(textures.imageRes1);
    mat.uniforms.uImageRes2.value.copy(textures.imageRes2);

    // The image does not move. Just scale to fill the viewport.
    mesh.scale.set(width, height, 1);
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

// ──────────────────────────────────────────
//  Geometric Frame (thin rectangular outline)
// ──────────────────────────────────────────

function GeometricFrame({
  scale,
  zOffset,
  color,
  playbackState,
  reactive,
  boostValues,
  accessibility,
}: {
  scale: number;
  zOffset: number;
  color: string;
  playbackState?: any;
  reactive: boolean;
  boostValues: { bass: number; mids: number; highs: number };
  accessibility?: AccessibilitySettings;
}) {
  const { width, height } = useThree((s) => s.viewport);
  const lineRef = useRef<THREE.LineSegments>(null);
  const smoothBassRef = useRef(0);

  // Build a rectangle out of line segments
  const geometry = useMemo(() => {
    const hw = 0.5; // half-width
    const hh = 0.5; // half-height
    const points = [
      // Bottom edge
      -hw, -hh, 0, hw, -hh, 0,
      // Right edge
      hw, -hh, 0, hw, hh, 0,
      // Top edge
      hw, hh, 0, -hw, hh, 0,
      // Left edge
      -hw, hh, 0, -hw, -hh, 0,
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return geo;
  }, []);

  useFrame((state) => {
    const line = lineRef.current;
    if (!line) return;

    let bassValue = 0;
    if (reactive && playbackState && (playbackState as any).getAudioData) {
      const data = (playbackState as any).getAudioData();
      if (data) {
        bassValue = data.bass * boostValues.bass;
      }
    }

    // Smooth the bass for a gentle breath
    smoothBassRef.current += (bassValue - smoothBassRef.current) * 0.06;
    const audioBreath = (reactive && accessibility?.frameBreathing !== false) ? smoothBassRef.current * 0.015 : 0;

    // Brushed up wave interference math for gentle, organic morphing
    const time = state.clock.elapsedTime * 1000;
    const waveX = Math.sin(time / 2300) * 0.5 + 0.5; // 0 to 1
    const waveY = Math.sin(time / 3700) * 0.5 + 0.5; // 0 to 1
    const waveBreathX = (reactive && accessibility?.frameBreathing !== false) ? waveX * 0.02 : 0;
    const waveBreathY = (reactive && accessibility?.frameBreathing !== false) ? waveY * 0.02 : 0;

    const sx = width * scale + audioBreath + waveBreathX;
    const sy = height * scale + audioBreath + waveBreathY;
    line.scale.set(sx, sy, 1);
  });

  return (
    <lineSegments ref={lineRef} geometry={geometry} position={[0, 0, zOffset]}>
      <lineBasicMaterial color={color} transparent opacity={0.25} />
    </lineSegments>
  );
}

// ──────────────────────────────────────────
//  Synthetic Geometric Frame (Spotify mode — no Web Audio)
// ──────────────────────────────────────────

function SyntheticGeometricFrame({
  scale,
  zOffset,
  color,
  playbackState,
  reactive,
  boostValues,
  accessibility,
}: {
  scale: number;
  zOffset: number;
  color: string;
  playbackState?: PlaybackState | null;
  reactive: boolean;
  boostValues: { bass: number; mids: number; highs: number };
  accessibility?: AccessibilitySettings;
}) {
  const { width, height } = useThree((s) => s.viewport);
  const lineRef = useRef<THREE.LineSegments>(null);
  const smoothBassRef = useRef(0);
  const { update: updatePulse } = useSyntheticPulse(120);

  // Build a rectangle out of line segments
  const geometry = useMemo(() => {
    const hw = 0.5;
    const hh = 0.5;
    const points = [
      -hw, -hh, 0, hw, -hh, 0,
      hw, -hh, 0, hw, hh, 0,
      hw, hh, 0, -hw, hh, 0,
      -hw, hh, 0, -hw, -hh, 0,
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return geo;
  }, []);

  useFrame((state, delta) => {
    const line = lineRef.current;
    if (!line) return;

    let bassValue = 0;
    if (reactive) {
      const pulse = updatePulse(delta, playbackState || null);
      bassValue = pulse;
    }

    // Smooth the bass for a gentle breath
    smoothBassRef.current += (bassValue - smoothBassRef.current) * 0.06;
    const audioBreath = (reactive && accessibility?.frameBreathing !== false) ? smoothBassRef.current * 0.015 : 0;

    // Brushed up wave interference math for gentle, organic morphing
    const time = state.clock.elapsedTime * 1000;
    const waveX = Math.sin(time / 2300) * 0.5 + 0.5; // 0 to 1
    const waveY = Math.sin(time / 3700) * 0.5 + 0.5; // 0 to 1
    const waveBreathX = (reactive && accessibility?.frameBreathing !== false) ? waveX * 0.02 : 0;
    const waveBreathY = (reactive && accessibility?.frameBreathing !== false) ? waveY * 0.02 : 0;

    const sx = width * scale + audioBreath + waveBreathX;
    const sy = height * scale + audioBreath + waveBreathY;
    line.scale.set(sx, sy, 1);
  });

  return (
    <lineSegments ref={lineRef} geometry={geometry} position={[0, 0, zOffset]}>
      <lineBasicMaterial color={color} transparent opacity={0.25} />
    </lineSegments>
  );
}

// ──────────────────────────────────────────
//  Main Export
// ──────────────────────────────────────────

export function FocusScene({ textures, mouseTarget, hoverActive, playbackState, boostValues, accessibility }: FocusSceneProps) {
  const hasLiveAudio = playbackState && (playbackState as any).getAudioData;

  // The inner frame is always static (reactive=false), so it doesn't need a synthetic variant.
  // The outer frame breathes with bass — use synthetic when no live audio.
  const ReactiveFrame = hasLiveAudio ? GeometricFrame : SyntheticGeometricFrame;

  return (
    <>
      {/* Single, clean album art */}
      <FocusArtPlane textures={textures} />

      {/* Inner frame — static */}
      <GeometricFrame
        scale={0.72}
        zOffset={0.01}
        color="#ccaa77"
        playbackState={playbackState}
        reactive={false}
        boostValues={boostValues}
        accessibility={accessibility}
      />

      {/* Outer frame — barely breathes with bass */}
      <ReactiveFrame
        scale={0.82}
        zOffset={0.02}
        color="#ccaa77"
        playbackState={playbackState}
        reactive={true}
        boostValues={boostValues}
        accessibility={accessibility}
      />
    </>
  );
}
