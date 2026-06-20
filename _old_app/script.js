Shery.imageEffect("#back", {
    style: 5,
    gooey: true, // Moved safely to the main options object
    config: {
        "a": { "value": 2, "range": [0, 30] },
        "b": { "value": -0.91, "range": [-1, 1] },
        "zindex": { "value": -9996999, "range": [-9999999, 9999999] },
        "aspect": { "value": 2.1875719535735985 },
        "ignoreShapeAspect": { "value": true },
        "shapePosition": { "value": { "x": 0, "y": 0 } },
        "shapeScale": { "value": { "x": 0.5, "y": 0.5 } },
        "shapeEdgeSoftness": { "value": 0, "range": [0, 0.5] },
        "shapeRadius": { "value": 0, "range": [0, 2] },
        "currentScroll": { "value": 0 },
        "scrollLerp": { "value": 0.07 },
        "gooey": { "value": true }, // Keeps gooey active in shader

        /* FIX 1: Turn this to TRUE so your images loop endlessly on click */
        "infiniteGooey": { "value": true },

        /* FIX 2: Control how fast/slow the click transition happens */
        "durationIn": { "value": 1.5, "range": [0.1, 5] },
        "durationOut": { "value": 1.0, "range": [0.1, 5] },

        "growSize": { "value": 3.99, "range": [1, 15] },
        "displaceAmount": { "value": 0.5 },
        "masker": { "value": false },
        "maskVal": { "value": 1, "range": [1, 5] },
        "scrollType": { "value": 0 },
        "geoVertex": { "range": [1, 64], "value": 1 },
        "noEffectGooey": { "value": true },
        "onMouse": { "value": 0 },
        "noise_speed": { "value": 0.2, "range": [0, 10] },
        "metaball": { "value": 0.14, "range": [0, 2] },
        "discard_threshold": { "value": 0.46, "range": [0, 1] },
        "antialias_threshold": { "value": 0, "range": [0, 0.1] },
        "noise_height": { "value": 0.44, "range": [0, 2] },
        "noise_scale": { "value": 10.69, "range": [0, 100] }
    }
});



// 1. Core Element Selectors
var elems = document.querySelectorAll(".elem");
const cards = document.querySelectorAll('.album-card');

// 2. Track Data Array (Matches your 5 text slides perfectly)
// Updated to perfectly align with your exact slide order and official track listings
const trackData = [
    {
        title: "No Time To Die",
        artist: "Billie Eilish",
        duration: "4:02",
        time: "1:15",
        progress: "31%"
    },
    {
        title: "CHIHIRO",
        artist: "Billie Eilish",
        duration: "5:03",
        time: "2:42",
        progress: "53%"
    },
    {
        title: "dont smile at me",
        artist: "Billie Eilish",
        duration: "3:15",
        time: "0:58",
        progress: "29%"
    },
    {
        title: "BURY A FRIEND",
        artist: "Billie Eilish",
        duration: "3:13",
        time: "2:04",
        progress: "66%"
    },
    {
        title: "Happier Than Ever",
        artist: "Billie Eilish",
        duration: "4:58",
        time: "3:41",
        progress: "74%"
    }
];

// 3. State Tracking Variables
var masterIndex = 0; // One unified index to rule both the text and the player image
var totalSlides = 5; // Total number of slides/images
var animating = false;

// Initialize the music player visual depths on boot load
gsap.set(cards, { opacity: 0, scale: 0.95, y: 10, rotation: -2 });
gsap.set(cards[0], { opacity: 1, scale: 1, y: 0, rotation: 0 });

// ==========================================
// UNIFIED MASTER CLICK CLICK LISTENER
// ==========================================
document.querySelector("#main").addEventListener("click", () => {
    if (animating) return; // Prevent spam clicks from breaking timelines
    animating = true;

    // --- PART A: TEXT ANIMATION (LEFT SIDE) ---
    elems.forEach(elem => {
        var h1s = elem.querySelectorAll("h1");
        var currentH1 = h1s[masterIndex];

        // Slide out the active heading text upward
        gsap.to(currentH1, {
            top: '-=100%',
            ease: "expo.inOut",
            duration: 1,
            onComplete: function () {
                gsap.set(currentH1, { top: '100%' });
                animating = false; // Release the global animation lock
            }
        });

        // Determine next text index handle inside the loop scope safely
        let nextIndex = (masterIndex + 1) % totalSlides;

        // Slide up the incoming heading text from the bottom
        gsap.to(h1s[nextIndex], {
            top: '-=100%',
            ease: "expo.inOut",
            duration: 1
        });
    });

    // --- PART B: MUSIC PLAYER UPDATES (RIGHT SIDE) ---
    const outgoingCard = cards[masterIndex];

    // Calculate and advance the global track index pointer
    let oldIndex = masterIndex;
    masterIndex = (masterIndex + 1) % totalSlides;

    const incomingCard = cards[masterIndex];
    const data = trackData[masterIndex];

    // Core Player Card Swapping Timelines
    gsap.timeline()
        // Outgoing card flies away to the left elegantly
        .to(outgoingCard, {
            opacity: 0,
            x: -60,
            rotation: -8,
            scale: 0.9,
            duration: 0.35,
            ease: "power2.inOut",
            onComplete: () => {
                outgoingCard.classList.remove('active');
                gsap.set(outgoingCard, { x: 0, y: 10, rotation: -2, scale: 0.95 });
            }
        })
        // Metadata text fades down to update content parameters smoothly
        .to(['.track-title', '.artist-name', '.time-stamp:first-child', '.time-stamp:last-child'], {
            opacity: 0,
            y: -5,
            duration: 0.15,
            stagger: 0.02,
            onComplete: () => {
                document.querySelector('.track-title').innerText = data.title;
                document.querySelector('.artist-name').innerText = data.artist;
                document.querySelector('.playback-timeline .time-stamp:first-child').innerText = data.time;
                document.querySelector('.playback-timeline .time-stamp:last-child').innerText = data.duration;

                // Animate progress timeline fill percentage smoothly
                gsap.to('.progress-bar-fill', { width: data.progress, duration: 0.4, ease: "power1.out" });
            }
        }, "<")
        // Flash text blocks back up safely matching update states
        .to(['.track-title', '.artist-name', '.time-stamp:first-child', '.time-stamp:last-child'], {
            opacity: 1,
            y: 0,
            duration: 0.2,
            stagger: 0.02
        })
        // Drop the new card down into active viewport deck spaces
        .fromTo(incomingCard,
            { opacity: 0, scale: 1.1, y: -15, rotation: 6 },
            {
                opacity: 1,
                scale: 1,
                y: 0,
                rotation: 0,
                duration: 0.4,
                ease: "back.out(1.4)",
                onStart: () => incomingCard.classList.add('active')
            }, "-=0.2"
        );
});