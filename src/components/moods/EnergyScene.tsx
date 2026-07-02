"use client";

import React, { useRef, useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { TrackTextures } from "@/hooks/useTrackTextures";
import { useSyntheticPulse, PlaybackState } from "@/hooks/useSyntheticPulse";

interface EnergySceneProps {
  textures: TrackTextures;
  mouseTarget: React.MutableRefObject<THREE.Vector2>;
  hoverActive: boolean;
  playbackState?: PlaybackState | null;
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

// ──────────────────────────────────────────
// Kinetic Plane Component
// ──────────────────────────────────────────

interface KineticPlaneProps {
  textures: TrackTextures;
  layerType: 0 | 1 | 2 | 3;
  mouseTarget: React.MutableRefObject<THREE.Vector2>;
  zOffset: number;
  playbackState?: PlaybackState | null;
}

function KineticPlane({ textures, layerType, mouseTarget, zOffset, playbackState }: KineticPlaneProps) {
  const { width, height } = useThree((s) => s.viewport);
  const size = useThree((s) => s.size);
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  // Smooth mouse
  const mouseLerped = useRef(new THREE.Vector2(0.5, 0.5));

  // Physics state
  const timeRef = useRef(Math.random() * 100); // Random offset for organic float
  const subBassRef = useRef(0);
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

    // Calculate Physical Animation
    // 1. Base Float: Organic, drifting
    let floatX = 0;
    let floatY = 0;
    
    // The GSAP Transition Slam
    const transitionPeak = Math.sin(textures.progress.value * Math.PI);
    
    // 3. Audio Reactivity Pulse
    let activePulse = 0;
    let chromaticMulti = 1.0;
    let speedMulti = 1.0;
      // SYNTHETIC Pulse Engine (120BPM)
      const pulse = updatePulse(delta, playbackState || null);
      activePulse = (1.0 - transitionPeak) * pulse;

    if (layerType > 0) {
      // Each RGB plane floats in a slightly different orbital direction
      const speed = 0.5 * speedMulti;
      const radius = 0.02 * chromaticMulti; // Small base offset, expands on Mid hits
      floatX = Math.sin(t * speed + layerType * 2.0) * radius;
      floatY = Math.cos(t * speed * 1.2 + layerType * 2.0) * radius;
    }

    // 2. Mouse Parallax
    const parallaxX = (mouseLerped.current.x - 0.5) * -0.05 * (layerType + 1);
    const parallaxY = (mouseLerped.current.y - 0.5) * -0.05 * (layerType + 1);

    // When transitioning, multiply the float distance massively so they explode outward
    // During normal playback, the activePulse causes rhythmic micro-explosions
    const explosionFactor = 1.0 + (transitionPeak * 20.0) + (activePulse * 1.5);

    // Apply final positions
    mesh.position.x = (floatX + parallaxX) * explosionFactor;
    mesh.position.y = (floatY + parallaxY) * explosionFactor;

    // Add a chaotic tilt during the explosion
    mesh.rotation.z = (Math.sin(t * 2.0 + layerType) * 0.05) * explosionFactor;
    mesh.rotation.x = (parallaxY * 2.0) + (transitionPeak * (layerType % 2 === 0 ? 0.2 : -0.2));
    mesh.rotation.y = (parallaxX * 2.0) + (transitionPeak * (layerType === 1 ? 0.2 : -0.2));

    // Add jitter on heavy hi-hat hits
    if (speedMulti > 2.5 && layerType > 0) {
       mesh.rotation.z += (Math.random() - 0.5) * 0.008 * (speedMulti - 1.0);
    }

    // Scale up slightly during explosion to add depth
    const scalePulse = 1.0 + (transitionPeak * 0.15 * layerType) + (activePulse * 0.08 * layerType);
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
  return (
    <>
      {/* 
        The 4 Shattered Planes.
        They render back-to-front.
        Base is drawn normally. R, G, B are drawn with Additive Blending.
        When perfectly aligned, R+G+B perfectly reconstruct the full color image!
      */}
      <KineticPlane {...props} layerType={0} zOffset={0} playbackState={props.playbackState} />     {/* Dark Base */}
      <KineticPlane {...props} layerType={1} zOffset={0.01} playbackState={props.playbackState} />  {/* Red */}
      <KineticPlane {...props} layerType={2} zOffset={0.02} playbackState={props.playbackState} />  {/* Green */}
      <KineticPlane {...props} layerType={3} zOffset={0.03} playbackState={props.playbackState} />  {/* Blue */}
    </>
  );
}

export default EnergyScene;
