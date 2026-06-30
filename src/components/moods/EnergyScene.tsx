"use client";

import React, { useRef, useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { MeshDistortMaterial } from "@react-three/drei";
import {
  EffectComposer,
  Bloom,
  ChromaticAberration,
  Glitch,
} from "@react-three/postprocessing";
import type { TrackTextures } from "@/hooks/useTrackTextures";

// ──────────────────────────────────────────
//  Props
// ──────────────────────────────────────────

interface EnergySceneProps {
  textures: TrackTextures;
  mouseTarget: React.MutableRefObject<THREE.Vector2>;
  hoverActive: boolean;
}

// ──────────────────────────────────────────
//  Constants
// ──────────────────────────────────────────

const PARTICLE_COUNT = 150;

/** Neon palette for streak particles */
const NEON_COLORS = [
  new THREE.Color("#ff1493"), // hot pink
  new THREE.Color("#00ffff"), // electric blue
  new THREE.Color("#39ff14"), // acid green
];

const fallbackTex = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
})();

// ──────────────────────────────────────────
//  GLSL — Background Plane Shader
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
  uniform sampler2D uHoverTexture;
  uniform float uProgress;
  uniform float uHover;
  uniform vec2 uMouse;
  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec2 uImageRes1;
  uniform vec2 uImageRes2;
  uniform vec2 uImageRes3;

  // ── Simplex 3D noise (Ashima Arts / Stefan Gustavson) ──

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }

  // ── Cover-fit UV calculation ──

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

  // ── Saturation boost ──

  vec3 adjustSaturation(vec3 color, float amount) {
    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
    return mix(vec3(luminance), color, amount);
  }

  // ── Contrast boost ──

  vec3 adjustContrast(vec3 color, float contrast) {
    return (color - 0.5) * contrast + 0.5;
  }

  void main() {
    vec2 uv = vUv;

    // ── BPM-synced pulsing distortion (~2Hz = ~120 BPM) ──
    // sin(uTime * 6.28) cycles once per second; we modulate amplitude 0.01–0.03
    float pulse = sin(uTime * 6.28);
    float distortAmp = mix(0.01, 0.03, pulse * 0.5 + 0.5);

    // High-speed, high-scale simplex noise UV distortion
    float noiseX = snoise(vec3(uv * 14.0, uTime * 0.6));
    float noiseY = snoise(vec3(uv * 14.0 + 100.0, uTime * 0.6));
    vec2 distortedUv = uv + vec2(noiseX, noiseY) * distortAmp;

    // Cover-fit UVs for both textures
    vec2 uv1 = coverUv(distortedUv, uImageRes1, uResolution);
    vec2 uv2 = coverUv(distortedUv, uImageRes2, uResolution);

    // Sample and crossfade
    vec4 tex1 = texture2D(uTexture1, uv1);
    vec4 tex2 = texture2D(uTexture2, uv2);

    vec4 baseColor;
    if (uProgress <= 0.0) {
      baseColor = tex1;
    } else if (uProgress >= 1.0) {
      baseColor = tex2;
    } else {
      baseColor = mix(tex1, tex2, uProgress);
    }

    // Boost saturation (1.4 = 40% more vivid) and contrast (1.2 = 20% more punch)
    baseColor.rgb = adjustSaturation(baseColor.rgb, 1.4);
    baseColor.rgb = adjustContrast(baseColor.rgb, 1.2);

    // Dark club-like overlay
    baseColor.rgb *= 0.85;

    // ── Hover: "Glitch Tear" reveal circle with RGB channel splitting ──
    if (uHover > 0.0) {
      vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
      vec2 mouseAspect = uMouse * aspect;
      vec2 uvAspect = uv * aspect;
      float dist = distance(uvAspect, mouseAspect);

      // Flickering radius: base 0.1, jitter with fast noise
      float radiusJitter = snoise(vec3(uMouse * 20.0, uTime * 8.0)) * 0.015;
      float radius = (0.1 + radiusJitter) * uHover;

      // Sharp edge: tiny smoothstep feather (0.01)
      float circle = 1.0 - smoothstep(radius - 0.01, radius, dist);

      // RGB channel splitting for glitch effect (offset ~0.008 in different directions)
      float chromaOffset = 0.008 * uHover;
      vec2 hoverUvBase = coverUv(uv, uImageRes3, uResolution);

      float r = texture2D(uHoverTexture, hoverUvBase + vec2( chromaOffset,  0.0)).r;
      float g = texture2D(uHoverTexture, hoverUvBase + vec2(-chromaOffset,  chromaOffset)).g;
      float b = texture2D(uHoverTexture, hoverUvBase + vec2( 0.0,         -chromaOffset)).b;

      vec4 hoverColor = vec4(r, g, b, 1.0);

      baseColor = mix(baseColor, hoverColor, circle);
    }

    gl_FragColor = baseColor;
  }
`;

// ──────────────────────────────────────────
//  Background Plane (Layer 1)
// ──────────────────────────────────────────

function BackgroundPlane({
  textures,
  mouseTarget,
  hoverActive,
}: EnergySceneProps) {
  const { width, height } = useThree((s) => s.viewport);
  const size = useThree((s) => s.size);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const mouseLerped = useRef(new THREE.Vector2(0.5, 0.5));

  const uniforms = useMemo(
    () => ({
      uTexture1: { value: fallbackTex },
      uTexture2: { value: fallbackTex },
      uHoverTexture: { value: fallbackTex },
      uProgress: { value: 0 },
      uHover: { value: 0 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uImageRes1: { value: new THREE.Vector2(1, 1) },
      uImageRes2: { value: new THREE.Vector2(1, 1) },
      uImageRes3: { value: new THREE.Vector2(1, 1) },
    }),
    []
  );

  useFrame((state) => {
    const mat = materialRef.current;
    if (!mat) return;

    // Time
    mat.uniforms.uTime.value = state.clock.getElapsedTime();

    // Resolution
    mat.uniforms.uResolution.value.set(size.width, size.height);

    // Smooth mouse lerp
    mouseLerped.current.lerp(mouseTarget.current, 0.08);
    mat.uniforms.uMouse.value.copy(mouseLerped.current);

    // Textures from shared hook
    mat.uniforms.uTexture1.value = textures.texture1Ref.current ?? fallbackTex;
    mat.uniforms.uTexture2.value = textures.texture2Ref.current ?? fallbackTex;
    mat.uniforms.uHoverTexture.value = textures.hoverTextureRef.current ?? fallbackTex;

    // Animated values
    mat.uniforms.uProgress.value = textures.progress.value;
    mat.uniforms.uHover.value = textures.hoverAmount.value;

    // Image resolutions
    mat.uniforms.uImageRes1.value.copy(textures.imageRes1);
    mat.uniforms.uImageRes2.value.copy(textures.imageRes2);
    mat.uniforms.uImageRes3.value.copy(textures.imageRes3);
  });

  return (
    <mesh scale={[width, height, 1]} position={[0, 0, 0]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
      />
    </mesh>
  );
}

// ──────────────────────────────────────────
//  Distort Blob (Layer 2)
// ──────────────────────────────────────────

function DistortBlob() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((_state, delta) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.z += delta * 0.1;
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0.1]} scale={[3.5, 3.5, 3.5]}>
      <sphereGeometry args={[2.0, 64, 64]} />
      <MeshDistortMaterial
        distort={0.5}
        speed={5}
        roughness={0.2}
        metalness={0.1}
        color="#ff1493"
        emissive="#ff1493"
        emissiveIntensity={0.4}
        toneMapped={false}
        transparent
        opacity={0.25}
        depthWrite={false}
      />
    </mesh>
  );
}

// ──────────────────────────────────────────
//  Streak Particles (Layer 3)
// ──────────────────────────────────────────

/** Per-particle speed stored alongside the buffer geometry */
interface ParticleData {
  positions: Float32Array;
  colors: Float32Array;
  speeds: Float32Array;
}

function useParticleData(): ParticleData {
  return useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const speeds = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;

      // Random position spread across [-3, 3] in x/y, [0.05, 0.5] in z
      positions[i3] = (Math.random() - 0.5) * 6; // x: [-3, 3]
      positions[i3 + 1] = (Math.random() - 0.5) * 6; // y: [-3, 3]
      positions[i3 + 2] = 0.05 + Math.random() * 0.45; // z: [0.05, 0.5]

      // Cycle through neon colors
      const color = NEON_COLORS[i % NEON_COLORS.length];
      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;

      // Random speed per particle (0.5 – 2.0)
      speeds[i] = 0.5 + Math.random() * 1.5;
    }

    return { positions, colors, speeds };
  }, []);
}

function StreakParticles() {
  const pointsRef = useRef<THREE.Points>(null);
  const { positions, colors, speeds } = useParticleData();

  useFrame((_state, delta) => {
    if (!pointsRef.current) return;
    const posAttr = pointsRef.current.geometry.getAttribute(
      "position"
    ) as THREE.BufferAttribute;
    const posArray = posAttr.array as Float32Array;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      const speed = speeds[i] * delta;

      // Move diagonally
      posArray[i3] += speed; // x
      posArray[i3 + 1] += speed * 0.5; // y

      // Wrap around when exiting bounds
      if (posArray[i3] > 3) posArray[i3] = -3;
      if (posArray[i3 + 1] > 3) posArray[i3 + 1] = -3;
    }

    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={3.0}
        sizeAttenuation
        vertexColors
        transparent
        depthWrite={false}
        toneMapped={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ──────────────────────────────────────────
//  Post-Processing Stack
// ──────────────────────────────────────────

/** Chromatic aberration offset as a stable Vector2 */
const CHROMA_OFFSET = new THREE.Vector2(0.0025, 0.0025);

/** Glitch timing vectors */
const GLITCH_DELAY = new THREE.Vector2(2.0, 4.0);
const GLITCH_DURATION = new THREE.Vector2(0.1, 0.25);
const GLITCH_STRENGTH = new THREE.Vector2(0.05, 0.15);

function EnergyPostProcessing() {
  return (
    <EffectComposer>
      {/* Heavy neon glow — picks up emissive + toneMapped={false} elements */}
      <Bloom
        luminanceThreshold={0.85}
        luminanceSmoothing={0.1}
        intensity={1.2}
        mipmapBlur
      />
      {/* Subtle RGB edge splitting for that club-monitor feel */}
      <ChromaticAberration offset={CHROMA_OFFSET} />
      {/* Occasional digital distortion bursts */}
      <Glitch
        delay={GLITCH_DELAY}
        duration={GLITCH_DURATION}
        strength={GLITCH_STRENGTH}
      />
    </EffectComposer>
  );
}

// ──────────────────────────────────────────
//  Main Export
// ──────────────────────────────────────────

export function EnergyScene(props: EnergySceneProps) {
  return (
    <>
      {/* Layer 1: Fullscreen album art with noise distortion + crossfade + hover */}
      <BackgroundPlane {...props} />

      {/* Layer 2: Semi-transparent pulsing organic blob */}
      <DistortBlob />

      {/* Layer 3: Fast-moving neon streak particles */}
      <StreakParticles />

      {/* Post-processing: Bloom + ChromaticAberration + Glitch */}
      <EnergyPostProcessing />
    </>
  );
}

export default EnergyScene;
