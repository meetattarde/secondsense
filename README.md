# SecondSense

**A voice-first mobility companion prototype** for scene awareness, saved places, and walking navigation. The interface is designed for hands-free use after setup, with a large screen-reader-friendly control and a text fallback.

## Try it on a phone

Camera, microphone, geolocation, and WebXR need a secure origin such as HTTPS. Opening the HTML file directly is suitable only for a visual preview. Publish the folder to an HTTPS static host to try device features. For the exhibition, keep a supported phone connected to the internet for the first model download.

## What it does

- Starts continuous rear-camera recognition with one tap. It refreshes common-object detections continuously, draws boxes, and speaks when the recognized scene changes. You can pause/resume scanning or turn the camera off.
- Can give a camera-only rough distance guess for recognized classes with a known typical size. It uses the detected box height and an assumed 60° vertical camera field of view; it needs no extra sensor. A spoken illustrative 0.5×–2× range is shown, but real error can be much larger.
- Understands varied requests such as “Can you take me back to my house?”, “I need to get to the library,” “What do you see around me?”, and “Save where I am as Home.” It also has a typed request fallback.
- Spoken replies can be muted so a device screen reader can be the only voice output.
- Saves Home as an address/place name or current coordinates in this browser on this device.
- Opens Google Maps directly in walking navigation mode for Home or a spoken destination. Google Maps supplies the route, distance, ETA, and turn-by-turn guidance.
- Offers an experimental center-of-view range from supported WebXR depth sensors. It continuously samples the sensor and speaks its first reading and substantial changes.
- Includes current-location lookup, spoken feedback, a repeat button, help, and an installable PWA app shell.

## Use

1. Open the HTTPS site on the phone and tap **Start hands-free mode** once. Allow camera and microphone permissions if asked. The app starts continuous camera scanning and voice control together.
2. Save Home by typing an address/place name, or save the current GPS location.
3. Speak naturally. Examples: “Can you take me home?”, “Pause scanning,” “Start scanning again,” “Where am I?”, “Save where I am as Home,” “How far is that?”, “Repeat that,” “Help,” and “Mute replies.” The app opens Google Maps with walking navigation requested.
4. Continuous scene recognition begins after the model has loaded. Say “Pause scanning” and “Start scanning again” to control it hands-free.
5. On a compatible AR phone/browser, try **hardware depth scan** for center-view surface distance. Stop it to return to camera scanning.

Voice recognition and WebXR support depend on the browser. On supported browsers, one initial tap starts camera and voice control; camera/microphone permission prompts may still require approval. Voice recognition may stop or be unavailable in some browsers or when the page is backgrounded, so the text request box and screen reader remain available. The request parser supports a broad set of common phrasings for its built-in tasks; it is not an open-ended generative assistant. Camera-only distance is a monocular scale guess, not depth measurement: it assumes a typical object size and a 60° vertical field of view. The actual camera field of view, object dimensions, pose, cropping, and detection box can differ, so the displayed illustrative 0.5×–2× band is not a validated confidence interval and actual error may exceed it. Ask “how far?” for the latest sensor reading when available or camera-only guess otherwise. Hardware depth sensing remains optional and device dependent. The Maps URL requests turn-by-turn navigation; Google Maps may show a route preview if it cannot determine a usable starting location.

## Boundaries

This is a science-exhibition prototype, not a certified mobility aid. COCO-SSD recognizes only some familiar object categories and can miss or mislabel objects. A detected object is not necessarily a hazard. Camera-only estimates can be substantially wrong and are not measurements or obstacle warnings. The optional depth sensor measures a small center-of-view patch and is not tied to an object box. It can be unavailable, noisy, or inaccurate. Neither system determines whether a path is safe. Keep using a cane, guide dog, or other established mobility aid. Do not use this prototype for independent travel.

Object detection runs locally in the browser after scripts and model weights are downloaded. Browser speech recognition may use the browser provider's service. Home remains in local browser storage. The maps handoff sends the destination to Google Maps.

## Exhibition material

See [EXHIBITION.md](EXHIBITION.md) for the project abstract, explanation, live demo script, validation plan, and honest results template.

## Five-phase project plan

1. **Foundation:** phone UI, accessible voice/text control, Home, current location, and walking Maps handoff — implemented.
2. **Visual recognition:** continuous common-object recognition and spoken descriptions — experimental implementation; user/device validation remains.
3. **Distance and scene cues:** camera-only monocular estimates for known object classes plus optional WebXR depth scan — estimates require validation across phone cameras, object sizes, poses, lighting, and distances.
4. **Navigation:** flexible destination parsing and direct walking-navigation handoff — implemented; turn-by-turn guidance is provided by Google Maps.
5. **Validation and release readiness:** blind/low-vision user studies, supported-device testing, privacy/accessibility review, and fixes — required before any dependable-use claim.
