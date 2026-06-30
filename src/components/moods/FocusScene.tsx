"use client";

import { useRef, useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import {
  EffectComposer,
  DepthOfField,
  Vignette,
} from "@react-three/postprocessing";
import type { TrackTextures } from "@/hooks/useTrackTextures";

// ─── Props ───────────────────────────────────────────────────────────────────

interface FocusSceneProps {
  textures: TrackTextures;
  mouseTarget: React.MutableRefObject<THREE.Vector2>;
  hoverActive: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const NUM_POINTS = 25;
const LINE_PROXIMITY_THRESHOLD = 1.5;
/** Maximum possible line segments (n choose 2) */
const MAX_LINES = (NUM_POINTS * (NUM_POINTS - 1)) / 2;

// ─── GLSL Shaders ────────────────────────────────────────────────────────────

const backgroundVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const backgroundFragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uTexture1;
  uniform sampler2D uTexture2;
  uniform sampler2D uHoverTexture;
  uniform float uProgress;
  uniform float uTime;
  uniform float uHover;
  uniform vec2 uResolution;
  uniform vec2 uImageRes1;
  uniform vec2 uImageRes2;
  uniform vec2 uImageRes3;
  uniform vec2 uMouse;

  varying vec2 vUv;

  // ── Cover-fit UV helper ──
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

  // ── Desaturation + cool shift ("frosted glass") ──
  vec3 frostedGlass(vec3 col) {
    // Luminance (perceptual weights)
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    // Mix 40 % toward luminance → desaturate
    vec3 desat = mix(col, vec3(lum), 0.4);
    // Cool shift: -5 % red, +5 % blue
    desat.r *= 0.95;
    desat.b *= 1.05;
    return desat;
  }

  void main() {
    // ── Breathing scale pulse (period ~10s, amplitude 0.002) ──
    float breathe = 1.0 + sin(uTime * 0.6283185) * 0.002; // 2π / 10
    // ── Ultra-slow UV drift (0.001 units/s, diagonal direction) ──
    vec2 drift = vec2(uTime * 0.0007, uTime * 0.0003);

    vec2 uv = (vUv - 0.5) / breathe + 0.5 + drift;

    // ── Sample both textures with cover-fit UVs ──
    vec2 uv1 = coverUv(uv, uImageRes1, uResolution);
    vec2 uv2 = coverUv(uv, uImageRes2, uResolution);

    vec4 col1 = texture2D(uTexture1, uv1);
    vec4 col2 = texture2D(uTexture2, uv2);

    // Crossfade
    vec4 base = mix(col1, col2, uProgress);

    // Apply frosted glass treatment
    base.rgb = frostedGlass(base.rgb);

    // ── Hover circle: "Crystal Frame" ──
    if (uHover > 0.001) {
      float radius = 0.09;
      float feather = 0.003;
      float borderWidth = 0.003;

      // Mouse is 0-1 in screen space — convert to UV space
      vec2 mouseUv = uMouse;

      // Distance from current fragment to mouse (aspect-corrected)
      float aspect = uResolution.x / uResolution.y;
      vec2 diff = vUv - mouseUv;
      diff.x *= aspect;
      float dist = length(diff);

      // Parallax: offset hover texture UVs opposite to mouse velocity direction
      // We approximate by offsetting relative to center (0.5, 0.5)
      vec2 parallaxOffset = (uMouse - 0.5) * -0.03;

      // Hover texture UV (clean cover-fit, with parallax)
      vec2 hoverSampleUv = vUv + parallaxOffset;
      vec2 uvH = coverUv(hoverSampleUv, uImageRes3, uResolution);
      vec4 hoverCol = texture2D(uHoverTexture, uvH);

      // Circle mask with crisp edge
      float circleMask = 1.0 - smoothstep(radius - feather, radius, dist);
      circleMask *= uHover; // fade in/out with hover amount

      // White border ring
      float borderOuter = 1.0 - smoothstep(radius - feather, radius, dist);
      float borderInner = 1.0 - smoothstep(radius - borderWidth - feather, radius - borderWidth, dist);
      float borderMask = borderOuter - borderInner;
      borderMask = max(borderMask, 0.0) * uHover;

      // Composite: replace base with hover inside circle
      base.rgb = mix(base.rgb, hoverCol.rgb, circleMask);
      // Add white border on top
      base.rgb = mix(base.rgb, vec3(1.0), borderMask * 0.9);
    }

    gl_FragColor = base;
  }
`;

// ─── Constellation point data generation ─────────────────────────────────────

interface PointOrbit {
  angle: number;
  radius: number;
  speed: number;
}

function generateOrbits(): PointOrbit[] {
  const orbits: PointOrbit[] = [];
  for (let i = 0; i < NUM_POINTS; i++) {
    orbits.push({
      angle: Math.random() * Math.PI * 2,
      radius: 0.3 + Math.random() * 2.2, // spread across viewport area
      speed:
        (Math.PI * 2) / (30 + Math.random() * 30) * // 30–60s full orbit
        (Math.random() > 0.5 ? 1 : -1), // random direction
    });
  }
  return orbits;
}

// ─── Constellation sub-component ─────────────────────────────────────────────

function Constellation() {
  const pointsRef = useRef<THREE.Points>(null);
  const linesRef = useRef<THREE.LineSegments>(null);

  const orbits = useMemo(() => generateOrbits(), []);

  // Pre-allocate position buffers
  const pointPositions = useMemo(() => new Float32Array(NUM_POINTS * 3), []);
  const linePositions = useMemo(() => new Float32Array(MAX_LINES * 6), []); // 2 verts × 3 coords per line
  const lineColors = useMemo(() => new Float32Array(MAX_LINES * 8), []); // 2 verts × 4 (RGBA) per line

  // Geometry objects with buffer attributes (created once)
  const pointGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(pointPositions, 3)
    );
    return geo;
  }, [pointPositions]);

  const lineGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(linePositions, 3)
    );
    geo.setAttribute("color", new THREE.BufferAttribute(lineColors, 4));
    // Start with zero draw range — we'll update each frame
    geo.setDrawRange(0, 0);
    return geo;
  }, [linePositions, lineColors]);

  useFrame((_state, delta) => {
    // ── Update point positions based on orbits ──
    for (let i = 0; i < NUM_POINTS; i++) {
      const o = orbits[i];
      o.angle += o.speed * delta;
      const x = Math.cos(o.angle) * o.radius;
      const y = Math.sin(o.angle) * o.radius;
      pointPositions[i * 3] = x;
      pointPositions[i * 3 + 1] = y;
      pointPositions[i * 3 + 2] = 0.15;
    }

    if (pointsRef.current) {
      pointsRef.current.geometry.attributes.position.needsUpdate = true;
    }

    // ── Compute line segments between proximate points ──
    let lineCount = 0;
    const threshold = LINE_PROXIMITY_THRESHOLD;
    const thresholdSq = threshold * threshold;

    for (let i = 0; i < NUM_POINTS; i++) {
      const ax = pointPositions[i * 3];
      const ay = pointPositions[i * 3 + 1];
      for (let j = i + 1; j < NUM_POINTS; j++) {
        const bx = pointPositions[j * 3];
        const by = pointPositions[j * 3 + 1];
        const dx = bx - ax;
        const dy = by - ay;
        const distSq = dx * dx + dy * dy;

        if (distSq < thresholdSq) {
          const dist = Math.sqrt(distSq);
          // Fade: fully opaque when close, transparent at threshold
          const alpha = (1.0 - dist / threshold) * 0.1; // base max 0.1

          const idx = lineCount * 6;
          linePositions[idx] = ax;
          linePositions[idx + 1] = ay;
          linePositions[idx + 2] = 0.15;
          linePositions[idx + 3] = bx;
          linePositions[idx + 4] = by;
          linePositions[idx + 5] = 0.15;

          const cidx = lineCount * 8;
          // vertex A color (white, per-vertex alpha)
          lineColors[cidx] = 1.0;
          lineColors[cidx + 1] = 1.0;
          lineColors[cidx + 2] = 1.0;
          lineColors[cidx + 3] = alpha;
          // vertex B color
          lineColors[cidx + 4] = 1.0;
          lineColors[cidx + 5] = 1.0;
          lineColors[cidx + 6] = 1.0;
          lineColors[cidx + 7] = alpha;

          lineCount++;
          if (lineCount >= MAX_LINES) break;
        }
      }
      if (lineCount >= MAX_LINES) break;
    }

    // Update draw range and flag buffers dirty
    lineGeometry.setDrawRange(0, lineCount * 2); // 2 vertices per segment
    lineGeometry.attributes.position.needsUpdate = true;
    lineGeometry.attributes.color.needsUpdate = true;
  });

  return (
    <>
      {/* Constellation points */}
      <points ref={pointsRef} geometry={pointGeometry} frustumCulled={false}>
        <pointsMaterial
          color="#ffffff"
          size={2.0}
          sizeAttenuation={false}
          transparent
          opacity={0.2}
          depthWrite={false}
        />
      </points>

      {/* Constellation line connections */}
      <lineSegments
        ref={linesRef}
        geometry={lineGeometry}
        frustumCulled={false}
      >
        <lineBasicMaterial
          transparent
          depthWrite={false}
          vertexColors
        />
      </lineSegments>
    </>
  );
}

// ─── Background Plane sub-component ──────────────────────────────────────────

const PLACEHOLDER_TEX = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
})();

function BackgroundPlane({
  textures,
  mouseTarget,
  hoverActive,
}: FocusSceneProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { width, height } = useThree((s) => s.viewport);
  const size = useThree((s) => s.size);

  // Local smoothed mouse
  const smoothMouse = useRef(new THREE.Vector2(0.5, 0.5));

  const uniforms = useMemo(
    () => ({
      uTexture1: { value: PLACEHOLDER_TEX },
      uTexture2: { value: PLACEHOLDER_TEX },
      uHoverTexture: { value: PLACEHOLDER_TEX },
      uProgress: { value: 0.0 },
      uTime: { value: 0.0 },
      uHover: { value: 0.0 },
      uResolution: { value: new THREE.Vector2(size.width, size.height) },
      uImageRes1: { value: new THREE.Vector2(1, 1) },
      uImageRes2: { value: new THREE.Vector2(1, 1) },
      uImageRes3: { value: new THREE.Vector2(1, 1) },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useFrame((_state, delta) => {
    const mat = matRef.current;
    if (!mat) return;

    // Lerp mouse toward target
    smoothMouse.current.lerp(mouseTarget.current, 1.0 - Math.pow(0.05, delta));

    // Update uniforms
    mat.uniforms.uTexture1.value = textures.texture1Ref.current ?? PLACEHOLDER_TEX;
    mat.uniforms.uTexture2.value = textures.texture2Ref.current ?? PLACEHOLDER_TEX;
    mat.uniforms.uHoverTexture.value = textures.hoverTextureRef.current ?? PLACEHOLDER_TEX;
    mat.uniforms.uProgress.value = textures.progress.value;
    mat.uniforms.uHover.value = textures.hoverAmount.value;
    mat.uniforms.uTime.value += delta;
    mat.uniforms.uResolution.value.set(size.width, size.height);
    mat.uniforms.uImageRes1.value.copy(textures.imageRes1);
    mat.uniforms.uImageRes2.value.copy(textures.imageRes2);
    mat.uniforms.uImageRes3.value.copy(textures.imageRes3);
    mat.uniforms.uMouse.value.copy(smoothMouse.current);
  });

  return (
    <mesh ref={meshRef} frustumCulled={false} scale={[width, height, 1]}>
      {/* Full-viewport quad — covers NDC -1..1 */}
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={backgroundVertexShader}
        fragmentShader={backgroundFragmentShader}
        uniforms={uniforms}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export function FocusScene(props: FocusSceneProps) {
  return (
    <>
      {/* Layer 1 — Album art background with frosted glass treatment */}
      <BackgroundPlane {...props} />

      {/* Layer 2 — Constellation wireframe overlay */}
      <Constellation />

      {/* Post-processing — minimal & pristine */}
      <EffectComposer>
        <DepthOfField
          focusDistance={0.005}
          focalLength={0.01}
          bokehScale={3}
        />
        <Vignette offset={0.25} darkness={0.5} />
      </EffectComposer>
    </>
  );
}
