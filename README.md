# Spotify × Billie Eilish — Interactive Soundscapes Concept

An immersive, full-screen audio-visual web dashboard exploring a premium editorial collaboration concept between Spotify and Billie Eilish. This project breaks away from traditional static scrolling layouts to deliver an experience that feels less like a website and more like a native, high-end media application.

## 🌟 Key Features

* **Synchronized State Engine:** A single global index coordinates and drives the entire viewport. One click seamlessly updates the WebGL backdrop, shifts the typography layers, and swaps the music metadata simultaneously.
* **Interactive Album Card Deck:** Features a physical "vinyl deck" layout with layered CSS structures. Powered by GSAP, advancing a track triggers a multi-axis 3D fly-away animation revealing the next cover art underneath.
* **Premium Spotify Micro-Interactions:** Modern app-like capsule pill hover effects on navigation links and calls-to-action that dynamically expand background layers while flipping text contrast for optimal readability.
* **Fluid WebGL Backdrop:** Fragment shaders and liquid distortion rendering engines that track pointer movements to generate interactive visual depth across slide transitions.

## 🛠️ Tech Stack

* **Structure:** Semantic HTML5 & Flexbox Architecture
* **Styling:** Custom CSS3 (Glassmorphism properties, pseudo-element canvas layers)
* **Animation & Motion:** GSAP (GreenSock Animation Platform) using customized `expo.inOut` easing curves
* **WebGL Shaders:** Shery.js (Three.js abstraction layer) for interactive fluid distortion uniforms

## 💻 Architecture Highlights

* **Anti-Spam State Locks:** Integrated global timeline locks (`animating = true`) to prevent rapid click spamming from breaking asynchronous visual queues.
* **Propagation Barriers:** Utilizes defensive event bubbling management (`event.stopPropagation()`) to completely isolate music player controller interactions from general page sliding loops.

---
*Created as a front-end engineering and creative technology case study.*
