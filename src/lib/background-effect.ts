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
  uniform float uProgress;       // 0 = show texture1, 1 = show texture2
  uniform float uTime;
  uniform vec2 uResolution;      // viewport size
  uniform vec2 uImageRes1;       // texture1 natural dimensions
  uniform vec2 uImageRes2;       // texture2 natural dimensions

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

    // ── Noise distortion ──
    float t = uTime * uNoiseSpeed;
    float n = snoise(vec3(uv * uNoiseScale, t));
    float n2 = snoise(vec3(uv * uNoiseScale * 0.5 + 100.0, t * 0.7));

    // Base distortion (continuous ambient wobble)
    vec2 distortion = vec2(
      n * uNoiseHeight * 0.012 * uDistortA,
      n2 * uNoiseHeight * 0.012 * uDistortB
    );

    vec2 uv1 = coverUv(uv + distortion, uImageRes1, uResolution);
    vec2 uv2 = coverUv(uv + distortion, uImageRes2, uResolution);

    vec4 tex1 = texture2D(uTexture1, uv1);
    vec4 tex2 = texture2D(uTexture2, uv2);

    // ── Gooey transition blend ──
    if (uProgress <= 0.0) {
      gl_FragColor = tex1;
    } else if (uProgress >= 1.0) {
      gl_FragColor = tex2;
    } else {
      // Noise-driven metaball mask
      float noiseVal = n * 0.5 + 0.5; // remap to 0..1
      float grow = uProgress * uGrowSize;

      // Soft threshold creates the blobby/organic edge
      float mask = smoothstep(
        uProgress - uMetaball * grow,
        uProgress + uMetaball * grow,
        noiseVal
      );

      // Edge discard for that punchy gooey look
      float edge = abs(noiseVal - uProgress);
      float alpha = smoothstep(0.0, uDiscard, edge + (1.0 - uProgress) * 0.5);

      vec4 mixed = mix(tex2, tex1, mask);
      gl_FragColor = vec4(mixed.rgb, mixed.a * max(alpha, 0.3));
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

  // The two texture slots for transitions
  private texture1: THREE.Texture | null = null;
  private texture2: THREE.Texture | null = null;
  private loader: THREE.TextureLoader;

  // Transition state
  private isTransitioning = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.clock = new THREE.Clock();
    this.loader = new THREE.TextureLoader();
    this.loader.setCrossOrigin("anonymous");

    // Renderer — fills the container
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.domElement.style.position = "absolute";
    this.renderer.domElement.style.top = "0";
    this.renderer.domElement.style.left = "0";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    container.appendChild(this.renderer.domElement);

    // Orthographic camera for full-screen quad
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Scene + full-screen plane
    this.scene = new THREE.Scene();

    const defaultTex = new THREE.Texture();

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTexture1: { value: defaultTex },
        uTexture2: { value: defaultTex },
        uProgress: { value: 0.0 },
        uTime: { value: 0.0 },
        uResolution: {
          value: new THREE.Vector2(container.clientWidth, container.clientHeight),
        },
        uImageRes1: { value: new THREE.Vector2(1, 1) },
        uImageRes2: { value: new THREE.Vector2(1, 1) },
        // Effect params — matched to original Shery config
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

    // Resize handler
    window.addEventListener("resize", this.onResize);

    // Start render loop
    this.animate();
  }

  // ── Public API ──

  /**
   * Load an image and display it immediately (no transition).
   */
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

  /**
   * Smoothly transition from the current image to a new one with the
   * gooey/liquid morph effect.
   */
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
            // Swap: texture2 becomes the new texture1
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

  /**
   * Clean up all WebGL resources.
   */
  dispose(): void {
    cancelAnimationFrame(this.animationId);
    window.removeEventListener("resize", this.onResize);

    this.texture1?.dispose();
    this.texture2?.dispose();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();

    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }

  // ── Internals ──

  private loadTexture(url: string): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (tex) => {
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.generateMipmaps = false;
          resolve(tex);
        },
        undefined,
        (err) => {
          console.error("[BackgroundEffect] Failed to load texture:", url, err);
          reject(err);
        }
      );
    });
  }

  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);
    this.material.uniforms.uTime.value = this.clock.getElapsedTime();
    this.renderer.render(this.scene, this.camera);
  };

  private onResize = (): void => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.material.uniforms.uResolution.value.set(w, h);
  };
}
