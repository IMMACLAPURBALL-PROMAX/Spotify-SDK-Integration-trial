# Student Questions & Review Topics

This file stores questions that arise during development. We will review these in-depth during the final 3-day project quiz and architecture walkthrough.

---

### Question 1: GSAP vs. The Virtual DOM
**Date:** July 4, 2026

**Question:** 
*I read all about DOM the other day, also how react has its own virtual DOM, where it renders everything faster and with new data provided to it, and then compares this to actual DOM, and only makes changes to wherever necessary, cuz DOM is kinda old and takes a lot of time, re-rendering everything. why don't we let gsap just update that virtual DOM instead of actual DOM?*

**Short Answer:**
GSAP is framework-agnostic (it doesn't know what React is). Furthermore, if GSAP updated the Virtual DOM 60 times a second for every pixel of movement, React's "diffing" algorithm would crash the browser. By bypassing the Virtual DOM and talking directly to the Real DOM's GPU layers, GSAP achieves 60fps.

*(To be expanded upon during the final review!)*

---

### Question 2: The Architecture of DOM vs. WebGL / GLSL vs. React
**Date:** July 4, 2026

**Topic Breakdown:**
*How do the DOM, WebGL, GLSL, and React work together without the browser crashing?*

**Technical Summary:**
1. **The DOM** is an HTML tree living in CPU memory (RAM). It manages UI layout, text, and CSS styling. It is very fast at text layout but terrible at heavy math.
2. **The `<canvas>`** is an HTML element in the DOM, but it acts only as a rendering target window. The DOM itself is entirely blind to the 3D content drawn inside the canvas.
3. **WebGL/GLSL (Graphics)** bypasses the DOM entirely. It compiles the shader code (GLSL), sends the vertex and pixel data straight to the GPU's dedicated VRAM, and the GPU executes the rendering loop independently. The GPU then outputs the final image buffer directly onto the canvas target.
4. **React (with React Three Fiber)** bridges the two. It manages state in the Virtual DOM (CPU). When state changes, it reconciles the DOM tree (updating HTML UI) and simultaneously updates the Three.js scene graph. It passes the new variables directly to the GPU's shader uniforms without causing the CPU to manually recalculate any graphics.

This architecture splits the load perfectly: The CPU handles the UI and State, while the GPU handles the heavy pixel math.
