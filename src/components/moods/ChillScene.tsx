"use client";

import React, { useRef, useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Float, Sparkles } from "@react-three/drei";
import type { TrackTextures } from "@/hooks/useTrackTextures";
import type { AccessibilitySettings } from "@/contexts/AccessibilityContext";
import { useSyntheticPulse, PlaybackState } from "@/hooks/useSyntheticPulse";

// ──────────────────────────────────────────
//  Props
// ──────────────────────────────────────────

interface ChillSceneProps {
  textures: TrackTextures;
  mouseTarget: React.MutableRefObject<THREE.Vector2>;
  hoverActive: boolean;
  playbackState?: PlaybackState | null;
  accessibility?: AccessibilitySettings;
  boostValues: { bass: number; mids: number; highs: number };
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
  uniform sampler2D uHoverTexture;
  uniform float uProgress;
  uniform vec2 uResolution;
  uniform vec2 uImageRes1;
  uniform vec2 uImageRes2;
  uniform vec2 uImageRes3;
  uniform float uTime;
  uniform int uLayerType;

  // Audio Reactivity
  uniform float uBass;
  uniform float uMid;
  uniform float uHigh;

  // Hover
  uniform float uHover;
  uniform vec2 uMouse;

  // Liquid Glass Uniforms
  uniform vec4 uLens;    // xy: center (UV), z: radius, w: scale
  uniform vec4 uMotion;  // xy: direction, z: stretch, w: wobble
  uniform float uMag;    // magnification
  uniform float uRefract; // refraction strength

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
    // Gentle breathing UV + Bass Reactivity
    float breathe = 1.0 + sin(uTime * 0.785) * 0.003 - (uBass * 0.03);
    vec2 uv = (vUv - 0.5) * breathe + 0.5;

    vec2 uv1 = coverUv(uv, uImageRes1, uResolution);
    vec2 uv2 = coverUv(uv, uImageRes2, uResolution);

    vec4 tex1 = texture2D(uTexture1, uv1);
    vec4 tex2 = texture2D(uTexture2, uv2);
    vec4 bgCol = mix(tex1, tex2, uProgress);

    // Default background color output
    float bgLum = dot(bgCol.rgb, vec3(0.2126, 0.7152, 0.0722));
    vec4 defaultOut;

    if (uLayerType == 0) {
      vec3 desat = mix(bgCol.rgb, vec3(bgLum), 0.7);
      desat *= 0.35;
      float dist = length(vUv - 0.5) * 1.414;
      float vig = smoothstep(0.2, 1.2, dist);
      desat *= 1.0 - vig * 0.5;
      defaultOut = vec4(desat, 1.0);
    } else if (uLayerType == 1) {
      vec3 warm = bgCol.rgb * (1.0 + uMid * 0.2);
      float midMask = smoothstep(0.1, 0.35, bgLum) * (1.0 - smoothstep(0.65, 0.9, bgLum));
      warm *= midMask * 1.2;
      float grain = fract(sin(dot(vUv * uTime * 0.1, vec2(12.9898, 78.233))) * 43758.5453);
      warm += (grain - 0.5) * (0.015 + uHigh * 0.08);
      defaultOut = vec4(clamp(warm, 0.0, 1.0), 0.6);
    } else if (uLayerType == 2) {
      float highlightMask = smoothstep(0.5, 0.85, bgLum);
      vec3 glow = bgCol.rgb * highlightMask;
      defaultOut = vec4(glow, highlightMask * 0.7);
    }

    // ── Liquid Glass Portal Blend ──
    if (uHover > 0.001) {
      vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
      vec2 lensC = uLens.xy;
      float R = uLens.z * uLens.w;

      // Lens-local coordinates, squashed along motion direction
      vec2 q = (vUv - lensC) * aspect;
      vec2 dir = normalize(uMotion.xy + 1e-5);
      float stretch = uMotion.z;
      
      // Rotate coordinates into motion space to stretch them
      if (stretch > 0.001) {
        vec2 tangent = vec2(dir.y, -dir.x);
        float a = dot(q, dir) / (1.0 + stretch);
        float b = dot(q, tangent) * (1.0 + stretch * 0.5);
        q = dir * a + tangent * b;
      }

      // Organic rim wobble
      float ang = atan(q.y, q.x);
      float wob = uMotion.w * (
          0.030 * sin(ang * 3.0 + uTime * 2.1)
        + 0.022 * sin(ang * 5.0 - uTime * 3.3)
        + 0.014 * sin(ang * 7.0 + uTime * 4.7)
      ) + 0.006 * sin(ang * 2.0 + uTime * 0.8);

      float r = length(q);
      float Rw = R * (1.0 + wob);
      float d = r - Rw;
      
      // Smooth antialiasing edge in UV space
      float aa = 0.005;
      float inside = smoothstep(aa, -aa, d);

      if (inside > 0.0) {
        // Derive normal mapping for 3D dome refraction
        float r01 = clamp(r / Rw, 0.0, 1.0);
        float h = sqrt(max(1.0 - r01 * r01, 0.0));
        vec3 N = normalize(vec3(q / Rw, h * 1.15));

        // Magnify center and refract rays
        vec2 muv = lensC + (vUv - lensC) / uMag;
        float bend = 1.0 - h;
        vec2 refr = -N.xy * bend * uRefract * R * 0.9;
        refr /= aspect; // Map back from aspect-ratio space

        // Chromatic aberration offsets
        float ca = 0.08 * uRefract;
        vec2 uvR = muv + refr * (1.0 + ca);
        vec2 uvG = muv + refr;
        vec2 uvB = muv + refr * (1.0 - ca);

        // Apply coverUv for the hover texture
        vec2 uvR_fit = coverUv(clamp(uvR, 0.0, 1.0), uImageRes3, uResolution);
        vec2 uvG_fit = coverUv(clamp(uvG, 0.0, 1.0), uImageRes3, uResolution);
        vec2 uvB_fit = coverUv(clamp(uvB, 0.0, 1.0), uImageRes3, uResolution);

        float rCol = texture2D(uHoverTexture, uvR_fit).r;
        float gCol = texture2D(uHoverTexture, uvG_fit).g;
        float bCol = texture2D(uHoverTexture, uvB_fit).b;
        vec3 glassColor = vec3(rCol, gCol, bCol);

        // Specular key light from top-left + Fresnel rim shader
        vec3 L = normalize(vec3(-0.35, 0.55, 0.75));
        vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
        float ndh = max(dot(N, H), 0.0);
        float spec = pow(ndh, 90.0) * 0.9 + pow(ndh, 18.0) * 0.18;
        float fres = pow(1.0 - max(N.z, 0.0), 2.5);
        float innerShade = smoothstep(0.2, 1.0, dot(normalize(N.xy + 1e-5), normalize(vec2(0.4, -0.8)))) * fres * 0.10;

        glassColor *= 1.0 - innerShade;
        glassColor += spec + fres * 0.16;
        glassColor += smoothstep(aa * 2.5, 0.0, abs(d)) * 0.25; // outer rim highlight

        // Show the true actual cover in full color inside the portal on the base layer
        // Hide upper layers (Layer 1 and 2) inside the portal so they don't contaminate the colors
        vec4 glassOut = uLayerType == 0 
          ? vec4(glassColor, 1.0) 
          : vec4(0.0, 0.0, 0.0, 0.0);

        // Mix portal inside with background using uHover amount
        gl_FragColor = mix(defaultOut, glassOut, inside * uHover);
        return;
      }
    }

    gl_FragColor = defaultOut;
  }
`;

// ──────────────────────────────────────────
//  Silk Plane Component
// ──────────────────────────────────────────

interface ChillPlaneProps {
  textures: TrackTextures;
  layerType: 0 | 1 | 2;
  mouseTarget: React.MutableRefObject<THREE.Vector2>;
  zOffset: number;
  playbackState?: PlaybackState | null;
  accessibility?: AccessibilitySettings;
  boostValues: { bass: number; mids: number; highs: number };
}

function ChillPlane({ textures, layerType, mouseTarget, zOffset, playbackState, accessibility, boostValues }: ChillPlaneProps) {
  const { width, height } = useThree((s) => s.viewport);
  const size = useThree((s) => s.size);
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const mouseLerped = useRef(new THREE.Vector2(0.5, 0.5));
  const timeRef = useRef(Math.random() * 100);
  const subBassRef = useRef(0);

  // Liquid gooey glass lens simulation state
  const pxRef = useRef(0.5);
  const pyRef = useRef(0.5);
  const vxRef = useRef(0);
  const vyRef = useRef(0);
  const stretchRef = useRef(0);
  const wobbleRef = useRef(0);
  const wobbleVelRef = useRef(0);
  const dirRef = useRef(new THREE.Vector2(0, 1));
  
  // Mouse cursor tracking for noise-free velocity
  const smoothMouseRef = useRef(new THREE.Vector2(0.5, 0.5));
  const smoothMouseSpeedRef = useRef(0);

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
      uBass:         { value: 0.0 },
      uMid:          { value: 0.0 },
      uHigh:         { value: 0.0 },
      
      // Liquid glass properties
      uLens:         { value: new THREE.Vector4(0.5, 0.5, 0.14, 1.0) }, // xy: center, z: radius, w: scale
      uMotion:       { value: new THREE.Vector4(0, 1, 0, 0) },         // xy: direction, z: stretch, w: wobble
      uMag:          { value: 1.15 },                                  // magnification
      uRefract:      { value: 0.35 },                                  // refraction strength
    }),
    [layerType]
  );

  useFrame((state, delta) => {
    if (!materialRef.current) return;
    const mat = materialRef.current;
    const mesh = meshRef.current;
    if (!mesh) return;

    // Update basic uniforms
    mat.uniforms.uTime.value = state.clock.elapsedTime;
    mat.uniforms.uResolution.value.set(state.size.width, state.size.height);
    
    // Smoothly interpolate uniforms for Web Audio API reactivity
    let bass = 0.0;
    let mid = 0.0;
    let high = 0.0;

    if (playbackState && (playbackState as any).getAudioData) {
      const data = (playbackState as any).getAudioData();
      if (data) {
        // Isolate standard bass (musicality) - Intensity increased for testing
        bass = Math.pow(data.bass, 1.2) * 2.0 * boostValues.bass;

        // Subwoofer effect: Fast attack, slow calm decay
        const rawSub = Math.pow(data.subBass, 2.0) * 0.5 * boostValues.bass; // Restored to 0.5
        if (rawSub > subBassRef.current) {
          subBassRef.current = THREE.MathUtils.lerp(subBassRef.current, rawSub, 0.6); // Snappy punch
        } else {
          subBassRef.current = THREE.MathUtils.lerp(subBassRef.current, rawSub, 0.04); // Calm, slow decay
        }

        mid = data.mid * boostValues.mids;
        high = data.high * boostValues.highs;
      }
    }

    // Apply the standard bass with normal smoothing, but add the raw subBassRef directly so it retains its snappy punch
    // When imageBreathing is OFF, zero out the bass uniform so the shader's UV breathing stops
    if (accessibility?.imageBreathing !== false) {
      mat.uniforms.uBass.value = THREE.MathUtils.lerp(mat.uniforms.uBass.value, bass, 0.2) + subBassRef.current;
    } else {
      mat.uniforms.uBass.value = THREE.MathUtils.lerp(mat.uniforms.uBass.value, 0, 0.15);
    }
    mat.uniforms.uMid.value = THREE.MathUtils.lerp(mat.uniforms.uMid.value, mid, 0.1);
    mat.uniforms.uHigh.value = THREE.MathUtils.lerp(mat.uniforms.uHigh.value, high, 0.2);

    // Assign textures and crossfade
    mat.uniforms.uTexture1.value     = textures.texture1Ref.current ?? fallbackTex;
    mat.uniforms.uTexture2.value     = textures.texture2Ref.current ?? fallbackTex;
    mat.uniforms.uHoverTexture.value = textures.hoverTextureRef.current ?? fallbackTex;
    mat.uniforms.uProgress.value     = textures.progress.value;
    mat.uniforms.uImageRes1.value.copy(textures.imageRes1);
    mat.uniforms.uImageRes2.value.copy(textures.imageRes2);
    mat.uniforms.uImageRes3.value.copy(textures.imageRes3);
    mat.uniforms.uHover.value        = textures.hoverAmount.value;

    const t = state.clock.elapsedTime;

    // Clamp delta to prevent physics engine explosions (NaN) during lag spikes, tab switching, or negative delta jitter
    const dt = THREE.MathUtils.clamp(delta, 0.0001, 0.03);

    // ── Spring-Follow Mouse Physics Simulation ──
    let tx = mouseTarget.current.x;
    let ty = mouseTarget.current.y;

    // Safety guard: if mouse coordinates are NaN or infinite (e.g. if the canvas size was 0 during reflow),
    // fall back to the current position to prevent the physics engine from collapsing.
    if (isNaN(tx) || isNaN(ty) || !isFinite(tx) || !isFinite(ty)) {
      tx = pxRef.current;
      ty = pyRef.current;
    }

    const springK = 150.0; // Spring stiffness
    const damping = 15.0;  // Damping coefficient (increased to settle faster without bouncing)

    // Spring equations
    const ax = (tx - pxRef.current) * springK;
    const ay = (ty - pyRef.current) * springK;

    vxRef.current += ax * dt;
    vyRef.current += ay * dt;

    // Clamp velocity to prevent infinite acceleration (windup) and floating-point overflow
    vxRef.current = THREE.MathUtils.clamp(vxRef.current, -15.0, 15.0);
    vyRef.current = THREE.MathUtils.clamp(vyRef.current, -15.0, 15.0);

    const dampFactor = Math.exp(-damping * dt);
    vxRef.current *= dampFactor;
    vyRef.current *= dampFactor;

    pxRef.current += vxRef.current * dt;
    pyRef.current += vyRef.current * dt;

    // Prevent integrator windup: when position hits the viewport boundaries, 
    // stop the position and kill the velocity.
    if (pxRef.current < -0.5) {
      pxRef.current = -0.5;
      vxRef.current = 0.0;
    } else if (pxRef.current > 1.5) {
      pxRef.current = 1.5;
      vxRef.current = 0.0;
    }

    if (pyRef.current < -0.5) {
      pyRef.current = -0.5;
      vyRef.current = 0.0;
    } else if (pyRef.current > 1.5) {
      pyRef.current = 1.5;
      vyRef.current = 0.0;
    }

    // ── Pre-Filter Pointer Events ──
    // Because mouseMove events fire in discrete, stepped intervals, calculating velocity directly
    // by differentiating coordinates results in mathematical spikes (jumping between velocity and 0.0).
    // Instead of using division-based velocity, we measure the smooth lag distance of a first-order lerp filter.
    // This distance is perfectly continuous, noise-free, and decays to 0 when still with zero bouncing.
    smoothMouseRef.current.lerp(new THREE.Vector2(tx, ty), 8.0 * dt);

    const lagDistance = Math.hypot(
      tx - smoothMouseRef.current.x,
      ty - smoothMouseRef.current.y
    );

    // Elongation stretch physics based on pre-filtered lag distance
    const targetStretch = Math.min(lagDistance * 3.0, 0.35);
    stretchRef.current += (targetStretch - stretchRef.current) * (1.0 - Math.exp(-12.0 * dt));

    // Edge wobble simulation based on pre-filtered lag distance
    const targetWobble = Math.min(lagDistance * 4.5, 0.6);
    wobbleRef.current += (targetWobble - wobbleRef.current) * (1.0 - Math.exp(-8.0 * dt));

    // Direction angle mapping based on spring direction
    const springSpeed = Math.hypot(vxRef.current, vyRef.current);
    if (springSpeed > 0.01) {
      dirRef.current.set(vxRef.current / springSpeed, vyRef.current / springSpeed);
    } else {
      dirRef.current.lerp(new THREE.Vector2(0, 1), 5.0 * dt);
    }

    // Set liquid glass physics uniforms
    mat.uniforms.uLens.value.set(pxRef.current, pyRef.current, 0.14, 1.0);
    mat.uniforms.uMotion.value.set(dirRef.current.x, dirRef.current.y, stretchRef.current, wobbleRef.current);
    mat.uniforms.uMouse.value.set(pxRef.current, pyRef.current);

    // ── Silk drift animation ──
    if (layerType === 0) {
      mesh.position.x = Math.sin(t * 0.15) * 0.01;
      mesh.position.y = Math.cos(t * 0.12) * 0.008;
    } else if (layerType === 1) {
      mesh.position.x = Math.sin(t * 0.2 + 1.5) * 0.035;
      mesh.position.y = Math.cos(t * 0.18 + 0.7) * 0.025;
    } else {
      mesh.position.x = Math.sin(t * 0.25 + 3.0) * 0.05;
      mesh.position.y = Math.cos(t * 0.22 + 2.1) * 0.04;
    }

    const parallaxStrength = 0.03 * (layerType + 1);
    mesh.position.x += (mouseTarget.current.x - 0.5) * -parallaxStrength;
    mesh.position.y += (mouseTarget.current.y - 0.5) * -parallaxStrength;

    const transitionPeak = Math.sin(textures.progress.value * Math.PI);
    const peelDistance = transitionPeak * 0.12 * (layerType + 1);
    const peelAngle = (layerType * 2.094) + 0.5;
    mesh.position.x += Math.cos(peelAngle) * peelDistance;
    mesh.position.y += Math.sin(peelAngle) * peelDistance;

    mesh.rotation.z = transitionPeak * 0.03 * (layerType === 1 ? 1 : -1);
    mesh.scale.set(width * 1.05, height * 1.05, 1);
  });

  let blending: THREE.Blending = THREE.NormalBlending;
  if (layerType === 1) blending = THREE.CustomBlending;
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
//  Synthetic Chill Plane (Spotify mode — no Web Audio)
// ──────────────────────────────────────────

function SyntheticChillPlane({ textures, layerType, mouseTarget, zOffset, playbackState, accessibility, boostValues }: ChillPlaneProps) {
  const { width, height } = useThree((s) => s.viewport);
  const size = useThree((s) => s.size);
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const mouseLerped = useRef(new THREE.Vector2(0.5, 0.5));
  const timeRef = useRef(Math.random() * 100);

  // Synthetic pulse replaces Web Audio API
  const { update: updatePulse } = useSyntheticPulse(120);

  // Liquid gooey glass lens simulation state
  const pxRef = useRef(0.5);
  const pyRef = useRef(0.5);
  const vxRef = useRef(0);
  const vyRef = useRef(0);
  const stretchRef = useRef(0);
  const wobbleRef = useRef(0);
  const wobbleVelRef = useRef(0);
  const dirRef = useRef(new THREE.Vector2(0, 1));
  
  // Mouse cursor tracking for noise-free velocity
  const smoothMouseRef = useRef(new THREE.Vector2(0.5, 0.5));
  const smoothMouseSpeedRef = useRef(0);

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
      uBass:         { value: 0.0 },
      uMid:          { value: 0.0 },
      uHigh:         { value: 0.0 },
      
      // Liquid glass properties
      uLens:         { value: new THREE.Vector4(0.5, 0.5, 0.14, 1.0) },
      uMotion:       { value: new THREE.Vector4(0, 1, 0, 0) },
      uMag:          { value: 1.15 },
      uRefract:      { value: 0.35 },
    }),
    [layerType]
  );

  useFrame((state, delta) => {
    if (!materialRef.current) return;
    const mat = materialRef.current;
    const mesh = meshRef.current;
    if (!mesh) return;

    // Update basic uniforms
    mat.uniforms.uTime.value = state.clock.elapsedTime;
    mat.uniforms.uResolution.value.set(state.size.width, state.size.height);

    // ── Synthetic pulse drives uBass, uMid, uHigh ──
    const pulse = updatePulse(delta, playbackState || null);
    const bass = pulse * 0.8;
    const mid = pulse * 0.3;
    const high = pulse * 0.15;

    // When imageBreathing is OFF, zero out the bass uniform so the shader's UV breathing stops
    if (accessibility?.imageBreathing !== false) {
      mat.uniforms.uBass.value = THREE.MathUtils.lerp(mat.uniforms.uBass.value, bass, 0.2);
    } else {
      mat.uniforms.uBass.value = THREE.MathUtils.lerp(mat.uniforms.uBass.value, 0, 0.15);
    }
    mat.uniforms.uMid.value = THREE.MathUtils.lerp(mat.uniforms.uMid.value, mid, 0.1);
    mat.uniforms.uHigh.value = THREE.MathUtils.lerp(mat.uniforms.uHigh.value, high, 0.2);

    // Assign textures and crossfade
    mat.uniforms.uTexture1.value     = textures.texture1Ref.current ?? fallbackTex;
    mat.uniforms.uTexture2.value     = textures.texture2Ref.current ?? fallbackTex;
    mat.uniforms.uHoverTexture.value = textures.hoverTextureRef.current ?? fallbackTex;
    mat.uniforms.uProgress.value     = textures.progress.value;
    mat.uniforms.uImageRes1.value.copy(textures.imageRes1);
    mat.uniforms.uImageRes2.value.copy(textures.imageRes2);
    mat.uniforms.uImageRes3.value.copy(textures.imageRes3);
    mat.uniforms.uHover.value        = textures.hoverAmount.value;

    const t = state.clock.elapsedTime;

    // Clamp delta to prevent physics engine explosions (NaN) during lag spikes, tab switching, or negative delta jitter
    const dt = THREE.MathUtils.clamp(delta, 0.0001, 0.03);

    // ── Spring-Follow Mouse Physics Simulation ──
    let tx = mouseTarget.current.x;
    let ty = mouseTarget.current.y;

    // Safety guard: if mouse coordinates are NaN or infinite (e.g. if the canvas size was 0 during reflow),
    // fall back to the current position to prevent the physics engine from collapsing.
    if (isNaN(tx) || isNaN(ty) || !isFinite(tx) || !isFinite(ty)) {
      tx = pxRef.current;
      ty = pyRef.current;
    }

    const springK = 150.0;
    const damping = 15.0;

    const ax = (tx - pxRef.current) * springK;
    const ay = (ty - pyRef.current) * springK;

    vxRef.current += ax * dt;
    vyRef.current += ay * dt;

    vxRef.current = THREE.MathUtils.clamp(vxRef.current, -15.0, 15.0);
    vyRef.current = THREE.MathUtils.clamp(vyRef.current, -15.0, 15.0);

    const dampFactor = Math.exp(-damping * dt);
    vxRef.current *= dampFactor;
    vyRef.current *= dampFactor;

    pxRef.current += vxRef.current * dt;
    pyRef.current += vyRef.current * dt;

    if (pxRef.current < -0.5) {
      pxRef.current = -0.5;
      vxRef.current = 0.0;
    } else if (pxRef.current > 1.5) {
      pxRef.current = 1.5;
      vxRef.current = 0.0;
    }

    if (pyRef.current < -0.5) {
      pyRef.current = -0.5;
      vyRef.current = 0.0;
    } else if (pyRef.current > 1.5) {
      pyRef.current = 1.5;
      vyRef.current = 0.0;
    }

    // ── Pre-Filter Pointer Events ──
    smoothMouseRef.current.lerp(new THREE.Vector2(tx, ty), 8.0 * dt);

    const lagDistance = Math.hypot(
      tx - smoothMouseRef.current.x,
      ty - smoothMouseRef.current.y
    );

    const targetStretch = Math.min(lagDistance * 3.0, 0.35);
    stretchRef.current += (targetStretch - stretchRef.current) * (1.0 - Math.exp(-12.0 * dt));

    const targetWobble = Math.min(lagDistance * 4.5, 0.6);
    wobbleRef.current += (targetWobble - wobbleRef.current) * (1.0 - Math.exp(-8.0 * dt));

    const springSpeed = Math.hypot(vxRef.current, vyRef.current);
    if (springSpeed > 0.01) {
      dirRef.current.set(vxRef.current / springSpeed, vyRef.current / springSpeed);
    } else {
      dirRef.current.lerp(new THREE.Vector2(0, 1), 5.0 * dt);
    }

    // Set liquid glass physics uniforms
    mat.uniforms.uLens.value.set(pxRef.current, pyRef.current, 0.14, 1.0);
    mat.uniforms.uMotion.value.set(dirRef.current.x, dirRef.current.y, stretchRef.current, wobbleRef.current);
    mat.uniforms.uMouse.value.set(pxRef.current, pyRef.current);

    // ── Silk drift animation ──
    if (layerType === 0) {
      mesh.position.x = Math.sin(t * 0.15) * 0.01;
      mesh.position.y = Math.cos(t * 0.12) * 0.008;
    } else if (layerType === 1) {
      mesh.position.x = Math.sin(t * 0.2 + 1.5) * 0.035;
      mesh.position.y = Math.cos(t * 0.18 + 0.7) * 0.025;
    } else {
      mesh.position.x = Math.sin(t * 0.25 + 3.0) * 0.05;
      mesh.position.y = Math.cos(t * 0.22 + 2.1) * 0.04;
    }

    const parallaxStrength = 0.03 * (layerType + 1);
    mesh.position.x += (mouseTarget.current.x - 0.5) * -parallaxStrength;
    mesh.position.y += (mouseTarget.current.y - 0.5) * -parallaxStrength;

    const transitionPeak = Math.sin(textures.progress.value * Math.PI);
    const peelDistance = transitionPeak * 0.12 * (layerType + 1);
    const peelAngle = (layerType * 2.094) + 0.5;
    mesh.position.x += Math.cos(peelAngle) * peelDistance;
    mesh.position.y += Math.sin(peelAngle) * peelDistance;

    mesh.rotation.z = transitionPeak * 0.03 * (layerType === 1 ? 1 : -1);
    mesh.scale.set(width * 1.05, height * 1.05, 1);
  });

  let blending: THREE.Blending = THREE.NormalBlending;
  if (layerType === 1) blending = THREE.CustomBlending;
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
  hoverActive,
  playbackState,
  accessibility,
  boostValues,
}: ChillSceneProps) {
  const { viewport } = useThree();
  const sparklesRef = useRef<THREE.Group>(null);
  const hasLiveAudio = playbackState && (playbackState as any).getAudioData;

  const PlaneComponent = hasLiveAudio ? ChillPlane : SyntheticChillPlane;
  
  useFrame((state, delta) => {
    if (sparklesRef.current && (accessibility?.sparkleEffects !== false)) {
      if (playbackState && (playbackState as any).getAudioData) {
        const data = (playbackState as any).getAudioData();
        if (data) {
          // Remove the scale 'zooming' (which causes the back-and-forth effect)
          sparklesRef.current.scale.setScalar(1.0);
          
          // Instead of teleporting them randomly (which creates TV static / persistence of vision),
          // use a high-speed sine wave so they smoothly but violently oscillate back and forth.
          // The distance MUST be microscopic (0.015) so we don't accidentally scramble the noise texture!
          if (data.impact > 0.1) {
            const time = state.clock.elapsedTime;
            sparklesRef.current.position.x = Math.sin(time * 50.0) * data.impact * 0.015;
            sparklesRef.current.position.y = Math.cos(time * 45.0) * data.impact * 0.015;
          } else {
            // Smoothly settle back to origin
            sparklesRef.current.position.lerp(new THREE.Vector3(0, 0, 1), 0.1);
          }
        }
      }
    }
  });

  return (
    <>
      <Float speed={0.5} rotationIntensity={0.2} floatIntensity={0.3}>
        <group ref={sparklesRef} position={[0, 0, 1]}>
          <Sparkles
            count={80}
            scale={[viewport.width * 0.8, viewport.height * 0.8, 2]}
            size={2.5}
            speed={0.3}
            color={"#ffcc88"}
            opacity={0.5}
            noise={1.5}
          />
        </group>
      </Float>

      <PlaneComponent textures={textures} layerType={0} mouseTarget={mouseTarget} zOffset={0} playbackState={playbackState} accessibility={accessibility} boostValues={boostValues} />
      <PlaneComponent textures={textures} layerType={1} mouseTarget={mouseTarget} zOffset={0.01} playbackState={playbackState} accessibility={accessibility} boostValues={boostValues} />
      <PlaneComponent textures={textures} layerType={2} mouseTarget={mouseTarget} zOffset={0.02} playbackState={playbackState} accessibility={accessibility} boostValues={boostValues} />
    </>
  );
}
