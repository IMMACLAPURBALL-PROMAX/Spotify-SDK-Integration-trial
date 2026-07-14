"use client";

import React, { useRef, useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { TrackTextures } from "@/hooks/useTrackTextures";
import { useSyntheticPulse, PlaybackState } from "@/hooks/useSyntheticPulse";
import type { AccessibilitySettings } from "@/contexts/AccessibilityContext";

interface EnergySceneProps {
  textures: TrackTextures;
  mouseTarget: React.MutableRefObject<THREE.Vector2>;
  hoverActive: boolean;
  playbackState?: PlaybackState | null;
  boostValues: { bass: number; mids: number; highs: number };
  accessibility?: AccessibilitySettings;
}

const fallbackTex = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
})();

// ──────────────────────────────────────────
// GLSL Shaders
// ──────────────────────────────────────────

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform sampler2D uTexture1;
  uniform sampler2D uTexture2;
  uniform float uProgress;
  uniform vec2 uResolution;
  uniform vec2 uImageRes1;
  uniform vec2 uImageRes2;
  
  // 0 = Dark Base, 1 = Red, 2 = Green, 3 = Blue
  uniform int uLayerType;

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

  // Desaturate
  vec3 desaturate(vec3 color, float amount) {
    float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
    return mix(color, vec3(lum), amount);
  }

  void main() {
    vec2 uv1 = coverUv(vUv, uImageRes1, uResolution);
    vec2 uv2 = coverUv(vUv, uImageRes2, uResolution);

    vec4 tex1 = texture2D(uTexture1, uv1);
    vec4 tex2 = texture2D(uTexture2, uv2);

    vec4 color = mix(tex1, tex2, uProgress);

    // Boost overall vibrancy slightly
    color.rgb = (color.rgb - 0.5) * 1.2 + 0.5;
    color.rgb = clamp(color.rgb, 0.0, 1.0);

    if (uLayerType == 0) {
      // Base layer: Grayscale, darkened, acting as the deep background
      color.rgb = desaturate(color.rgb, 1.0) * 0.15;
      gl_FragColor = vec4(color.rgb, 1.0);
    } else if (uLayerType == 1) {
      // Red channel
      gl_FragColor = vec4(color.r, 0.0, 0.0, 1.0);
    } else if (uLayerType == 2) {
      // Green channel
      gl_FragColor = vec4(0.0, color.g, 0.0, 1.0);
    } else if (uLayerType == 3) {
      // Blue channel
      gl_FragColor = vec4(0.0, 0.0, color.b, 1.0);
    }
  }
`;

interface KineticPlaneProps {
  textures: TrackTextures;
  layerType: 0 | 1 | 2 | 3;
  mouseTarget: React.MutableRefObject<THREE.Vector2>;
  zOffset: number;
  playbackState?: PlaybackState | null;
  boostValues: { bass: number; mids: number; highs: number };
  accessibility?: AccessibilitySettings;
}

// ──────────────────────────────────────────
// COMPONENT 1: Synthetic Kinetic Plane (Used for Spotify Mode)
// ──────────────────────────────────────────

function SyntheticKineticPlane({ textures, layerType, mouseTarget, zOffset, playbackState, accessibility, boostValues }: KineticPlaneProps) {
  const { width, height } = useThree((s) => s.viewport);
  const size = useThree((s) => s.size);
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const mouseLerped = useRef(new THREE.Vector2(0.5, 0.5));
  const timeRef = useRef(Math.random() * 100);
  const movementLerpRef = useRef(1.0);
  const { update: updatePulse } = useSyntheticPulse(120);

  const uniforms = useMemo(
    () => ({
      uTexture1: { value: fallbackTex },
      uTexture2: { value: fallbackTex },
      uProgress: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uImageRes1: { value: new THREE.Vector2(1, 1) },
      uImageRes2: { value: new THREE.Vector2(1, 1) },
      uLayerType: { value: layerType },
    }),
    [layerType]
  );

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    const mat = materialRef.current;
    if (!mesh || !mat) return;

    timeRef.current += delta;
    const t = timeRef.current;

    mat.uniforms.uResolution.value.set(size.width, size.height);
    mat.uniforms.uTexture1.value = textures.texture1Ref.current ?? fallbackTex;
    mat.uniforms.uTexture2.value = textures.texture2Ref.current ?? fallbackTex;
    mat.uniforms.uProgress.value = textures.progress.value;
    mat.uniforms.uImageRes1.value.copy(textures.imageRes1);
    mat.uniforms.uImageRes2.value.copy(textures.imageRes2);

    mouseLerped.current.lerp(mouseTarget.current, 0.08);

    // ── Movement Lerp ──
    const targetMovement = (accessibility?.layerMovement !== false) ? 1.0 : 0.0;
    movementLerpRef.current += (targetMovement - movementLerpRef.current) * 0.05;
    const movement = movementLerpRef.current;

    let floatX = 0;
    let floatY = 0;
    if (layerType > 0) {
      const speed = 0.5;
      const radius = 0.02;
      floatX = Math.sin(t * speed + layerType * 2.0) * radius * movement;
      floatY = Math.cos(t * speed * 1.2 + layerType * 2.0) * radius * movement;
    }

    const transitionPeak = Math.sin(textures.progress.value * Math.PI);
    const pulse = updatePulse(delta, playbackState || null);
    const activePulse = (1.0 - transitionPeak) * pulse;
    
    const explosionForce = 1.0 + (transitionPeak * 25.0 * movement) + (activePulse * 3.2 * layerType * movement);

    const parallaxX = (mouseLerped.current.x - 0.5) * -0.1 * layerType;
    const parallaxY = (mouseLerped.current.y - 0.5) * -0.1 * layerType;

    mesh.position.x = (floatX * explosionForce) + parallaxX;
    mesh.position.y = (floatY * explosionForce) + parallaxY;

    mesh.rotation.z = (Math.sin(t * 2.0 + layerType) * 0.042) * explosionForce;
    mesh.rotation.x = (parallaxY * 2.0) + (transitionPeak * (layerType % 2 === 0 ? 0.2 : -0.2) * movement);
    mesh.rotation.y = (parallaxX * 2.0) + (transitionPeak * (layerType === 1 ? 0.2 : -0.2) * movement);

    const scalePulse = 1.0 + (transitionPeak * 0.15 * layerType * movement) + (activePulse * 0.042 * layerType * movement);
    mesh.scale.set(width * scalePulse, height * scalePulse, 1);
  });

  return (
    <mesh ref={meshRef} position={[0, 0, zOffset]}>
      <planeGeometry args={[1, 1, 32, 32]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={layerType === 0 ? THREE.NormalBlending : THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// ──────────────────────────────────────────
// COMPONENT 2: Live Kinetic Plane (Used for Local MP3 Mode)
// ──────────────────────────────────────────

function LiveKineticPlane({ textures, layerType, mouseTarget, zOffset, playbackState, accessibility, boostValues }: KineticPlaneProps) {
  const { width, height } = useThree((s) => s.viewport);
  const size = useThree((s) => s.size);
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const mouseLerped = useRef(new THREE.Vector2(0.5, 0.5));
  const timeRef = useRef(Math.random() * 100);
  const movementLerpRef = useRef(1.0);

  // Transient Kick Detector State
  const prevSubRef = useRef(0);
  const prevBassRef = useRef(0);
  const kickPulseRef = useRef(0);

  // Bass Breathing State
  const smoothBassRef = useRef(0);

  // Mid Orbital Drift State
  const smoothMidRef = useRef(0);

  // Hi-Hat State
  const prevImpactRef = useRef(0);
  const hiHatCountRef = useRef(0);
  const topLayerLerpRef = useRef(0);
  const lastCycleTimeRef = useRef(0);

  const uniforms = useMemo(
    () => ({
      uTexture1: { value: fallbackTex },
      uTexture2: { value: fallbackTex },
      uProgress: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uImageRes1: { value: new THREE.Vector2(1, 1) },
      uImageRes2: { value: new THREE.Vector2(1, 1) },
      uLayerType: { value: layerType },
    }),
    [layerType]
  );

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    const mat = materialRef.current;
    if (!mesh || !mat) return;

    timeRef.current += delta;
    const t = timeRef.current;

    mat.uniforms.uResolution.value.set(size.width, size.height);
    mat.uniforms.uTexture1.value = textures.texture1Ref.current ?? fallbackTex;
    mat.uniforms.uTexture2.value = textures.texture2Ref.current ?? fallbackTex;
    mat.uniforms.uProgress.value = textures.progress.value;
    mat.uniforms.uImageRes1.value.copy(textures.imageRes1);
    mat.uniforms.uImageRes2.value.copy(textures.imageRes2);

    mouseLerped.current.lerp(mouseTarget.current, 0.08);

    // ════════════════════════════════════════
    // Read audio data ONCE per frame
    // ════════════════════════════════════════
    let currentSubBass = 0;
    let currentBass = 0;
    let currentMid = 0;
    let currentImpact = 0;

    if (playbackState && (playbackState as any).getAudioData) {
      const data = (playbackState as any).getAudioData();
      if (data) {
        currentSubBass = data.subBass * boostValues.bass;
        currentBass = data.bass * boostValues.bass;
        currentMid = data.mid * boostValues.mids;
        currentImpact = data.impact * boostValues.highs;
      }
    }

    // ── 1. The Heavy Punch (Sub-Bass + Bass) ──
    // Detect jumps independently so a flatlined 808 sub-bass doesn't bury the bass kick
    const subDelta = Math.max(0, currentSubBass - prevSubRef.current);
    const bassDelta = Math.max(0, currentBass - prevBassRef.current);
    
    prevSubRef.current = currentSubBass;
    prevBassRef.current = currentBass;

    // Filter out noisy micro-fluctuations — only real kicks pass through
    const filteredSubDelta = subDelta > 0.05 ? subDelta : 0;
    const filteredBassDelta = bassDelta > 0.05 ? bassDelta : 0;

    // Sub-bass triggers at 100% power (massive explosion).
    // Bass triggers at 30% power (minor sway/pop).
    const combinedDelta = filteredSubDelta + (filteredBassDelta * 0.3);

    // Multiply the spike so a typical kick jumps up rapidly
    kickPulseRef.current = Math.min(1.0, kickPulseRef.current + combinedDelta * 3.0);
    // Extreme exponential decay (returns to 0 quickly even if 808 stays loud)
    kickPulseRef.current *= 0.78; 
    const kickPulse = kickPulseRef.current;

    // ── 2. Scale Pop (Bass) ──
    const targetBass = Math.pow(currentBass, 1.2);
    smoothBassRef.current += (targetBass - smoothBassRef.current) * 0.2;
    const bassBreath = smoothBassRef.current;

    // ── 3. Color Drift (Mids) ──
    smoothMidRef.current += (currentMid - smoothMidRef.current) * 0.08;
    const orbitalRadius = 0.02 + smoothMidRef.current * 0.02;

    // ── 4. Color Cycling (Highs) ──

    // Detect sharp hi-hat hit to cycle colors (with 300ms cooldown)
    if (accessibility?.colorSeparation !== false) {
      const now = performance.now();
      if (currentImpact > 0.2 && prevImpactRef.current <= 0.2 && (now - lastCycleTimeRef.current) > 300) {
        hiHatCountRef.current += 1;
        lastCycleTimeRef.current = now;
      }
    }
    prevImpactRef.current = currentImpact;

    // Determine Z-Index & Top Layer
    let dynamicZ = zOffset;
    let isTopLayer = false;
    if (layerType > 0 && (accessibility?.colorSeparation !== false)) {
      const zIndex = ((layerType - 1 + hiHatCountRef.current) % 3) + 1; // 1, 2, or 3
      dynamicZ = zIndex * 0.01;
      isTopLayer = (zIndex === 3); // 3 is the top-most Z-index
    }

    // Smoothly transition between 0.0 (normal) and 1.0 (top layer) to prevent violent shaking
    const targetTop = isTopLayer ? 1.0 : 0.0;
    topLayerLerpRef.current += (targetTop - topLayerLerpRef.current) * 0.15;
    const topLerp = topLayerLerpRef.current;

    // ── Movement Lerp ──
    const targetMovement = (accessibility?.layerMovement !== false) ? 1.0 : 0.0;
    movementLerpRef.current += (targetMovement - movementLerpRef.current) * 0.05;
    const movement = movementLerpRef.current;

    // ── Base Float (Circle) ──
    let floatX = 0;
    let floatY = 0;
    if (layerType > 0) {
      const speed = 0.5;
      // Make the top layer orbit slightly wider so its color forms a visible halo (smoothly interpolated)
      const activeRadius = orbitalRadius * (1.0 + (topLerp * 1.5)); 
      floatX = Math.sin(t * speed + layerType * 2.0) * activeRadius * movement;
      floatY = Math.cos(t * speed * 1.2 + layerType * 2.0) * activeRadius * movement;
    }

    // ── Transition slam ──
    const transitionPeak = Math.sin(textures.progress.value * Math.PI);
    const transitionForce = 1.0 + (transitionPeak * 25.0 * movement);

    // Apply transition force to float
    floatX *= transitionForce;
    floatY *= transitionForce;

    // ── Decoupled Straight-Line Punch ──
    const punchAngle = layerType * ((Math.PI * 2) / 3); 
    const punchForce = kickPulse * 0.12 * movement; 
    let punchX = 0;
    let punchY = 0;
    if (layerType > 0) {
      punchX = Math.cos(punchAngle) * punchForce;
      punchY = Math.sin(punchAngle) * punchForce;
    }

    // Parallax
    const parallaxX = (mouseLerped.current.x - 0.5) * -0.1 * layerType;
    const parallaxY = (mouseLerped.current.y - 0.5) * -0.1 * layerType;

    // Assemble final position
    mesh.position.x = floatX + punchX + parallaxX;
    mesh.position.y = floatY + punchY + parallaxY;
    mesh.position.z = dynamicZ;

    // Rotation
    const rotForce = transitionForce; // Removed kickPulse to stop chaotic twisting/shaking
    mesh.rotation.z = (Math.sin(t * 2.0 + layerType) * 0.042) * rotForce;
    mesh.rotation.x = (parallaxY * 2.0) + (transitionPeak * (layerType % 2 === 0 ? 0.2 : -0.2) * movement);
    mesh.rotation.y = (parallaxX * 2.0) + (transitionPeak * (layerType === 1 ? 0.2 : -0.2) * movement);

    // Scale
    const scalePulse = 1.0 
      + (transitionPeak * 0.15 * layerType * movement) 
      + (bassBreath * 0.04 * layerType * movement)
      + (kickPulse * 0.02 * layerType * movement)
      + (topLerp * 0.015); // Smoothly interpolated tiny scale boost
    mesh.scale.set(width * scalePulse, height * scalePulse, 1);
  });

  return (
    <mesh ref={meshRef} position={[0, 0, zOffset]}>
      <planeGeometry args={[1, 1, 32, 32]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={layerType === 0 ? THREE.NormalBlending : THREE.AdditiveBlending}
      />
    </mesh>
  );
}


// ──────────────────────────────────────────
// Main Export
// ──────────────────────────────────────────

export function EnergyScene(props: EnergySceneProps) {
  const hasLiveAudio = props.playbackState && (props.playbackState as any).getAudioData;

  return (
    <>
      {hasLiveAudio ? (
        <>
          <LiveKineticPlane textures={props.textures} layerType={0} mouseTarget={props.mouseTarget} zOffset={0} playbackState={props.playbackState} accessibility={props.accessibility} boostValues={props.boostValues} />
          <LiveKineticPlane textures={props.textures} layerType={1} mouseTarget={props.mouseTarget} zOffset={0.01} playbackState={props.playbackState} accessibility={props.accessibility} boostValues={props.boostValues} />
          <LiveKineticPlane textures={props.textures} layerType={2} mouseTarget={props.mouseTarget} zOffset={0.02} playbackState={props.playbackState} accessibility={props.accessibility} boostValues={props.boostValues} />
          <LiveKineticPlane textures={props.textures} layerType={3} mouseTarget={props.mouseTarget} zOffset={0.03} playbackState={props.playbackState} accessibility={props.accessibility} boostValues={props.boostValues} />
        </>
      ) : (
        <>
          <SyntheticKineticPlane textures={props.textures} layerType={0} mouseTarget={props.mouseTarget} zOffset={0} playbackState={props.playbackState} accessibility={props.accessibility} boostValues={props.boostValues} />
          <SyntheticKineticPlane textures={props.textures} layerType={1} mouseTarget={props.mouseTarget} zOffset={0.01} playbackState={props.playbackState} accessibility={props.accessibility} boostValues={props.boostValues} />
          <SyntheticKineticPlane textures={props.textures} layerType={2} mouseTarget={props.mouseTarget} zOffset={0.02} playbackState={props.playbackState} accessibility={props.accessibility} boostValues={props.boostValues} />
          <SyntheticKineticPlane textures={props.textures} layerType={3} mouseTarget={props.mouseTarget} zOffset={0.03} playbackState={props.playbackState} accessibility={props.accessibility} boostValues={props.boostValues} />
        </>
      )}
    </>
  );
}
