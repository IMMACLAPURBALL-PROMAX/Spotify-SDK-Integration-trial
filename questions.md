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
