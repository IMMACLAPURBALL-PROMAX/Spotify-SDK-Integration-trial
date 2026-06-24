"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import gsap from "gsap";

// ──────────────────────────────────────────
//  GLSL Shaders
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
  uniform sampler2D uTexture3;   // Hover preview texture
  uniform float uProgress;       // 0 = show texture1, 1 = show texture2
  uniform float uHover;          // 0 = no hover, 1 = show hover lens
  uniform vec2 uMouse;           // Normalized mouse position
  uniform float uTime;
  uniform vec2 uResolution;      // viewport size
  uniform vec2 uImageRes1;       // texture1 natural dimensions
  uniform vec2 uImageRes2;       // texture2 natural dimensions
  uniform vec2 uImageRes3;       // texture3 natural dimensions

  // Effect tuning uniforms
  uniform float uNoiseSpeed;
  uniform float uNoiseScale;
  uniform float uNoiseHeight;
  uniform float uMetaball;
  uniform float uDiscard;
  uniform float uGrowSize;
  uniform float uDistortA;
  uniform float uDistortB;

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

  void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / uResolution.y;

    // Position in aspect-corrected space
    vec2 pos = vec2(uv.x, uv.y / aspect);

    // Noise value remapped to 0..1
    float noise = (snoise(vec3(pos * uNoiseScale, uTime * uNoiseSpeed)) + 1.0) / 2.0;

    // Ambient liquid wobble on UVs
    float wN1 = snoise(vec3(uv * uNoiseScale, uTime * uNoiseSpeed));
    float wN2 = snoise(vec3(uv * uNoiseScale + 50.0, uTime * uNoiseSpeed));
    vec2 wobble = vec2(
      wN1 * 0.01 * uDistortA,
      wN2 * 0.01 * uDistortB
    );

    // Gooey transition alpha mask
    float interpMetaball = uMetaball * uProgress;
    float interpNoiseHeight = uNoiseHeight * uProgress;
    float val = noise * interpNoiseHeight;

    // Mouse metaball
    vec2 mouse = vec2(uMouse.x, uMouse.y / aspect);
    float u = 1.0 - smoothstep(interpMetaball, 0.0, distance(mouse, pos));
    float mouseMetaball = clamp(1.0 - u, 0.0, 1.0);
    val += mouseMetaball;

    // Alpha threshold (gooey edge)
    float alpha = smoothstep(uDiscard - 0.002, uDiscard, val);

    // Cover-fit UVs with ambient wobble applied
    vec2 uv1 = coverUv(uv + wobble, uImageRes1, uResolution);
    vec2 uv2 = coverUv(uv + wobble, uImageRes2, uResolution);

    vec4 tex1 = texture2D(uTexture1, uv1);
    vec4 tex2 = texture2D(uTexture2, uv2);

    // Gooey blend: alpha controls how much of texture2 shows through
    vec4 baseColor;
    if (uProgress <= 0.0) {
      baseColor = tex1;
    } else if (uProgress >= 1.0) {
      baseColor = tex2;
    } else {
      baseColor = mix(tex1, tex2, alpha);
    }

    // ── Hover Lens (queue preview) ──
    if (uHover > 0.0) {
      vec2 mouseDir = pos - mouse;
      float dist = length(mouseDir);
      float angle = atan(mouseDir.y, mouseDir.x);
      
      float spinAngle = angle + uTime * (uNoiseSpeed * 0.5);
      float blobNoise = snoise(vec3(cos(spinAngle) * (uNoiseScale * 0.14), sin(spinAngle) * (uNoiseScale * 0.14), uTime * (uNoiseSpeed * 0.4)));
      
      float dynamicRadius = (0.12 + blobNoise * 0.02 * uDistortA) * uHover;
      float lensEdge = smoothstep(dynamicRadius, dynamicRadius + 0.03, dist);

      // Liquid Refraction magnifying glass effect
      vec2 refractUv = uv + mouseDir * (1.0 - lensEdge) * (0.13 * abs(uDistortB)) * uHover;
      
      vec2 uv3 = coverUv(refractUv, uImageRes3, uResolution);
      vec4 tex3 = texture2D(uTexture3, uv3);

      gl_FragColor = mix(tex3, baseColor, lensEdge);
    } else {
      gl_FragColor = baseColor;
    }
  }
`;

// ──────────────────────────────────────────
//  R3F Scene Component
// ──────────────────────────────────────────

interface LiquidBackgroundSceneProps {
  currentTrackUrl: string;
  hoverTrackUrl: string | null;
  mood: "chill" | "energy" | "focus";
  mouseTarget: React.MutableRefObject<THREE.Vector2>;
  hoverActive: boolean;
}

function LiquidBackgroundScene({
  currentTrackUrl,
  hoverTrackUrl,
  mood,
  mouseTarget,
  hoverActive,
}: LiquidBackgroundSceneProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const mouseLerped = useRef(new THREE.Vector2(0.5, 0.5));
  const lastTrackUrlRef = useRef<string | null>(null);
  const isTransitioningRef = useRef(false);

  const uniformsRef = useRef({
    uTexture1: { value: null as THREE.Texture | null },
    uTexture2: { value: null as THREE.Texture | null },
    uTexture3: { value: null as THREE.Texture | null },
    uProgress: { value: 0.0 },
    uHover: { value: 0.0 },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    uTime: { value: 0.0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uImageRes1: { value: new THREE.Vector2(1, 1) },
    uImageRes2: { value: new THREE.Vector2(1, 1) },
    uImageRes3: { value: new THREE.Vector2(1, 1) },
    uNoiseSpeed: { value: 0.2 },
    uNoiseScale: { value: 10.69 },
    uNoiseHeight: { value: 0.44 },
    uMetaball: { value: 0.14 },
    uDiscard: { value: 0.46 },
    uGrowSize: { value: 3.99 },
    uDistortA: { value: 2.0 },
    uDistortB: { value: -0.91 },
  });

  // Handle dynamic textures for track transitions
  useEffect(() => {
    if (!currentTrackUrl || !materialRef.current) return;
    const material = materialRef.current;
    if (currentTrackUrl === lastTrackUrlRef.current) return;

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");

    const loadTexture = async () => {
      try {
        const tex = await new Promise<THREE.Texture>((resolve, reject) => {
          loader.load(currentTrackUrl, resolve, undefined, reject);
        });
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;

        const w = (tex.image as any)?.width || 1024;
        const h = (tex.image as any)?.height || 1024;

        if (!material.uniforms.uTexture1.value) {
          material.uniforms.uTexture1.value = tex;
          material.uniforms.uImageRes1.value.set(w, h);
          material.uniforms.uProgress.value = 0.0;
          lastTrackUrlRef.current = currentTrackUrl;
        } else {
          if (isTransitioningRef.current) {
            gsap.killTweensOf(material.uniforms.uProgress);
          }
          isTransitioningRef.current = true;

          const oldTex = material.uniforms.uTexture1.value;
          material.uniforms.uTexture2.value = tex;
          material.uniforms.uImageRes2.value.set(w, h);

          gsap.fromTo(
            material.uniforms.uProgress,
            { value: 0.0 },
            {
              value: 1.0,
              duration: 1.5,
              ease: "power2.inOut",
              onComplete: () => {
                if (oldTex) oldTex.dispose();
                material.uniforms.uTexture1.value = tex;
                material.uniforms.uImageRes1.value.set(w, h);
                material.uniforms.uTexture2.value = null;
                material.uniforms.uProgress.value = 0.0;
                isTransitioningRef.current = false;
                lastTrackUrlRef.current = currentTrackUrl;
              },
            }
          );
        }
      } catch (err) {
        console.error("LiquidBackground: Error loading track artwork texture:", err);
      }
    };

    loadTexture();
  }, [currentTrackUrl]);

  // Handle hover preview texture
  useEffect(() => {
    if (!materialRef.current) return;
    const material = materialRef.current;

    if (!hoverTrackUrl) {
      const oldTex = material.uniforms.uTexture3.value;
      if (oldTex) oldTex.dispose();
      material.uniforms.uTexture3.value = null;
      return;
    }

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");

    loader.load(
      hoverTrackUrl,
      (tex) => {
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;

        const oldTex = material.uniforms.uTexture3.value;
        if (oldTex) oldTex.dispose();

        material.uniforms.uTexture3.value = tex;
        material.uniforms.uImageRes3.value.set(
          (tex.image as any)?.width || 1024,
          (tex.image as any)?.height || 1024
        );
      },
      undefined,
      (err) => console.error("LiquidBackground: Error loading queue hover texture:", err)
    );
  }, [hoverTrackUrl]);

  // Handle uHover lens visual zoom morphing
  useEffect(() => {
    if (!materialRef.current) return;
    const material = materialRef.current;
    
    if (hoverActive && hoverTrackUrl) {
      gsap.to(material.uniforms.uHover, { value: 1.0, duration: 0.8, ease: "power2.out" });
    } else {
      gsap.to(material.uniforms.uHover, { value: 0.0, duration: 0.6, ease: "power2.in" });
    }
  }, [hoverActive, hoverTrackUrl]);

  // Handle Mood uniform animations
  useEffect(() => {
    if (!materialRef.current) return;
    const uniforms = materialRef.current.uniforms;

    let targets = {
      noiseSpeed: 0.2,
      noiseScale: 10.69,
      distortA: 2.0,
      distortB: -0.91,
    };

    if (mood === "chill") {
      targets = { noiseSpeed: 0.12, noiseScale: 8.5, distortA: 1.1, distortB: -0.5 };
    } else if (mood === "energy") {
      targets = { noiseSpeed: 0.55, noiseScale: 16.0, distortA: 4.8, distortB: -2.3 };
    } else if (mood === "focus") {
      targets = { noiseSpeed: 0.04, noiseScale: 4.0, distortA: 0.4, distortB: -0.15 };
    }

    gsap.to(uniforms.uNoiseSpeed, { value: targets.noiseSpeed, duration: 1.5, ease: "power2.out" });
    gsap.to(uniforms.uNoiseScale, { value: targets.noiseScale, duration: 1.5, ease: "power2.out" });
    gsap.to(uniforms.uDistortA, { value: targets.distortA, duration: 1.5, ease: "power2.out" });
    gsap.to(uniforms.uDistortB, { value: targets.distortB, duration: 1.5, ease: "power2.out" });
  }, [mood]);

  useFrame((state) => {
    if (!materialRef.current) return;
    const material = materialRef.current;

    material.uniforms.uTime.value = state.clock.getElapsedTime();

    const { width, height } = state.size;
    material.uniforms.uResolution.value.set(width, height);

    mouseLerped.current.lerp(mouseTarget.current, 0.04);
    material.uniforms.uMouse.value.copy(mouseLerped.current);
  });

  return (
    <>
      <mesh>
        <planeGeometry args={[2, 2]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniformsRef.current}
          transparent
        />
      </mesh>

      {mood === "chill" && (
        <Sparkles
          count={65}
          scale={[2, 2, 0]}
          size={1.6}
          speed={0.4}
          color="#ffffff"
          opacity={0.45}
        />
      )}
    </>
  );
}

// ──────────────────────────────────────────
//  Main Exported Component
// ──────────────────────────────────────────

interface LiquidBackgroundProps {
  currentTrackUrl: string;
  hoverTrackUrl: string | null;
  mood: "chill" | "energy" | "focus";
}

export function LiquidBackground({
  currentTrackUrl,
  hoverTrackUrl,
  mood,
}: LiquidBackgroundProps) {
  const mouseTarget = useRef(new THREE.Vector2(0.5, 0.5));
  const [hoverActive, setHoverActive] = React.useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = 1.0 - (e.clientY - rect.top) / rect.height;
    mouseTarget.current.set(x, y);
  };

  const onMouseEnter = () => {
    if (hoverTrackUrl) setHoverActive(true);
  };

  const onMouseLeave = () => {
    setHoverActive(false);
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        zIndex: 0,
        pointerEvents: "auto",
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <Canvas
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        dpr={[1, 2]}
        camera={{ position: [0, 0, 1] }}
        style={{ width: "100%", height: "100%", position: "absolute" }}
      >
        <LiquidBackgroundScene
          currentTrackUrl={currentTrackUrl}
          hoverTrackUrl={hoverTrackUrl}
          mood={mood}
          mouseTarget={mouseTarget}
          hoverActive={hoverActive}
        />
      </Canvas>
    </div>
  );
}

export default LiquidBackground;
