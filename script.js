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
var elems = document.querySelectorAll(".elem");

elems.forEach(elem => {
    var h1s = elem.querySelectorAll("h1");
    var index = 0;
    var animating = false; // Fixed typo "animatig"

    // FIX 1: Cleaned up the incorrect parenthesis surrounding document.querySelector
    document.querySelector("#main").addEventListener("click", () => {
        if (!animating) {
            animating = true;

            // Track the current h1 that needs to move out
            var currentH1 = h1s[index];

            gsap.to(currentH1, {
                top: '-=100%',
                ease: "expo.inOut", // Modern GSAP string format for Expo.easeInOut
                duration: 1,
                onComplete: function () {
                    // FIX 2: Safely reset the element using a direct reference instead of internal GSAP properties
                    gsap.set(currentH1, { top: '100%' });
                    animating = false;
                }
            });

            // Increment index or loop back to 0
            index === h1s.length - 1 ? (index = 0) : index++;

            // Animate the next incoming h1
            gsap.to(h1s[index], {
                top: '-=100%',
                ease: "expo.inOut",
                duration: 1
            });
        }
    }); // Parentheses match correctly now
});