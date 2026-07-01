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
//  GLSL – Fragment Shader (Still Water)
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

  // Mouse velocity magnitude (for wake effect)
  uniform float     uMouseSpeed;

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

  // ── Pseudo-random hash ──
  float hash(float n) {
    return fract(sin(n) * 43758.5453123);
  }

  // ── Single ripple contribution ──
  // Returns UV displacement caused by one ripple
  vec2 ripple(vec2 uv, vec2 origin, float age, float amplitude) {
    vec2 delta = uv - origin;
    // Aspect-correct the distance
    float aspect = uResolution.x / uResolution.y;
    delta.x *= aspect;
    float dist = length(delta);

    // Ripple ring: travels outward at a fixed speed
    float rippleSpeed = 0.3;
    float frequency = 12.0;
    float ringPos = age * rippleSpeed;

    // Only distort near the ring front (gaussian envelope around the ring)
    float ringWidth = 0.06;
    float envelope = exp(-pow(dist - ringPos, 2.0) / (2.0 * ringWidth * ringWidth));

    // Fade out over lifetime
    float lifeFade = exp(-age * 0.8);

    // Fade out with distance
    float distFade = 1.0 / (1.0 + dist * 3.0);

    // The actual wave
    float wave = sin(dist * frequency - age * 8.0) * amplitude * envelope * lifeFade * distFade;

    // Displacement direction: radially outward from origin
    vec2 dir = dist > 0.001 ? normalize(delta) : vec2(0.0);
    // Un-correct the aspect for the output displacement
    dir.x /= aspect;

    return dir * wave;
  }

  void main() {
    vec2 uv = vUv;

    // ── 1. Autonomous ripple system ──
    // 5 ripple slots, each with a staggered cycle
    vec2 totalDisplacement = vec2(0.0);

    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      // Each ripple has a different period (3.5-6s) and phase offset
      float period = 3.5 + hash(fi * 7.0) * 2.5;
      float phase = hash(fi * 13.0 + 3.7) * period;
      float age = mod(uTime + phase, period);

      // Pseudo-random origin for this cycle
      float cycle = floor((uTime + phase) / period);
      float ox = hash(fi * 17.0 + cycle * 31.0) * 0.6 + 0.2; // keep within 0.2-0.8
      float oy = hash(fi * 23.0 + cycle * 37.0) * 0.6 + 0.2;
      vec2 origin = vec2(ox, oy);

      // Amplitude varies per ripple
      float amp = 0.008 + hash(fi * 41.0 + cycle * 53.0) * 0.006;

      totalDisplacement += ripple(uv, origin, age, amp);
    }

    // ── 2. Mouse wake effect ──
    // Subtle ripple emanating from mouse position, intensity based on mouse speed
    float mouseRippleAmp = uMouseSpeed * 0.015;
    if (mouseRippleAmp > 0.001) {
      vec2 mouseDelta = uv - uMouse;
      float aspect = uResolution.x / uResolution.y;
      mouseDelta.x *= aspect;
      float mouseDist = length(mouseDelta);

      // Concentric rings around cursor
      float mouseWave = sin(mouseDist * 25.0 - uTime * 6.0) * mouseRippleAmp;
      float mouseEnv = exp(-mouseDist * 5.0); // tight around cursor
      vec2 mouseDir = mouseDist > 0.001 ? normalize(mouseDelta) : vec2(0.0);
      mouseDir.x /= aspect;

      totalDisplacement += mouseDir * mouseWave * mouseEnv;
    }

    // ── 3. Track transition: sweeping distortion wave ──
    if (uProgress > 0.0 && uProgress < 1.0) {
      // A vertical wave sweeps from left to right as progress goes 0→1
      float waveFront = uProgress;
      float waveWidth = 0.12;
      float transitionDist = abs(uv.x - waveFront);
      float transitionEnv = exp(-transitionDist * transitionDist / (2.0 * waveWidth * waveWidth));

      // Strong vertical distortion at the wave front
      float transitionWave = sin(uv.y * 20.0 - uTime * 10.0) * 0.025 * transitionEnv;
      totalDisplacement.x += transitionWave;
      totalDisplacement.y += sin(uv.x * 15.0 + uTime * 8.0) * 0.015 * transitionEnv;
    }

    // ── 4. Apply displacement and sample textures ──
    vec2 distortedUv = uv + totalDisplacement;

    vec2 uv1 = coverUv(distortedUv, uImageRes1, uResolution);
    vec2 uv2 = coverUv(distortedUv, uImageRes2, uResolution);

    vec4 col1 = texture2D(uTexture1, uv1);
    vec4 col2 = texture2D(uTexture2, uv2);

    // Crossfade
    vec4 color = mix(col1, col2, uProgress);

    // ── 5. Warm amber color grade ──
    vec3 warm = vec3(
      color.r * 1.06,
      color.g * 1.02,
      color.b * 0.88
    );
    color.rgb = mix(color.rgb, warm, 0.3);

    // Slight contrast boost
    color.rgb = (color.rgb - 0.5) * 1.08 + 0.5;
    color.rgb = clamp(color.rgb, 0.0, 1.0);

    // ── 6. Vignette ──
    float dist = length(vUv - 0.5) * 1.414;
    float vig = smoothstep(0.3, 1.3, dist);
    color.rgb *= 1.0 - vig * 0.4;

    // ── 7. Hover preview — soft dreamy portal ──
    if (uHover > 0.001) {
      vec2 aspect2 = vec2(uResolution.x / uResolution.y, 1.0);
      float d = length((vUv - uMouse) * aspect2);

      // Circular reveal with soft feathered edge
      float circle = 1.0 - smoothstep(0.07, 0.15, d);
      circle *= uHover;

      // Sample hover texture with the same water distortion applied
      vec2 hoverUvBase = coverUv(distortedUv, uImageRes3, uResolution);
      vec4 hoverCol = texture2D(uHoverTexture, hoverUvBase);

      // Apply same warm tint
      vec3 hoverWarm = vec3(
        hoverCol.r * 1.06,
        hoverCol.g * 1.02,
        hoverCol.b * 0.88
      );
      hoverCol.rgb = mix(hoverCol.rgb, hoverWarm, 0.3);

      color.rgb = mix(color.rgb, hoverCol.rgb, circle);
    }

    gl_FragColor = color;
  }
`;

// ──────────────────────────────────────────
//  Still Water Background (single plane)
// ──────────────────────────────────────────

function StillWaterBackground({
  textures,
  mouseTarget,
}: {
  textures: TrackTextures;
  mouseTarget: React.MutableRefObject<THREE.Vector2>;
}) {
  const { width, height } = useThree((s) => s.viewport);
  const size = useThree((s) => s.size);
  const matRef = useRef<THREE.ShaderMaterial>(null);

  // Smoothly interpolated mouse position
  const mouseLerped = useRef(new THREE.Vector2(0.5, 0.5));
  const lastMouse = useRef(new THREE.Vector2(0.5, 0.5));
  const mouseSpeedRef = useRef(0);

  const uniforms = useMemo(
    () => ({
      uTexture1:     { value: fallbackTex },
      uTexture2:     { value: fallbackTex },
      uHoverTexture: { value: fallbackTex },
      uProgress:     { value: 0 },
      uHover:        { value: 0 },
      uMouse:        { value: new THREE.Vector2(0.5, 0.5) },
      uMouseSpeed:   { value: 0 },
      uTime:         { value: 0 },
      uResolution:   { value: new THREE.Vector2(size.width, size.height) },
      uImageRes1:    { value: new THREE.Vector2(1, 1) },
      uImageRes2:    { value: new THREE.Vector2(1, 1) },
      uImageRes3:    { value: new THREE.Vector2(1, 1) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useFrame(({ clock }, delta) => {
    const mat = matRef.current;
    if (!mat) return;

    // Lerp mouse
    mouseLerped.current.lerp(mouseTarget.current, 0.06);

    // Calculate mouse speed (distance moved per frame)
    const dx = mouseLerped.current.x - lastMouse.current.x;
    const dy = mouseLerped.current.y - lastMouse.current.y;
    const rawSpeed = Math.sqrt(dx * dx + dy * dy) / Math.max(delta, 0.001);
    // Smooth the speed value
    mouseSpeedRef.current += (rawSpeed - mouseSpeedRef.current) * 0.1;
    lastMouse.current.copy(mouseLerped.current);

    // Push uniforms
    mat.uniforms.uTexture1.value     = textures.texture1Ref.current ?? fallbackTex;
    mat.uniforms.uTexture2.value     = textures.texture2Ref.current ?? fallbackTex;
    mat.uniforms.uHoverTexture.value = textures.hoverTextureRef.current ?? fallbackTex;
    mat.uniforms.uProgress.value     = textures.progress.value;
    mat.uniforms.uHover.value        = textures.hoverAmount.value;
    mat.uniforms.uMouse.value.copy(mouseLerped.current);
    mat.uniforms.uMouseSpeed.value   = Math.min(mouseSpeedRef.current, 1.0);
    mat.uniforms.uTime.value         = clock.getElapsedTime();
    mat.uniforms.uResolution.value.set(size.width, size.height);
    mat.uniforms.uImageRes1.value.copy(textures.imageRes1);
    mat.uniforms.uImageRes2.value.copy(textures.imageRes2);
    mat.uniforms.uImageRes3.value.copy(textures.imageRes3);
  });

  return (
    <mesh position={[0, 0, 0]}>
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
//  Main Scene Export
// ──────────────────────────────────────────

export function ChillScene({
  textures,
  mouseTarget,
  hoverActive: _hoverActive,
}: ChillSceneProps) {
  return (
    <>
      {/* Single plane — all ripple/water effects happen inside the shader */}
      <StillWaterBackground textures={textures} mouseTarget={mouseTarget} />
    </>
  );
}
