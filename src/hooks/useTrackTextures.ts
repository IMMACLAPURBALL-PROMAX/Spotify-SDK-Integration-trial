"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import gsap from "gsap";

// ──────────────────────────────────────────
//  Shared texture state for all mood scenes
// ──────────────────────────────────────────

export interface TrackTextures {
  /** The currently displayed track texture (or the "from" texture during transition). */
  texture1: THREE.Texture | null;
  /** The incoming track texture (the "to" texture during transition). */
  texture2: THREE.Texture | null;
  /** The hover preview texture (next track in queue). */
  hoverTexture: THREE.Texture | null;
  /** GSAP-animated 0→1 transition progress. */
  progress: { value: number };
  /** GSAP-animated 0→1 hover lens intensity. */
  hoverAmount: { value: number };
  /** Resolution of texture1 for cover-fit UV math. */
  imageRes1: THREE.Vector2;
  /** Resolution of texture2 for cover-fit UV math. */
  imageRes2: THREE.Vector2;
  /** Resolution of hover texture for cover-fit UV math. */
  imageRes3: THREE.Vector2;
}

/**
 * Hook that manages loading, caching, and GSAP crossfade transitions
 * for track artwork textures. All three mood scenes consume this hook
 * so texture logic is never duplicated.
 */
export function useTrackTextures(
  currentTrackUrl: string,
  hoverTrackUrl: string | null,
  hoverActive: boolean
): TrackTextures {
  const lastTrackUrlRef = useRef<string | null>(null);
  const isTransitioningRef = useRef(false);

  // Stable refs that persist across renders
  const tex1Ref = useRef<THREE.Texture | null>(null);
  const tex2Ref = useRef<THREE.Texture | null>(null);
  const tex3Ref = useRef<THREE.Texture | null>(null);

  const progressRef = useRef({ value: 0.0 });
  const hoverAmountRef = useRef({ value: 0.0 });

  const imgRes1Ref = useRef(new THREE.Vector2(1, 1));
  const imgRes2Ref = useRef(new THREE.Vector2(1, 1));
  const imgRes3Ref = useRef(new THREE.Vector2(1, 1));

  // ── Load / transition the main track texture ──
  useEffect(() => {
    if (!currentTrackUrl) return;
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

        const w = (tex.image as HTMLImageElement)?.width || 1024;
        const h = (tex.image as HTMLImageElement)?.height || 1024;

        if (!tex1Ref.current) {
          // First texture ever loaded — set directly, no transition
          tex1Ref.current = tex;
          imgRes1Ref.current.set(w, h);
          progressRef.current.value = 0.0;
          lastTrackUrlRef.current = currentTrackUrl;
        } else {
          // Subsequent texture — run GSAP crossfade
          if (isTransitioningRef.current) {
            gsap.killTweensOf(progressRef.current);
          }
          isTransitioningRef.current = true;

          const oldTex = tex1Ref.current;
          tex2Ref.current = tex;
          imgRes2Ref.current.set(w, h);

          gsap.fromTo(
            progressRef.current,
            { value: 0.0 },
            {
              value: 1.0,
              duration: 1.5,
              ease: "power2.inOut",
              onComplete: () => {
                if (oldTex) oldTex.dispose();
                tex1Ref.current = tex;
                imgRes1Ref.current.set(w, h);
                tex2Ref.current = null;
                progressRef.current.value = 0.0;
                isTransitioningRef.current = false;
                lastTrackUrlRef.current = currentTrackUrl;
              },
            }
          );
        }
      } catch (err) {
        console.error("useTrackTextures: Error loading track artwork:", err);
      }
    };

    loadTexture();
  }, [currentTrackUrl]);

  // ── Load the hover preview texture ──
  useEffect(() => {
    if (!hoverTrackUrl) {
      const old = tex3Ref.current;
      if (old) old.dispose();
      tex3Ref.current = null;
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

        const old = tex3Ref.current;
        if (old) old.dispose();
        tex3Ref.current = tex;
        imgRes3Ref.current.set(
          (tex.image as HTMLImageElement)?.width || 1024,
          (tex.image as HTMLImageElement)?.height || 1024
        );
      },
      undefined,
      (err) => console.error("useTrackTextures: Error loading hover texture:", err)
    );
  }, [hoverTrackUrl]);

  // ── Animate hover amount ──
  useEffect(() => {
    if (hoverActive && hoverTrackUrl) {
      gsap.to(hoverAmountRef.current, { value: 1.0, duration: 0.8, ease: "power2.out" });
    } else {
      gsap.to(hoverAmountRef.current, { value: 0.0, duration: 0.6, ease: "power2.in" });
    }
  }, [hoverActive, hoverTrackUrl]);

  return {
    texture1: tex1Ref.current,
    texture2: tex2Ref.current,
    hoverTexture: tex3Ref.current,
    progress: progressRef.current,
    hoverAmount: hoverAmountRef.current,
    imageRes1: imgRes1Ref.current,
    imageRes2: imgRes2Ref.current,
    imageRes3: imgRes3Ref.current,
  };
}
