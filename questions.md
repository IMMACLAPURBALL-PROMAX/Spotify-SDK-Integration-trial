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

---

### Question 3: FFT (Fast Fourier Transform) & The Web Audio API
**Date:** July 12, 2026

**Question:**
*What is FFT (Fast Fourier Transform) in simple words, and does the browser natively understand sound waves and calculate this in real-time, or do we have to do it ourselves?*

**Short Answer:**
1. **What is FFT in simple words?**
   Imagine baking a cake. If you eat a slice, you just taste "cake" (this is the raw sound wave changing over time). An FFT is like a machine that takes that slice of cake and separates it back into individual piles of flour, sugar, butter, and eggs, telling you exactly how much of each ingredient was used. In audio, it breaks a complex sound wave down into its individual **frequency components** (bass, mids, treble).
2. **Browser Native Support:**
   Yes, the browser natively handles this in highly optimized C++ code! Every modern browser has the **Web Audio API** compiled directly into its engine.
3. **How We Use It:**
   We route our audio through an **`AnalyserNode`** and configure the resolution using `fftSize = 4096`. This instructs the browser to compute the FFT and divide the sound into **2048 individual frequency "bins"** (each representing a tiny slice of about 10.7Hz). 
   Every frame, we simply query the browser's native array and inspect specific index ranges:
   - **Sub-Bass/Bass:** Bins `2` to `24` (~20Hz to 250Hz)
   - **Mids (vocals/synths):** Bins `24` to `186` (~250Hz to 2000Hz)
   - **Highs (hi-hats/clicks):** Bins `186` to `930` (~2000Hz to 10000Hz)

This allows us to drive specific visual animations (like breathing geometry or high-frequency grain glitches) independently without writing complex math or loading external libraries.

---

### Question 4: Additive Blending & RGB Layer Separation in 3D
**Date:** July 12, 2026

**Question:**
*Are the RGB layers (in Energy mood) actually stacked on top of each other, or do they lie on the exact same plane? If they revolve individually, how does the final album cover image form, and what role does additive blending play?*

**Short Answer:**
1. **Physical Stacking in 3D Space:**
   Technically, the layers are stacked slightly on top of each other in the 3D engine. There is a microscopic Z-axis gap (0.01 units) between each layer. This is necessary because if they occupied the exact same physical coordinates, the GPU would get confused about which pixel to draw first, causing ugly flickering (Z-fighting).
2. **Visual Perception (The Glass Pane Analogy):**
   Visually, they act as a single, cohesive set piece. Imagine three perfectly transparent panes of glass stacked together:
   - The back pane has only the **Red** light data painted on it.
   - The middle pane has only the **Green** light data.
   - The front pane has only the **Blue** light data.
3. **Additive Blending:**
   Additive Blending is a mathematical mode applied to the GPU shader. It tells the graphics card to add the light values of overlapping pixels together (e.g., Red + Green = Yellow). Because light is being mathematically added, **Z-order does not matter visually**. Shining a red flashlight over a green one yields the same color as shining green over red.
   When all three planes align perfectly in the center, their colors add up to recreate the exact, original, full-color album cover. When the audio triggers them to individually rotate, scale, or punch outward, the misalignment causes the raw red, green, and blue edges (or cyan, magenta, and yellow overlaps) to become visible, creating authentic chromatic aberration!

---

### Question 5: Music Copyright, Fair Use & Platform Licensing
**Date:** July 13, 2026

**Question:**
*Is downloading MP3s for personal use legal? Is using copyrighted music on Instagram considered "fair use"? What are the rules for music in web projects?*

**Short Answer:**
1. **Fair Use is NOT a blanket excuse.**
   Fair use is a narrow legal doctrine that covers commentary, criticism, parody, and education. Downloading a song to listen to it (even privately) does not qualify as fair use. It is copyright infringement regardless of whether you share it or not.

2. **Instagram is NOT fair use either.**
   When you use a song on Instagram Reels or TikTok, it is not you exercising fair use — it is Meta/TikTok who have signed **multi-million dollar licensing deals** with major record labels (Universal, Sony, Warner). They pay so their users can use music legally on their platforms. The legality is their business deal, not yours.

3. **Your app (SpotifyxStudio) is clean.**
   Using the Spotify Web API to control playback is 100% above board. Spotify handles all the music licensing. You are not downloading or redistributing anything — you are building a controller on top of a licensed player, which is explicitly allowed by Spotify's Developer Terms.

4. **Local MP3 uploads — where the line is.**
   Your app accepting a local MP3 file and playing it is no different from VLC Media Player — the app itself is legal. The question of whether the MP3 was legally obtained falls on whoever downloaded it, not on your player code. For personal dev use, nobody is coming after you. However, if you ever ship this as a public commercial product, you would need to either:
   - Remove local file support entirely, or
   - Implement a licensing agreement (which is not feasible for an indie project).

**Rule of thumb going forward:**
> For personal projects and development testing → fine in practice.
> For any public-facing or commercial product → lean fully into the Spotify API and drop pirated local files.

---

### Question 6: What exactly are "Hooks" in React?
**Date:** July 14, 2026

**Question:**
*What are hooks exactly? As per my understanding, it's basic React syntax that enables React to make static code into dynamic elements?*

**Short Answer:**
Yes, your understanding is spot-on! 

In older versions of React, you had to write complex "Class" components to make things dynamic. Simple functions were "stateless" (static)—they couldn't remember anything or trigger updates. 

**Hooks** were introduced to let you write simple, clean functions while "hooking into" React's powerful internal engine whenever you need dynamic superpowers.

Here are the three fundamental hooks and their basic syntax:

1. **`useState` (The Memory Hook)**
   Allows your static function to "remember" variables. When the variable changes, React automatically redraws the screen to show the new data.
   ```tsx
   // Syntax: const [currentValue, updateFunction] = useState(initialValue);
   const [mood, setMood] = useState("chill");
   ```

2. **`useEffect` (The Action/Side-Effect Hook)**
   Tells React to run a specific piece of code *after* the screen has been drawn, or when certain variables change. We use this for setting up 3D scenes, fetching data, or starting GSAP animations.
   ```tsx
   // Syntax: useEffect(() => { /* do something */ }, [dependencies]);
   useEffect(() => {
     console.log("The mood just changed to:", mood);
   }, [mood]); // Only runs when 'mood' changes
   ```

3. **`useRef` (The Sticky Note Hook)**
   Gives you a place to store a value (or hold onto a direct reference to an HTML/Canvas element) that persists across redraws, **without** causing the screen to redraw when you update it. This is critical for 60fps animations where redrawing the entire React UI would be too slow.
   ```tsx
   // Syntax: const myRef = useRef(initialValue);
   const audioLevelRef = useRef(0);
   const meshRef = useRef<THREE.Mesh>(null);
   ```

So whenever you see `useSomething()`, you know that function is borrowing a dynamic feature from React's core engine!

---

### Question 7: What is CORS?
**Date:** July 15, 2026

**Question:**
*What is CORS and why does it sometimes block things like album art brightness detection?*

**Short Answer:**
**CORS** stands for **Cross-Origin Resource Sharing**. It is a strict security feature built into every web browser to protect users from malicious websites.

Imagine you are logged into your bank (Bank.com). If you visit a malicious website (Evil.com), what stops Evil.com's JavaScript from secretly downloading your bank statement data behind the scenes? **CORS does.** 

The browser's rule is simple: **A webpage can only read data (like text or pixels) from its own domain (its "origin").** If the webpage tries to read data from a *different* domain, the browser blocks it completely, *unless* the other domain explicitly sends a permission slip saying "I allow this."

**How this affects our app:**
1. We load album art images from Spotify's servers (`i.scdn.co`).
2. Displaying the image via a simple `<img src="...">` is always allowed (you can *show* images from anywhere).
3. However, our `useImageBrightness` hook tries to load the image onto a `<canvas>` and then use `ctx.getImageData()` to mathematically read the exact RGB values of the pixels.
4. Because we are trying to *read the data* of an image from a different domain (`i.scdn.co`), the browser throws a CORS security error to stop us, unless Spotify's server attaches a specific CORS header (`Access-Control-Allow-Origin: *`) to the image when it sends it. If they don't, our brightness detection silently fails!
