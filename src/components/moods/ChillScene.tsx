"use client";

import React, { useRef, useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Sparkles, Float } from "@react-three/drei";
import {
  EffectComposer,
  DepthOfField,
  Noise,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import type { TrackTextures } from "@/hooks/useTrackTextures";

// ──────────────────────────────────────────
//  Props
// ──────────────────────────────────────────

interface ChillSceneProps {
  textures: TrackTextures;
  mouseTarget: React.MutableRefObject<THREE.Vector2>;
  hoverActive: boolean;
}

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
// ──────────────────────────────────────────

const fragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  // Main textures & crossfade
  uniform sampler2D uTexture1;
  uniform sampler2D uTexture2;
  uniform float     uProgress;

  // Hover preview
  uniform sampler2D uHoverTexture;
  uniform float     uHover;
  uniform vec2      uMouse;
  uniform vec2      uImageRes3;

  // Time & viewport
  uniform float     uTime;
  uniform vec2      uResolution;
  uniform vec2      uImageRes1;
  uniform vec2      uImageRes2;

  // ── Cover-fit UV helper ──
  vec2 coverUv(vec2 uv, vec2 imgRes, vec2 screenRes) {
    float screenAspect = screenRes.x / screenRes.y;
    float imgAspect    = imgRes.x / imgRes.y;
    vec2 scale = vec2(1.0);
    if (screenAspect > imgAspect) {
      scale.y = imgAspect / screenAspect;
    } else {
      scale.x = screenAspect / imgAspect;
    }
    return (uv - 0.5) * scale + 0.5;
  }

  void main() {
    // ── 1. Breathing UV effect ──
    // Slow sinusoidal scale pulse (~6 s period, 0.005 amplitude)
    float breathe = 1.0 + sin(uTime * 1.0472) * 0.005; // 2π / 6 ≈ 1.0472
    vec2 breathedUv = (vUv - 0.5) * breathe + 0.5;

    // ── 2. Sample both track textures with cover-fit UVs ──
    vec2 uv1 = coverUv(breathedUv, uImageRes1, uResolution);
    vec2 uv2 = coverUv(breathedUv, uImageRes2, uResolution);

    vec4 col1 = texture2D(uTexture1, uv1);
    vec4 col2 = texture2D(uTexture2, uv2);

    // Crossfade
    vec4 color = mix(col1, col2, uProgress);

    // ── 3. Warm sepia / amber color shift (25 % blend) ──
    vec3 warm = vec3(
      color.r * 1.08,   // push red up
      color.g * 1.02,   // keep green nearly the same
      color.b * 0.88    // pull blue down
    );
    color.rgb = mix(color.rgb, warm, 0.25);

    // ── 4. Vignette darkening (~30 % at edges) ──
    float dist = length(vUv - 0.5) * 1.414; // 0 at center, ~1 at corners
    float vig  = smoothstep(0.4, 1.4, dist);
    color.rgb *= 1.0 - vig * 0.30;

    // ── 5. Hover preview — soft dreamy portal ──
    if (uHover > 0.001) {
      // Mouse is in 0-1 normalized coords; compute distance in aspect-corrected space
      vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
      float d = length((vUv - uMouse) * aspect);

      // Circular reveal: 0.15 radius, 0.08 feather
      float circle = 1.0 - smoothstep(0.07, 0.15, d);
      circle *= uHover; // fade in / out with hover amount

      // Sample hover texture with a subtle UV wobble for dreamy softness
      vec2 hoverUvBase = coverUv(breathedUv, uImageRes3, uResolution);
      float wobble = sin(uTime * 2.0 + vUv.x * 30.0) * 0.002
                   + cos(uTime * 1.7 + vUv.y * 30.0) * 0.002;
      vec2 hoverUv = hoverUvBase + wobble;
      vec4 hoverCol = texture2D(uHoverTexture, hoverUv);

      // Apply same warm tint to hover texture for consistency
      vec3 hoverWarm = vec3(
        hoverCol.r * 1.08,
        hoverCol.g * 1.02,
        hoverCol.b * 0.88
      );
      hoverCol.rgb = mix(hoverCol.rgb, hoverWarm, 0.25);

      color.rgb = mix(color.rgb, hoverCol.rgb, circle);
    }

    gl_FragColor = color;
  }
`;

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
  t.needsUpdate = true;
  return t;
})();

// ──────────────────────────────────────────
//  Background Plane (album art + hover)
// ──────────────────────────────────────────

function ChillBackground({
  textures,
  mouseTarget,
}: {
  textures: TrackTextures;
  mouseTarget: React.MutableRefObject<THREE.Vector2>;
}) {
  const { width, height } = useThree((s) => s.viewport);
  const { size } = useThree();

  const matRef = useRef<THREE.ShaderMaterial>(null);

  // Smoothly interpolated mouse position (0-1 range)
  const mouseLerped = useRef(new THREE.Vector2(0.5, 0.5));

  // Build uniforms once; update values each frame
  const uniforms = useMemo(
    () => ({
      uTexture1:     { value: fallbackTex },
      uTexture2:     { value: fallbackTex },
      uHoverTexture: { value: fallbackTex },
      uProgress:     { value: 0 },
      uHover:        { value: 0 },
      uMouse:        { value: new THREE.Vector2(0.5, 0.5) },
      uTime:         { value: 0 },
      uResolution:   { value: new THREE.Vector2(size.width, size.height) },
      uImageRes1:    { value: new THREE.Vector2(1, 1) },
      uImageRes2:    { value: new THREE.Vector2(1, 1) },
      uImageRes3:    { value: new THREE.Vector2(1, 1) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useFrame(({ clock }) => {
    const mat = matRef.current;
    if (!mat) return;

    // Lerp mouse toward target for smooth tracking
    mouseLerped.current.lerp(mouseTarget.current, 0.06);

    // Push every uniform value
    mat.uniforms.uTexture1.value     = textures.texture1 ?? fallbackTex;
    mat.uniforms.uTexture2.value     = textures.texture2 ?? fallbackTex;
    mat.uniforms.uHoverTexture.value = textures.hoverTexture ?? fallbackTex;
    mat.uniforms.uProgress.value     = textures.progress.value;
    mat.uniforms.uHover.value        = textures.hoverAmount.value;
    mat.uniforms.uMouse.value.copy(mouseLerped.current);
    mat.uniforms.uTime.value         = clock.getElapsedTime();
    mat.uniforms.uResolution.value.set(size.width, size.height);
    mat.uniforms.uImageRes1.value.copy(textures.imageRes1);
    mat.uniforms.uImageRes2.value.copy(textures.imageRes2);
    mat.uniforms.uImageRes3.value.copy(textures.imageRes3);
  });

  return (
    <mesh position={[0, 0, -1]}>
      <planeGeometry args={[width, height]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthWrite={false}
        transparent
      />
    </mesh>
  );
}

// ──────────────────────────────────────────
//  Bokeh Particles (ambient floating lights)
// ──────────────────────────────────────────

function BokehParticles() {
  const { width, height } = useThree((s) => s.viewport);

  return (
    <Float speed={0.5} rotationIntensity={0.2} floatIntensity={0.3}>
      <Sparkles
        count={80}
        scale={[width * 0.8, height * 0.8, 2]}
        size={2.5}
        speed={0.3}
        color="#ffcc88"
        opacity={0.5}
        noise={1.5}
      />
    </Float>
  );
}

// ──────────────────────────────────────────
//  Post-Processing Stack
// ──────────────────────────────────────────

function ChillPostProcessing() {
  return (
    <EffectComposer multisampling={0}>
      <DepthOfField
        focusDistance={0.01}
        focalLength={0.02}
        bokehScale={6}
      />
      <Noise
        premultiply
        blendFunction={BlendFunction.SOFT_LIGHT}
        opacity={0.06}
      />
      <Vignette offset={0.3} darkness={0.65} />
    </EffectComposer>
  );
}

// ──────────────────────────────────────────
//  Main Scene Export
// ──────────────────────────────────────────

export function ChillScene({
  textures,
  mouseTarget,
  hoverActive: _hoverActive,
}: ChillSceneProps) {
  return (
    <>
      {/* Layer 1 — Album art background with crossfade & hover portal */}
      <ChillBackground textures={textures} mouseTarget={mouseTarget} />

      {/* Layer 2 — Ambient bokeh particles */}
      <BokehParticles />

      {/* Layer 3 — Post-processing (DoF, grain, vignette) */}
      <ChillPostProcessing />
    </>
  );
}
