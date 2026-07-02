"use client";

import React, { useRef, useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Float, Sparkles } from "@react-three/drei";
import type { TrackTextures } from "@/hooks/useTrackTextures";

interface FocusSceneProps {
  textures: TrackTextures;
  mouseTarget: React.MutableRefObject<THREE.Vector2>;
  hoverActive: boolean;
  playbackState?: any;
}

const fallbackTex = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
})();

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
  uniform float uTime;
  uniform int uLayerType;

  uniform float uBass;
  uniform float uMid;
  uniform float uHigh;

  uniform sampler2D uHoverTexture;
  uniform float uHover;
  uniform vec2 uMouse;
  uniform vec2 uImageRes3;

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
    float breathe = 1.0 + sin(uTime * 0.785) * 0.003 - (uBass * 0.03);
    vec2 uv = (vUv - 0.5) * breathe + 0.5;

    vec2 uv1 = coverUv(uv, uImageRes1, uResolution);
    vec2 uv2 = coverUv(uv, uImageRes2, uResolution);

    vec4 tex1 = texture2D(uTexture1, uv1);
    vec4 tex2 = texture2D(uTexture2, uv2);
    vec4 color = mix(tex1, tex2, uProgress);

    float lum = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));

    if (uLayerType == 0) {
      vec3 desat = mix(color.rgb, vec3(lum), 0.7);
      desat *= 0.35;
      float dist = length(vUv - 0.5) * 1.414;
      float vig = smoothstep(0.2, 1.2, dist);
      desat *= 1.0 - vig * 0.5;
      gl_FragColor = vec4(desat, 1.0);
    } else if (uLayerType == 1) {
      vec3 warm = color.rgb * (1.0 + uMid * 0.2);
      float midMask = smoothstep(0.1, 0.35, lum) * (1.0 - smoothstep(0.65, 0.9, lum));
      warm *= midMask * 1.2;
      float grain = fract(sin(dot(vUv * uTime * 0.1, vec2(12.9898, 78.233))) * 43758.5453);
      warm += (grain - 0.5) * (0.015 + uHigh * 0.08);
      gl_FragColor = vec4(clamp(warm, 0.0, 1.0), 0.6);
    } else if (uLayerType == 2) {
      float highlightMask = smoothstep(0.5, 0.85, lum);
      vec3 glow = color.rgb * highlightMask;
      gl_FragColor = vec4(glow, highlightMask * 0.7);
    }

    if (uLayerType == 0 && uHover > 0.001) {
      vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
      float d = length((vUv - uMouse) * aspect);
      float circle = 1.0 - smoothstep(0.07, 0.15, d);
      circle *= uHover;

      vec2 hoverUv = coverUv(uv, uImageRes3, uResolution);
      vec4 hoverCol = texture2D(uHoverTexture, hoverUv);

      vec3 hoverWarm = vec3(hoverCol.r * 1.06, hoverCol.g * 1.02, hoverCol.b * 0.88);
      hoverCol.rgb = mix(hoverCol.rgb, hoverWarm, 0.3);
      float hLum = dot(hoverCol.rgb, vec3(0.2126, 0.7152, 0.0722));
      hoverCol.rgb = mix(hoverCol.rgb, vec3(hLum), 0.7) * 0.35;

      gl_FragColor.rgb = mix(gl_FragColor.rgb, hoverCol.rgb, circle);
    }
  }
`;

interface FocusPlaneProps {
  textures: TrackTextures;
  layerType: 0 | 1 | 2;
  mouseTarget: React.MutableRefObject<THREE.Vector2>;
  zOffset: number;
  playbackState?: any;
}

function FocusPlane({ textures, layerType, mouseTarget, zOffset, playbackState }: FocusPlaneProps) {
  const { width, height } = useThree((s) => s.viewport);
  const size = useThree((s) => s.size);
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const mouseLerped = useRef(new THREE.Vector2(0.5, 0.5));

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
      uBass:         { value: 0.0 }, // Placeholder
      uMid:          { value: 0.0 }, // Placeholder
      uHigh:         { value: 0.0 }, // Placeholder
    }),
    [layerType]
  );

  useFrame((state) => {
    if (!materialRef.current) return;
    const mat = materialRef.current;
    const mesh = meshRef.current;
    if (!mesh) return;

    mat.uniforms.uTime.value = state.clock.elapsedTime;
    mat.uniforms.uResolution.value.set(state.size.width, state.size.height);

    mat.uniforms.uTexture1.value     = textures.texture1Ref.current ?? fallbackTex;
    mat.uniforms.uTexture2.value     = textures.texture2Ref.current ?? fallbackTex;
    mat.uniforms.uHoverTexture.value = textures.hoverTextureRef.current ?? fallbackTex;
    mat.uniforms.uProgress.value     = textures.progress.value;
    mat.uniforms.uImageRes1.value.copy(textures.imageRes1);
    mat.uniforms.uImageRes2.value.copy(textures.imageRes2);
    mat.uniforms.uImageRes3.value.copy(textures.imageRes3);
    mat.uniforms.uHover.value        = textures.hoverAmount.value;

    mouseLerped.current.lerp(mouseTarget.current, 0.04);
    mat.uniforms.uMouse.value.copy(mouseLerped.current);

    const t = state.clock.elapsedTime;
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
    mesh.position.x += (mouseLerped.current.x - 0.5) * -parallaxStrength;
    mesh.position.y += (mouseLerped.current.y - 0.5) * -parallaxStrength;

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

export function FocusScene({ textures, mouseTarget, hoverActive, playbackState }: FocusSceneProps) {
  const { viewport } = useThree();
  const sparklesRef = useRef<THREE.Group>(null);
  
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

      <FocusPlane textures={textures} layerType={0} mouseTarget={mouseTarget} zOffset={0} playbackState={playbackState} />
      <FocusPlane textures={textures} layerType={1} mouseTarget={mouseTarget} zOffset={0.01} playbackState={playbackState} />
      <FocusPlane textures={textures} layerType={2} mouseTarget={mouseTarget} zOffset={0.02} playbackState={playbackState} />
    </>
  );
}
