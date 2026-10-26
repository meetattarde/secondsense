# SecondSense — Exhibition Brief

## Project title

**SecondSense: a voice-first mobility companion using continuous scene recognition and walking-navigation handoff**

## Abstract

SecondSense explores how a phone can provide an additional layer of spoken awareness for a blind or low-vision traveler. A user can speak naturally, ask the phone to keep checking its rear camera for familiar objects, hear rough camera-only distance guesses for selected recognized classes, save a Home location, request a current-location check, and hand a destination to walking navigation. On phones that expose WebXR depth sensing, the prototype can also read an approximate distance to a small region at the center of view. The app runs as a web app and keeps image-based object recognition in the browser. This is a working research prototype, not a replacement for a cane, guide dog, or established mobility practice.

## Problem being explored

A mobility cane provides important near-ground information, while a traveler may also want spoken context about familiar objects and a fast way to start a saved walking route. The project asks whether a phone interface can make those interactions easier to request through natural speech and understandable without relying on visual controls.

## What is different

- **Continuous interaction:** after one camera start, recognition keeps running until the user pauses it or turns the camera off.
- **Natural requests:** the user can say a full request such as “Can you take me back to my house?” instead of memorizing one exact phrase. A typed request field is also available.
- **Direct route handoff:** destination requests open Google Maps in walking navigation mode, rather than leaving the user at a blank directions form.
- **Honest sensing:** the app separates camera object labels from hardware depth readings and clearly identifies when depth is unsupported.
- **Software-only range experiment:** selected object detections can be converted into rough monocular distance guesses from their image-box height and an assumed typical real-world object size. No extra sensor is required, but this is not a reliable measurement.
- **Accessibility-first design:** large touch targets, keyboard focus, screen-reader labels, spoken status, and non-voice fallback are included.

## How the system works

```text
Natural speech or typed request
              │
              ▼
      Intent and destination parser ───────► Google Maps walking navigation
              │
              ├──► Continuous camera ─► COCO-SSD ─► object + image-side description
              │                                      └► typical-size/FOV scale guess
              │
              ├──► Optional WebXR depth sensor ─► center-view range estimate
              │
              └──► GPS location / saved Home ─► spoken response and map handoff
```

The COCO-SSD model detects common categories and returns image boxes and confidence values. The interface translates box position into “left,” “center,” or “right” in the camera image. For selected categories, it estimates distance with `distance ≈ typical object height × assumed focal length in pixels ÷ detected box height in pixels`, using an assumed 60° vertical field of view. The app also speaks an illustrative 0.5×–2× band. This band is not statistically validated: actual error can exceed it because object sizes, camera field of view, object orientation, cropping, and detection boxes vary. Objects with unknown typical sizes get no camera-only distance guess. This is not a collision prediction and must not guide walking decisions. The depth path reads sensor-provided depth when a supported browser/device provides it; it measures scene geometry near the view center, not the same object the vision model detected.

## Live demonstration (about 3 minutes)

1. Show the phone screen reader or the large **Talk to SecondSense** control. Use the typed request box if the exhibition room is too noisy for speech recognition.
2. Save a demo destination as Home. For privacy, use a public venue or a synthetic address, not a student's home address.
3. Say: **“Can you take me back to my house?”** Explain that Google Maps receives a walking-navigation request and provides the route and ETA.
4. Return to SecondSense, tap **Start camera and scan**, and move a familiar object into the rear camera view. Let the app continuously recognize it, draw a box, and speak the object plus its image-side position.
5. Ask **“What do you see around me?”** and then **“Pause scanning.”** Explain that a missing detection does not mean the path is clear.
6. Say **“How far is it?”** with a known object in frame to hear the rough camera-only estimate. Compare it with a tape-measured distance and point out that the result can be substantially wrong. If the phone/browser supports depth sensing, start the optional scan and compare a center-view reading at known positions. Otherwise, show the honest unsupported-device message.

## What to measure before making claims

Record evidence rather than presenting expected results as measured results. Use a safe, supervised test area and do not ask participants to navigate obstacles using the prototype alone.

| Measure | Suggested method |
|---|---|
| Object recognition | Report precision/recall by object class across lighting, distance, and clutter conditions; record missed and incorrect detections. |
| Spoken alert delay | Time from an object entering the camera frame to the spoken alert; report median and 95th percentile on each phone. |
| Camera-only range error | Compare repeated estimates against tape-measured distances for each supported object class, multiple object instances, orientations, partial occlusion levels, distances, and phones; report error distribution and failure cases. The current 0.5×–2× band is illustrative, not evidence. |
| Hardware depth error | On supported depth devices, compare repeated readings against a tape-measured reference at multiple distances and surfaces; report median absolute error and spread. |
| Voice usability | Test varied accents, speaking rates, room noise, and alternate phrasings; report task completion and correction rate. |
| Accessibility | Have blind and low-vision reviewers complete setup, camera, Home, and navigation tasks with their normal assistive technology. Record observations and changes. |
| Battery and heat | Run a fixed-duration continuous scan on each device and record battery change, device temperature, and frame/inference rate. |

## Safety, privacy, and limitations

- Do not claim that the app detects every obstacle, measures every distance, or makes walking safe. Camera-only distance guesses are especially uncertain and can be substantially wrong.
- Do not conduct blindfolded obstacle courses or unsupervised mobility trials. Blindfolded sighted participants are not a substitute for blind/low-vision user research.
- Keep a cane, guide dog, and trained orientation-and-mobility practices in use during any demonstration.
- Use a synthetic/public Home address and ask permission before recording any participant or voice.
- COCO-SSD has a limited class vocabulary and can miss hazards, mislabel objects, or report irrelevant objects.
- Camera-only estimates rely on assumed object size and camera field of view, which can differ substantially from reality; their illustrative range is not a validated confidence interval.
- Phone depth sensing is device/browser dependent. WebXR depth sensing is limited in availability, and sensor estimates require device-specific accuracy evaluation.
- Google Maps provides the final route, distance, ETA, and turn prompts. Their availability and accessibility depend on the Maps app, account, region, and location permissions.

## References

- [TensorFlow.js COCO-SSD model documentation](https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd)
- [Google Maps URLs: directions and navigation](https://developers.google.com/maps/documentation/urls/get-started)
- [W3C WebXR Depth Sensing specification](https://www.w3.org/TR/webxr-depth-sensing-1/)
- [MDN: XRCPUDepthInformation.getDepthInMeters](https://developer.mozilla.org/en-US/docs/Web/API/XRCPUDepthInformation/getDepthInMeters)

## Results section for the final submission

Fill this section only after completing the tests. Do not invent values.

- Devices and browser versions tested:
- Object classes and test conditions:
- Detection precision/recall:
- Spoken-alert latency:
- Depth-device measurements and range error:
- Accessibility reviewer feedback:
- Issues found and fixes made:
- Remaining limitations:
