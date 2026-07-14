"use client";

import { useEffect, useState } from "react";

interface BrightnessResult {
  heroIsLight: boolean;
  navIsLight: boolean;
}

export function useImageBrightness(imageUrl: string | null) {
  const [brightness, setBrightness] = useState<BrightnessResult>({
    heroIsLight: false,
    navIsLight: false,
  });

  useEffect(() => {
    if (!imageUrl) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    
    img.onerror = () => {
      // CORS block or load failure. Fail silently.
    };
    
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;

        // Small resolution for extremely fast processing
        canvas.width = 64;
        canvas.height = 64;

        // Calculate object-fit: cover math
        const imgAspect = img.width / img.height;
        const screenAspect = window.innerWidth / window.innerHeight;
        
        let renderW, renderH, xStart, yStart;
        
        if (imgAspect < screenAspect) {
          // Image is taller than screen aspect ratio -> crop top/bottom
          renderW = canvas.width;
          renderH = img.height * (renderW / img.width);
          xStart = 0;
          yStart = (canvas.height - renderH) / 2;
        } else {
          // Image is wider than screen aspect ratio -> crop left/right
          renderH = canvas.height;
          renderW = img.width * (renderH / img.height);
          xStart = (canvas.width - renderW) / 2;
          yStart = 0;
        }

        // Draw the image onto the canvas simulating how it appears on screen
        ctx.drawImage(img, xStart, yStart, renderW, renderH);

        // Helper function to calculate average luminance of a specific region
        const getRegionLuminance = (startX: number, startY: number, width: number, height: number) => {
          const imageData = ctx.getImageData(startX, startY, width, height);
          const data = imageData.data;
          let rSum = 0, gSum = 0, bSum = 0;
          const pixelCount = width * height;

          for (let i = 0; i < data.length; i += 4) {
            rSum += data[i];
            gSum += data[i + 1];
            bSum += data[i + 2];
          }

          const rAvg = rSum / pixelCount;
          const gAvg = gSum / pixelCount;
          const bAvg = bSum / pixelCount;

          // Perceived luminance formula
          return 0.299 * rAvg + 0.587 * gAvg + 0.114 * bAvg;
        };

        // Region 1: Hero text (approx left half, middle section)
        const heroLuminance = getRegionLuminance(0, Math.floor(canvas.height * 0.3), Math.floor(canvas.width * 0.5), Math.floor(canvas.height * 0.5));
        
        // Region 2: Nav bar (top strip)
        const navLuminance = getRegionLuminance(0, 0, canvas.width, Math.floor(canvas.height * 0.15));

        // Threshold: 128 (midpoint of 0-255)
        setBrightness({
          heroIsLight: heroLuminance > 128,
          navIsLight: navLuminance > 128,
        });
      } catch (err) {
        // CORS blocked getImageData. Fail silently.
      }
    };

    img.src = imageUrl;
  }, [imageUrl]);

  return brightness;
}
