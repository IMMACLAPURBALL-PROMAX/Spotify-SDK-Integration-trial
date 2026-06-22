/**
 * Custom Three.js background effect that replaces Shery.js.
 *
 * Creates a full-screen WebGL plane with a noise-based liquid/gooey
 * distortion shader. Supports instant texture hot-swapping and smooth
 * animated transitions between images.
 *
 * Usage:
 *   const fx = new BackgroundEffect(containerElement);
 *   await fx.setImage("/images/cover1.jpg");        // initial image
 *   await fx.transitionTo("/images/cover2.jpg", 1.5); // gooey morph
 *   fx.dispose();                                    // cleanup
 */

import * as THREE from "three";
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

  // Effect tuning uniforms (mapped from original Shery config)
  uniform float uNoiseSpeed;     // noise_speed
  uniform float uNoiseScale;     // noise_scale
  uniform float uNoiseHeight;    // noise_height
  uniform float uMetaball;       // metaball
  uniform float uDiscard;        // discard_threshold
  uniform float uGrowSize;       // growSize
  uniform float uDistortA;       // "a" parameter
  uniform float uDistortB;       // "b" parameter

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

  // ── Cover-fit UV calculation (like CSS object-fit: cover) ──
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

    // Noise value remapped to 0..1 (for gooey alpha mask)
    float noise = (snoise(vec3(pos * uNoiseScale, uTime * uNoiseSpeed)) + 1.0) / 2.0;

    // Ambient liquid wobble on UVs (always active, gives the background life)
    float wN1 = snoise(vec3(uv * uNoiseScale * 0.8, uTime * uNoiseSpeed * 0.6));
    float wN2 = snoise(vec3(uv * uNoiseScale * 0.5 + 50.0, uTime * uNoiseSpeed * 0.4));
    vec2 wobble = vec2(
      wN1 * 0.02 * uDistortA,
      wN2 * 0.02 * uDistortB
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
      // Shery.js: return vec4(mix(texture2D(uTexture[0], uv), texture2D(uTexture[1], uv2), alpha));
      baseColor = mix(tex1, tex2, alpha);
    }

    // ── Hover Lens (queue preview) ──
    // Organic, spinning, shape-shifting liquid blob driven by fBm noise
    if (uHover > 0.0) {
      vec2 mouseDir = pos - mouse;
      float dist = length(mouseDir);
      float angle = atan(mouseDir.y, mouseDir.x);
      
      // Time-based rotation for the amoeba blob (slowed down from 0.4 to 0.1)
      float spinAngle = angle + uTime * 0.1;
      
      // Noise displacement to create continuous organic morphing (slowed down from 0.25 to 0.08)
      float blobNoise = snoise(vec3(cos(spinAngle)*1.5, sin(spinAngle)*1.5, uTime * 0.08));
      
      // Dynamic radius based on hover state and noise (reduced size from 0.18+0.07 to 0.12+0.03)
      float dynamicRadius = (0.12 + blobNoise * 0.03) * uHover;
      
      // Smooth liquid edge
      float lensEdge = smoothstep(dynamicRadius, dynamicRadius + 0.03, dist);

      // Liquid Refraction: distort the UVs for a magnifying glass effect
      vec2 refractUv = uv + mouseDir * (1.0 - lensEdge) * 0.12 * uHover;
      
      vec2 uv3 = coverUv(refractUv, uImageRes3, uResolution);
      vec4 tex3 = texture2D(uTexture3, uv3);

      gl_FragColor = mix(tex3, baseColor, lensEdge);
    } else {
      gl_FragColor = baseColor;
    }
  }
`;

// ──────────────────────────────────────────
//  BackgroundEffect class
// ──────────────────────────────────────────

export class BackgroundEffect {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private clock: THREE.Clock;
  private animationId: number = 0;
  private container: HTMLElement;

  // The texture slots
  private texture1: THREE.Texture | null = null;
  private texture2: THREE.Texture | null = null;
  private texture3: THREE.Texture | null = null;

  private loader: THREE.TextureLoader;
  private isTransitioning = false;

  // Mouse position lerping for smooth cursor tracking
  private mouseTarget = new THREE.Vector2(0.5, 0.5);
  private mouseLerped = new THREE.Vector2(0.5, 0.5);

  constructor(container: HTMLElement) {
    this.container = container;
    this.clock = new THREE.Clock();
    this.loader = new THREE.TextureLoader();
    this.loader.setCrossOrigin("anonymous");

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.domElement.style.position = "absolute";
    this.renderer.domElement.style.top = "0";
    this.renderer.domElement.style.left = "0";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTexture1: { value: null },
        uTexture2: { value: null },
        uTexture3: { value: null },
        uProgress: { value: 0.0 },
        uHover: { value: 0.0 },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uTime: { value: 0.0 },
        uResolution: {
          value: new THREE.Vector2(container.clientWidth, container.clientHeight),
        },
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
      },
      transparent: true,
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.mesh);

    window.addEventListener("resize", this.onResize);
    this.container.addEventListener("mousemove", this.onMouseMove);
    this.container.addEventListener("mouseenter", this.onMouseEnter);
    this.container.addEventListener("mouseleave", this.onMouseLeave);

    this.animate();
  }

  async setImage(url: string): Promise<void> {
    const tex = await this.loadTexture(url);
    if (this.texture1) this.texture1.dispose();
    this.texture1 = tex;
    this.material.uniforms.uTexture1.value = tex;
    this.material.uniforms.uImageRes1.value.set(
      (tex.image as any)?.width || 1,
      (tex.image as any)?.height || 1
    );
    this.material.uniforms.uProgress.value = 0.0;
  }

  async transitionTo(url: string, duration = 1.5): Promise<void> {
    if (this.isTransitioning) return;

    const tex = await this.loadTexture(url);
    this.texture2 = tex;
    this.material.uniforms.uTexture2.value = tex;
    this.material.uniforms.uImageRes2.value.set(
      (tex.image as any)?.width || 1,
      (tex.image as any)?.height || 1
    );

    this.isTransitioning = true;

    return new Promise((resolve) => {
      gsap.fromTo(
        this.material.uniforms.uProgress,
        { value: 0.0 },
        {
          value: 1.0,
          duration,
          ease: "power2.inOut",
          onComplete: () => {
            if (this.texture1) this.texture1.dispose();
            this.texture1 = this.texture2;
            this.texture2 = null;

            this.material.uniforms.uTexture1.value = this.texture1;
            this.material.uniforms.uImageRes1.value.set(
              (this.texture1!.image as any)?.width || 1,
              (this.texture1!.image as any)?.height || 1
            );
            this.material.uniforms.uProgress.value = 0.0;

            this.isTransitioning = false;
            resolve();
          },
        }
      );
    });
  }

  public async setHoverTexture(url: string | null): Promise<void> {
    if (!url) {
      this.texture3 = null;
      this.material.uniforms.uTexture3.value = null;
      return;
    }
    const tex = await this.loadTexture(url);
    if (this.texture3) this.texture3.dispose();
    this.texture3 = tex;
    this.material.uniforms.uTexture3.value = tex;
    this.material.uniforms.uImageRes3.value.set((tex.image as any)?.width || 1024, (tex.image as any)?.height || 1024);
  }

  dispose(): void {
    cancelAnimationFrame(this.animationId);
    window.removeEventListener("resize", this.onResize);
    this.container.removeEventListener("mousemove", this.onMouseMove);
    this.container.removeEventListener("mouseenter", this.onMouseEnter);
    this.container.removeEventListener("mouseleave", this.onMouseLeave);

    this.texture1?.dispose();
    this.texture2?.dispose();
    this.texture3?.dispose();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();

    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }

  private loadTexture(url: string): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      this.loader.load(url, (tex) => {
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        resolve(tex);
      }, undefined, reject);
    });
  }

  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);
    this.material.uniforms.uTime.value = this.clock.getElapsedTime();

    // Lerp the mouse position for smooth, elegant liquid cursor tracking
    this.mouseLerped.lerp(this.mouseTarget, 0.04);
    this.material.uniforms.uMouse.value.copy(this.mouseLerped);

    this.renderer.render(this.scene, this.camera);
  };

  private onMouseMove = (e: MouseEvent) => {
    const rect = this.container.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = 1.0 - ((e.clientY - rect.top) / rect.height);
    this.mouseTarget.set(x, y);
  };

  private onMouseEnter = () => {
    if (this.texture3) {
      gsap.to(this.material.uniforms.uHover, { value: 1, duration: 0.8, ease: "power2.out" });
    }
  };

  private onMouseLeave = () => {
    gsap.to(this.material.uniforms.uHover, { value: 0, duration: 0.6, ease: "power2.in" });
  };

  private onResize = (): void => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.material.uniforms.uResolution.value.set(w, h);
  };
}
