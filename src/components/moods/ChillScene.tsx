"use client";

import React, { useRef, useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
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
//  Layer types:
//    0 = Deep (darkened desaturated base)
//    1 = Warm (amber mid-tones, Screen blend)
//    2 = Light (extracted highlights, soft glow)
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
  uniform float uTime;
  uniform int uLayerType;

  // Hover
  uniform sampler2D uHoverTexture;
  uniform float uHover;
  uniform vec2 uMouse;
  uniform vec2 uImageRes3;

  // Cover-fit UV
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
    // Gentle breathing UV (slow, ~8s period)
    float breathe = 1.0 + sin(uTime * 0.785) * 0.003;
    vec2 uv = (vUv - 0.5) * breathe + 0.5;

    vec2 uv1 = coverUv(uv, uImageRes1, uResolution);
    vec2 uv2 = coverUv(uv, uImageRes2, uResolution);

    vec4 tex1 = texture2D(uTexture1, uv1);
    vec4 tex2 = texture2D(uTexture2, uv2);
    vec4 color = mix(tex1, tex2, uProgress);

    // Luminance
    float lum = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));

    if (uLayerType == 0) {
      // ── DEEP LAYER ──
      // Desaturate heavily, darken — the moody shadow foundation
      vec3 desat = mix(color.rgb, vec3(lum), 0.7);
      desat *= 0.35;

      // Vignette baked into this layer
      float dist = length(vUv - 0.5) * 1.414;
      float vig = smoothstep(0.2, 1.2, dist);
      desat *= 1.0 - vig * 0.5;

      gl_FragColor = vec4(desat, 1.0);

    } else if (uLayerType == 1) {
      // ── WARM LAYER ──
      // Push warm amber tones, extract mid-range
      vec3 warm = vec3(
        color.r * 1.15,
        color.g * 1.0,
        color.b * 0.75
      );

      // Isolate mid-tones: suppress very dark and very bright areas
      float midMask = smoothstep(0.1, 0.35, lum) * (1.0 - smoothstep(0.65, 0.9, lum));
      warm *= midMask * 1.2;

      // Slight grain texture
      float grain = fract(sin(dot(vUv * uTime * 0.1, vec2(12.9898, 78.233))) * 43758.5453);
      warm += (grain - 0.5) * 0.015;

      gl_FragColor = vec4(clamp(warm, 0.0, 1.0), 0.6);

    } else if (uLayerType == 2) {
      // ── LIGHT LAYER ──
      // Extract only the bright highlights — the ethereal glow
      float highlightMask = smoothstep(0.5, 0.85, lum);
      vec3 glow = color.rgb * highlightMask;

      // Warm the glow slightly
      glow.r *= 1.1;
      glow.b *= 0.9;

      gl_FragColor = vec4(glow, highlightMask * 0.7);
    }

    // ── Hover preview (only on the deep base layer) ──
    if (uLayerType == 0 && uHover > 0.001) {
      vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
      float d = length((vUv - uMouse) * aspect);
      float circle = 1.0 - smoothstep(0.07, 0.15, d);
      circle *= uHover;

      vec2 hoverUv = coverUv(uv, uImageRes3, uResolution);
      vec4 hoverCol = texture2D(uHoverTexture, hoverUv);

      // Apply same warm treatment
      vec3 hoverWarm = vec3(hoverCol.r * 1.06, hoverCol.g * 1.02, hoverCol.b * 0.88);
      hoverCol.rgb = mix(hoverCol.rgb, hoverWarm, 0.3);

      // Desaturate + darken to match the deep layer aesthetic
      float hLum = dot(hoverCol.rgb, vec3(0.2126, 0.7152, 0.0722));
      hoverCol.rgb = mix(hoverCol.rgb, vec3(hLum), 0.7) * 0.35;

      gl_FragColor.rgb = mix(gl_FragColor.rgb, hoverCol.rgb, circle);
    }
  }
`;

// ──────────────────────────────────────────
//  Silk Plane Component
// ──────────────────────────────────────────

interface SilkPlaneProps {
  textures: TrackTextures;
  layerType: 0 | 1 | 2;
  mouseTarget: React.MutableRefObject<THREE.Vector2>;
  zOffset: number;
}

function SilkPlane({ textures, layerType, mouseTarget, zOffset }: SilkPlaneProps) {
  const { width, height } = useThree((s) => s.viewport);
  const size = useThree((s) => s.size);
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const mouseLerped = useRef(new THREE.Vector2(0.5, 0.5));
  const timeRef = useRef(Math.random() * 100);

  const uniforms = useMemo(
    () => ({
      uTexture1:     { value: fallbackTex },
      uTexture2:     { value: fallbackTex },
      uHoverTexture: { value: fallbackTex },
      uProgress:     { value: 0 },
      uResolution:   { value: new THREE.Vector2(1, 1) },
      uImageRes1:    { value: new THREE.Vector2(1, 1) },
      uImageRes2:    { value: new THREE.Vector2(1, 1) },
      uImageRes3:    { value: new THREE.Vector2(1, 1) },
      uTime:         { value: 0 },
      uLayerType:    { value: layerType },
      uHover:        { value: 0 },
      uMouse:        { value: new THREE.Vector2(0.5, 0.5) },
    }),
    [layerType]
  );

  useFrame((_state, delta) => {
    const mesh = meshRef.current;
    const mat = materialRef.current;
    if (!mesh || !mat) return;

    timeRef.current += delta;
    const t = timeRef.current;

    // Push uniforms
    mat.uniforms.uResolution.value.set(size.width, size.height);
    mat.uniforms.uTexture1.value     = textures.texture1Ref.current ?? fallbackTex;
    mat.uniforms.uTexture2.value     = textures.texture2Ref.current ?? fallbackTex;
    mat.uniforms.uHoverTexture.value = textures.hoverTextureRef.current ?? fallbackTex;
    mat.uniforms.uProgress.value     = textures.progress.value;
    mat.uniforms.uImageRes1.value.copy(textures.imageRes1);
    mat.uniforms.uImageRes2.value.copy(textures.imageRes2);
    mat.uniforms.uImageRes3.value.copy(textures.imageRes3);
    mat.uniforms.uTime.value         = t;
    mat.uniforms.uHover.value        = textures.hoverAmount.value;

    mouseLerped.current.lerp(mouseTarget.current, 0.04);
    mat.uniforms.uMouse.value.copy(mouseLerped.current);

    // ── Silk drift animation ──
    // Each layer sways differently — like curtains in a gentle breeze
    // Key difference from Energy: these are SLOW, sinusoidal, overlapping waves
    // Energy uses fast orbital motion. This uses languid pendulum swings.

    if (layerType === 0) {
      // Deep layer: nearly still, just a tiny slow sway
      mesh.position.x = Math.sin(t * 0.15) * 0.01;
      mesh.position.y = Math.cos(t * 0.12) * 0.008;
    } else if (layerType === 1) {
      // Warm layer: gentle diagonal drift
      mesh.position.x = Math.sin(t * 0.2 + 1.5) * 0.035;
      mesh.position.y = Math.cos(t * 0.18 + 0.7) * 0.025;
    } else {
      // Light layer: slightly more movement, opposite phase
      mesh.position.x = Math.sin(t * 0.25 + 3.0) * 0.05;
      mesh.position.y = Math.cos(t * 0.22 + 2.1) * 0.04;
    }

    // Mouse parallax — deeper layers respond less (creates depth)
    const parallaxStrength = 0.03 * (layerType + 1);
    mesh.position.x += (mouseLerped.current.x - 0.5) * -parallaxStrength;
    mesh.position.y += (mouseLerped.current.y - 0.5) * -parallaxStrength;

    // Track transition: layers gently peel apart and fold back
    const transitionPeak = Math.sin(textures.progress.value * Math.PI);
    const peelDistance = transitionPeak * 0.12 * (layerType + 1);
    // Each layer peels in a different direction
    const peelAngle = (layerType * 2.094) + 0.5; // ~120° apart
    mesh.position.x += Math.cos(peelAngle) * peelDistance;
    mesh.position.y += Math.sin(peelAngle) * peelDistance;

    // Very subtle rotation during peel
    mesh.rotation.z = transitionPeak * 0.03 * (layerType === 1 ? 1 : -1);

    // Scale to fill viewport
    mesh.scale.set(width * 1.05, height * 1.05, 1); // slightly oversized to hide edges during drift
  });

  // Determine blending mode per layer
  let blending: THREE.Blending = THREE.NormalBlending;
  if (layerType === 1) blending = THREE.CustomBlending; // Screen blend
  if (layerType === 2) blending = THREE.AdditiveBlending;

  return (
    <mesh ref={meshRef} position={[0, 0, zOffset]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={blending}
        // Screen blending setup for the Warm layer
        {...(layerType === 1 ? {
          blendSrc: THREE.OneFactor,
          blendDst: THREE.OneMinusSrcColorFactor,
          blendSrcAlpha: THREE.OneFactor,
          blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
        } : {})}
      />
    </mesh>
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
      {/*
        Three Silk Layers, back to front:
        - Deep: darkened desaturated base (Normal blend)
        - Warm: amber mid-tones (Screen blend — brightens without washing out)
        - Light: extracted highlights (Additive blend — ethereal glow)
        
        Unlike Energy's RGB shatter, these layers separate by LUMINOSITY,
        use different blend modes, and drift gently like fabric — not orbit chaotically.
      */}
      <SilkPlane textures={textures} mouseTarget={mouseTarget} layerType={0} zOffset={0} />
      <SilkPlane textures={textures} mouseTarget={mouseTarget} layerType={1} zOffset={0.01} />
      <SilkPlane textures={textures} mouseTarget={mouseTarget} layerType={2} zOffset={0.02} />
    </>
  );
}
