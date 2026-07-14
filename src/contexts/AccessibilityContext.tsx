"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

// ──────────────────────────────────────────
//  Accessibility Settings Type
// ──────────────────────────────────────────

export interface AccessibilitySettings {
  colorSeparation: boolean;  // Energy: RGB layer color cycling via hiHatCountRef
  layerMovement: boolean;    // Energy: orbital float movement of RGB layers
  imageBreathing: boolean;   // Chill: bass-reactive UV breathing in shader via uBass
  sparkleEffects: boolean;   // Chill: <Sparkles> and <Float> components
  frameBreathing: boolean;   // Focus: bass-reactive geometric frame scaling
}

export const defaultAccessibilitySettings: AccessibilitySettings = {
  colorSeparation: true,
  layerMovement: true,
  imageBreathing: true,
  sparkleEffects: true,
  frameBreathing: true,
};

