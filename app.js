const $ = (id) => document.getElementById(id);
const HOME_KEY = 'secondsense.home.v2';
const OLD_HOME_KEY = 'secondsense.home';

let homePlace = readSavedHome();
let recognition = null;
let voiceModeActive = false;
let voiceIsListening = false;
let isSpeaking = false;
let activeUtterance = null;
let pendingHomeAddress = false;
let lastAssistantText = 'Hi. You can ask me to describe the scene, find a place, or take you home.';
let speechOutputEnabled = localStorage.getItem('secondsense.speech-output') !== 'false';
let isNavigatingAway = false;
let toastTimer;

function readSavedHome() {
  try {
    const value = localStorage.getItem(HOME_KEY);
    if (value) return JSON.parse(value);
    const oldValue = localStorage.getItem(OLD_HOME_KEY);
    if (oldValue) return { label: oldValue, destination: oldValue, kind: 'address' };
  } catch { /* Ignore invalid local data and let the user save Home again. */ }
  return null;
}
function toast(message) {
  const el = $('toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}
function setAssistantStatus(message) { $('assistant-status').textContent = message; }
function say(message, { resumeListening = true, onEnd = null } = {}) {
  lastAssistantText = message;
  setAssistantStatus(message);
  if (!speechOutputEnabled || !('speechSynthesis' in window)) { onEnd?.(); return; }
  window.speechSynthesis.cancel();
  if (recognition && voiceModeActive) { isSpeaking = true; try { recognition.stop(); } catch { /* Recognition may already be idle. */ } }
  const utterance = new SpeechSynthesisUtterance(message);
  activeUtterance = utterance;
  utterance.lang = navigator.language || 'en-US'; utterance.rate = 0.92; utterance.pitch = 1;
  let finished = false;
  const finish = () => {
    if (finished || activeUtterance !== utterance) return;
    finished = true;
    isSpeaking = false; activeUtterance = null;
    onEnd?.();
    if (resumeListening && voiceModeActive) startRecognition();
    else if (!voiceModeActive) setAssistantStatus(message);
  };
  utterance.onend = finish; utterance.onerror = finish;
  window.speechSynthesis.speak(utterance);
}
function stopSpeech() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  activeUtterance = null; isSpeaking = false;
  setAssistantStatus(voiceModeActive ? 'Listening for your next request.' : 'Speech stopped. Tap Talk when you’re ready.');
  if (voiceModeActive) startRecognition();
}
function showHelp() {
  say('After starting hands-free mode, speak naturally. You can ask what is ahead, pause or resume scanning, ask how far a recognized object might be, find a place, take me home, save this place as home, tell me where I am, repeat, or ask for help. Say mute replies or unmute replies to change speech. Camera-only distances are rough guesses.');
}

function setHome(place) {
  homePlace = place;
  localStorage.setItem(HOME_KEY, JSON.stringify(place));
  $('home-input').value = place.kind === 'address' ? place.destination : '';
  $('home-summary').textContent = `Home saved: ${place.label}`;
  toast('Home saved on this device.');
}
if (homePlace) {
  $('home-summary').textContent = `Home saved: ${homePlace.label}`;
  if (homePlace.kind === 'address') $('home-input').value = homePlace.destination;
}
$('home-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const address = $('home-input').value.trim();
  if (!address) { say('Type a home address or place name first.'); $('home-input').focus(); return; }
  setHome({ label: address, destination: address, kind: 'address' });
  pendingHomeAddress = false;
  say('Home is saved on this device. Say take me home whenever you need walking navigation.');
});

function mapsDirectionsUrl(destination) {
  const params = new URLSearchParams({ api: '1', destination, travelmode: 'walking', dir_action: 'navigate' });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
function navigateTo(destination, label) {
  if (!destination) { say('I need a destination before I can start walking directions.'); return; }
  const url = mapsDirectionsUrl(destination);
  isNavigatingAway = true;
  if (depthSession) depthSession.end();
  if (cameraStream) stopCamera();
  let handedOff = false;
  let fallbackTimer;
  const handoff = () => {
    if (handedOff) return;
    handedOff = true; clearTimeout(fallbackTimer); window.location.assign(url);
  };
  fallbackTimer = window.setTimeout(handoff, 3000);
  // Briefly confirm by voice, then hand off in the same tab. The Maps URL
  // requests turn-by-turn navigation and works when invoked from speech input.
  say(`Starting walking navigation to ${label}. Opening Google Maps now.`, { resumeListening: false, onEnd: handoff });
}
function navigateHome() {
  if (!homePlace) {
    pendingHomeAddress = true; $('home-input').focus();
    say('I don’t have a Home saved yet. Tell me your home address or place name, or use Save current location as Home.');
    return;
  }
  navigateTo(homePlace.destination, 'Home');
}
$('home-directions').addEventListener('click', navigateHome);
$('forget-home').addEventListener('click', () => {
  homePlace = null; pendingHomeAddress = false; localStorage.removeItem(HOME_KEY); localStorage.removeItem(OLD_HOME_KEY);
  $('home-input').value = ''; $('home-summary').textContent = 'Home hasn’t been saved yet.';
  say('Saved Home has been removed from this device.');
});

let currentCoordinates = null;
function locationError(error) {
  const message = error?.code === 1 ? 'Location permission was not granted.' : 'I could not get your location. Check GPS and location permission, then try again.';
  $('location-result').textContent = message; say(message);
}
function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('This browser does not provide device location.')); return; }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });
  });
}
async function reportLocation() {
  $('location-result').textContent = 'Checking your current location…';
  try {
    const position = await getCurrentPosition();
    currentCoordinates = { latitude: position.coords.latitude, longitude: position.coords.longitude };
    const coords = `${currentCoordinates.latitude.toFixed(5)}, ${currentCoordinates.longitude.toFixed(5)}`;
    $('location-result').replaceChildren();
    const text = document.createElement('span'); text.textContent = `Location found · ${coords} `;
    const link = document.createElement('a'); link.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords)}`; link.textContent = 'Open in Maps'; link.target = '_blank'; link.rel = 'noopener';
    $('location-result').append(text, link);
    say(`Your current coordinates are ${currentCoordinates.latitude.toFixed(4)}, ${currentCoordinates.longitude.toFixed(4)}. You can open your location in Maps on the screen.`);
  } catch (error) { locationError(error); }
}
async function saveCurrentLocationAsHome() {
  say('Getting your location to save as Home.');
  try {
    const position = await getCurrentPosition();
    const destination = `${position.coords.latitude},${position.coords.longitude}`;
    setHome({ label: 'Saved current location', destination, kind: 'coordinates' });
    say('Your current location is saved as Home on this device.');
  } catch (error) { locationError(error); }
}
$('location-button').addEventListener('click', reportLocation);
$('save-current-home').addEventListener('click', saveCurrentLocationAsHome);

let cameraStream = null;
let objectModel = null;
let modelPromise = null;
let continuousScanning = false;
let detectionLoopRunning = false;
let lastAnnouncedObjects = '';
let lastObjectAnnouncementAt = 0;
let latestSceneDescription = '';
let latestEstimatedSummary = '';
let rangeEstimateEnabled = localStorage.getItem('secondsense.range-estimates') !== 'false';
const TYPICAL_OBJECT_HEIGHT_M = {
  person: 1.65, bicycle: 1.05, car: 1.5, motorcycle: 1.15, airplane: 3.5,
  bus: 3, train: 3, truck: 2.8, boat: 1.5, 'traffic light': 0.7, 'fire hydrant': 0.75,
  'stop sign': 0.75, 'parking meter': 1.2, bench: 0.9, bird: 0.25, cat: 0.3,
  dog: 0.5, horse: 1.5, sheep: 0.75, cow: 1.4, elephant: 2.5, bear: 1.3,
  zebra: 1.4, giraffe: 4, backpack: 0.45, umbrella: 0.9, handbag: 0.3,
  suitcase: 0.55, frisbee: 0.25, skis: 1.7, snowboard: 1.5, 'sports ball': 0.22,
  kite: 0.8, 'baseball bat': 0.85, 'baseball glove': 0.25, skateboard: 0.8,
  surfboard: 1.8, 'tennis racket': 0.68, bottle: 0.25, 'wine glass': 0.2,
  cup: 0.1, fork: 0.18, knife: 0.22, spoon: 0.16, bowl: 0.15,
  banana: 0.18, apple: 0.08, sandwich: 0.12, orange: 0.08, broccoli: 0.25,
  carrot: 0.18, 'hot dog': 0.18, pizza: 0.3, donut: 0.1, cake: 0.2,
  chair: 0.9, couch: 0.85, 'potted plant': 0.6, bed: 0.6, 'dining table': 0.75,
  toilet: 0.75, tv: 0.6, laptop: 0.25, mouse: 0.04, remote: 0.18,
  keyboard: 0.04, 'cell phone': 0.15, microwave: 0.3, oven: 0.6, toaster: 0.2,
  sink: 0.3, refrigerator: 1.7, book: 0.23, clock: 0.3, vase: 0.3,
  scissors: 0.18, 'teddy bear': 0.35, 'hair drier': 0.22, toothbrush: 0.18
};
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = [...document.scripts].find(script => script.src === src);
    if (existing) { if (existing.dataset.loaded === 'true') resolve(); else { existing.addEventListener('load', resolve, { once: true }); existing.addEventListener('error', () => reject(new Error('Could not load the object model. Check your internet connection.')), { once: true }); } return; }
    const script = document.createElement('script'); script.src = src; script.async = true;
    script.onload = () => { script.dataset.loaded = 'true'; resolve(); };
    script.onerror = () => reject(new Error('Could not load the object model. Check your internet connection.'));
    document.head.appendChild(script);
  });
}
async function loadObjectModel() {
  if (objectModel) return objectModel;
  if (!modelPromise) modelPromise = (async () => {
    $('camera-results').textContent = 'Loading the on-device recognition model…';
    if (!window.tf) await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
    if (!window.cocoSsd) await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js');
    await window.tf.ready();
    objectModel = await window.cocoSsd.load({ base: 'lite_mobilenet_v2' });
    return objectModel;
  })();
  try { return await modelPromise; } catch (error) { modelPromise = null; throw error; }
}
function classifyRegion(item, frameWidth) {
  const center = item.bbox[0] + item.bbox[2] / 2;
  if (center < frameWidth * 0.36) return 'on your left';
  if (center > frameWidth * 0.64) return 'on your right';
  return 'near the center';
}
function estimateMonocularRange(item, frameHeight) {
  const typicalHeight = TYPICAL_OBJECT_HEIGHT_M[item.class];
  const boxHeight = item.bbox?.[3];
  if (!typicalHeight || !Number.isFinite(boxHeight) || boxHeight < 2 || !frameHeight) return null;
  // Pinhole-camera approximation with an assumed 60° vertical field of view.
  // Phone-specific FOV, object pose, truncation, and class-size variation can
  // make this estimate substantially wrong.
  const assumedVerticalFov = 60 * Math.PI / 180;
  const focalPixels = frameHeight / (2 * Math.tan(assumedVerticalFov / 2));
  const meters = typicalHeight * focalPixels / boxHeight;
  if (!Number.isFinite(meters) || meters < 0.15 || meters > 30) return null;
  return meters;
}
function describeEstimate(item) {
  if (item.estimate === null) return `${item.class}: distance guess unavailable`;
  const low = Math.max(0.1, item.estimate * 0.5);
  const high = item.estimate * 2;
  return `${item.class}, very rough camera guess ${item.estimate.toFixed(1)} meters, illustrative range ${low.toFixed(1)} to ${high.toFixed(1)} meters`;
}
function updateRangeToggle() {
  const toggle = $('range-estimate-toggle');
  toggle.checked = rangeEstimateEnabled;
  toggle.addEventListener('change', () => {
    rangeEstimateEnabled = toggle.checked;
    localStorage.setItem('secondsense.range-estimates', String(rangeEstimateEnabled));
    say(rangeEstimateEnabled ? 'Camera-only distance guesses are on. They can be very wrong; do not use them to judge walking safety.' : 'Camera-only distance guesses are off.');
  });
}
function drawDetections(detections) {
  const video = $('camera-video'); const canvas = $('detection-overlay');
  const width = canvas.clientWidth; const height = canvas.clientHeight; const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio); ctx.clearRect(0, 0, width, height);
  if (!video.videoWidth || !video.videoHeight) return;
  const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
  const offsetX = (width - video.videoWidth * scale) / 2; const offsetY = (height - video.videoHeight * scale) / 2;
  detections.forEach(item => {
    const [x, y, boxWidth, boxHeight] = item.bbox;
    const left = x * scale + offsetX; const top = y * scale + offsetY;
    ctx.strokeStyle = '#a5f1d3'; ctx.lineWidth = 3; ctx.strokeRect(left, top, boxWidth * scale, boxHeight * scale);
    const label = `${item.class} · ${Math.round(item.score * 100)}%`; ctx.font = '700 14px system-ui';
    const labelWidth = ctx.measureText(label).width + 14; const labelTop = Math.max(0, top - 25);
    ctx.fillStyle = '#071522ee'; ctx.fillRect(left, labelTop, labelWidth, 23); ctx.fillStyle = '#ffffff'; ctx.fillText(label, left + 7, Math.max(16, top - 9));
  });
}
function stopCamera() {
  continuousScanning = false;
  if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
  cameraStream = null; $('camera-video').srcObject = null; $('camera-video').classList.remove('active');
  $('camera-placeholder').hidden = false; $('camera-button').textContent = 'Start camera and scan';
  $('scan-button').disabled = true; $('scan-button').textContent = 'Pause scanning';
  $('camera-state').textContent = 'Camera off'; $('camera-state').classList.remove('on'); $('camera-results').textContent = 'Camera is off.';
  const canvas = $('detection-overlay'); canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}
async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) { say('Camera access needs a supported browser and a secure website connection, such as HTTPS.'); return; }
  if (cameraStream) return;
  $('camera-button').disabled = true;
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    $('camera-video').srcObject = cameraStream; $('camera-video').classList.add('active'); $('camera-placeholder').hidden = true;
    await $('camera-video').play();
    $('camera-button').textContent = 'Turn camera off'; $('scan-button').disabled = false; $('scan-button').textContent = 'Pause scanning';
    $('camera-state').textContent = 'Scanning'; $('camera-state').classList.add('on');
    continuousScanning = true; lastAnnouncedObjects = ''; latestSceneDescription = '';
    latestEstimatedSummary = '';
    say('Camera is on. I’m continuously checking for familiar objects. I’ll speak when the recognized scene changes.');
    runContinuousDetection();
  } catch (error) {
    if (cameraStream) cameraStream.getTracks().forEach(track => track.stop()); cameraStream = null;
    $('camera-video').srcObject = null; $('camera-video').classList.remove('active'); $('camera-placeholder').hidden = false;
    $('camera-results').textContent = 'Camera could not start. Check camera permission and try again.';
    say(error?.name === 'NotAllowedError' ? 'Camera permission was not granted. You can enable it in browser settings.' : 'I could not start the camera. Check permission and try again.');
  } finally { $('camera-button').disabled = false; }
}
$('camera-button').addEventListener('click', () => {
  if (cameraStream) { stopCamera(); say('Camera is off.'); }
  else startCamera();
});
async function runContinuousDetection() {
  if (detectionLoopRunning) return;
  detectionLoopRunning = true;
  try {
    const model = await loadObjectModel();
    while (continuousScanning && cameraStream) {
      const detections = await model.detect($('camera-video'), 8, 0.52);
      if (!continuousScanning || !cameraStream) break;
      drawDetections(detections);
      if (!detections.length) {
        $('camera-results').textContent = 'No familiar objects recognized. This does not mean the path is clear.';
        latestSceneDescription = 'I don’t recognize a familiar object in the latest scan. That does not mean the path is clear.';
        lastAnnouncedObjects = '';
        latestEstimatedSummary = '';
      } else {
        const relevant = detections.slice(0, 4).map(item => ({
          ...item,
          region: classifyRegion(item, $('camera-video').videoWidth),
          estimate: estimateMonocularRange(item, $('camera-video').videoHeight)
        }));
        const visualDescriptions = relevant.map(item => `${item.class} ${item.region} (${Math.round(item.score * 100)}%)`);
        const estimateDescriptions = relevant.map(describeEstimate);
        latestEstimatedSummary = estimateDescriptions.slice(0, 3).join('; ');
        $('camera-results').textContent = `Recognized: ${visualDescriptions.join(' · ')}. ${rangeEstimateEnabled ? `Very rough camera-only guesses: ${estimateDescriptions.join(' · ')}.` : 'Camera-only distance guesses are off.'}`;
        latestSceneDescription = `The latest scan recognizes ${relevant.slice(0, 3).map(item => `${item.class} ${item.region}`).join('; ')}. ${rangeEstimateEnabled ? `Very rough camera-only guesses: ${latestEstimatedSummary}. These may be substantially wrong.` : 'Camera-only distance guesses are off.'}`;
        // Coarse distance buckets make meaningful approach/recession changes
        // speak without announcing every small frame-to-frame fluctuation.
        const signature = relevant.map(item => `${item.class}:${item.region}:${rangeEstimateEnabled && item.estimate !== null ? Math.round(item.estimate) : ''}`).sort().join('|');
        const now = Date.now();
        if (signature !== lastAnnouncedObjects && now - lastObjectAnnouncementAt > 3500) {
          const descriptions = relevant.slice(0, 3).map(item => `${item.class} ${item.region}`).join('; ');
          const estimateText = rangeEstimateEnabled ? ` Very rough camera-only guesses: ${relevant.slice(0, 3).map(describeEstimate).join('; ')}. These may be substantially wrong and are not a safety measurement.` : '';
          say(`Possible objects: ${descriptions}.${estimateText}`);
          lastAnnouncedObjects = signature; lastObjectAnnouncementAt = now;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 700));
    }
  } catch (error) {
    $('camera-results').textContent = error.message || 'Object recognition is unavailable. Check your internet connection.';
    $('camera-state').textContent = 'Recognition paused'; $('camera-state').classList.remove('on');
    continuousScanning = false; $('scan-button').textContent = 'Resume scanning'; say('Object recognition stopped. Check the connection and tap resume to try again.');
  } finally { detectionLoopRunning = false; }
}
$('scan-button').addEventListener('click', () => {
  if (!cameraStream) { say('Start the camera before scanning.'); return; }
  continuousScanning = !continuousScanning;
  $('scan-button').textContent = continuousScanning ? 'Pause scanning' : 'Resume scanning';
  $('camera-state').textContent = continuousScanning ? 'Scanning' : 'Scanning paused'; $('camera-state').classList.toggle('on', continuousScanning);
  if (continuousScanning) { $('camera-results').textContent = 'Resuming continuous object recognition…'; runContinuousDetection(); say('Scanning resumed.'); }
  else { $('camera-results').textContent = 'Scanning paused. The camera is still on.'; say('Scanning paused. The camera is still on.'); }
});

let depthSession = null;
let depthReferenceSpace = null;
let latestDepthMeters = null;
let lastDepthUiUpdate = 0;
let lastDepthSpokenMeters = null;
let lastDepthSpokenAt = 0;
const xrCanvas = document.createElement('canvas');
const xrGl = xrCanvas.getContext('webgl', { alpha: true, xrCompatible: true });
function centerDepthSamples(info) {
  if (typeof info.getDepthInMeters !== 'function') return [];
  const values = [];
  for (const dx of [-0.01, 0, 0.01]) for (const dy of [-0.01, 0, 0.01]) {
    const meters = info.getDepthInMeters(0.5 + dx, 0.5 + dy);
    if (Number.isFinite(meters) && meters > 0 && meters <= 20) values.push(meters);
  }
  return values;
}
function depthFrame(_time, frame) {
  if (!depthSession || frame.session !== depthSession) return;
  const pose = frame.getViewerPose(depthReferenceSpace); let samples = [];
  if (pose) for (const view of pose.views) {
    try { const info = frame.getDepthInformation?.(view); if (info) { samples = centerDepthSamples(info); if (samples.length) break; } } catch { /* An unavailable frame is skipped; the next XR frame may contain data. */ }
  }
  if (samples.length) {
    samples.sort((a, b) => a - b); latestDepthMeters = samples[Math.floor(samples.length / 2)];
    const now = performance.now();
    if ((lastDepthSpokenMeters === null || Math.abs(latestDepthMeters - lastDepthSpokenMeters) >= 0.5) && now - lastDepthSpokenAt > 4000) {
      say(`Center-view surface, about ${latestDepthMeters.toFixed(1)} meters away. Sensor estimate only.`);
      lastDepthSpokenMeters = latestDepthMeters; lastDepthSpokenAt = now;
    }
    if (now - lastDepthUiUpdate > 500) {
      $('depth-reading').textContent = `Center-view surface: about ${latestDepthMeters.toFixed(1)} m away`;
      $('depth-status').textContent = `Depth sensor active · ${samples.length} valid center samples`;
      $('depth-speak').disabled = false; lastDepthUiUpdate = now;
    }
  } else {
    latestDepthMeters = null;
    if (performance.now() - lastDepthUiUpdate > 2500) {
      $('depth-reading').textContent = 'No valid depth reading at the center of view.';
      $('depth-status').textContent = 'Depth scan is active, but the sensor has no usable center reading. Try a textured, well-lit scene.';
      $('depth-speak').disabled = true; lastDepthUiUpdate = performance.now();
    }
  }
  try {
    xrGl.bindFramebuffer(xrGl.FRAMEBUFFER, depthSession.renderState.baseLayer.framebuffer);
    xrGl.clearColor(0, 0, 0, 0); xrGl.clear(xrGl.COLOR_BUFFER_BIT | xrGl.DEPTH_BUFFER_BIT);
    depthSession.requestAnimationFrame(depthFrame);
  } catch { /* The browser ends the session when the user exits immersive AR. */ }
}
async function startDepthScan() {
  if (!navigator.xr || !xrGl) { $('depth-status').textContent = 'This browser does not provide the WebXR depth feature. Try a compatible AR phone and browser over HTTPS.'; say('This browser does not provide the hardware depth scan.'); return; }
  $('depth-start').disabled = true; $('depth-status').textContent = 'Requesting phone depth sensing…';
  const resumeCameraAfterDepth = !!cameraStream;
  try {
    if (cameraStream) stopCamera();
    depthSession = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['depth-sensing'], optionalFeatures: ['dom-overlay'],
      depthSensing: { usagePreference: ['cpu-optimized'], dataFormatPreference: ['luminance-alpha', 'float32', 'unsigned-short'] },
      domOverlay: { root: document.body }
    });
    await xrGl.makeXRCompatible();
    depthSession.updateRenderState({ baseLayer: new XRWebGLLayer(depthSession, xrGl) });
    depthReferenceSpace = await depthSession.requestReferenceSpace('viewer');
    latestDepthMeters = null; lastDepthUiUpdate = 0; lastDepthSpokenMeters = null; lastDepthSpokenAt = 0;
    $('depth-status').textContent = 'Depth session is live. Aim the center of the phone view at a surface.';
    $('depth-reading').textContent = 'Waiting for depth data…'; $('depth-stop').disabled = false;
    depthSession.addEventListener('end', () => {
      depthSession = null; latestDepthMeters = null; $('depth-start').disabled = false; $('depth-stop').disabled = true; $('depth-speak').disabled = true;
      $('depth-status').textContent = 'Depth scan ended.'; $('depth-reading').textContent = 'No depth reading.';
      if (resumeCameraAfterDepth && !isNavigatingAway) startCamera();
    }, { once: true });
    depthSession.requestAnimationFrame(depthFrame);
  } catch (error) {
    depthSession = null; $('depth-start').disabled = false;
    const message = error?.name === 'NotSupportedError' ? 'This phone or browser does not support WebXR depth sensing.' : error?.name === 'NotAllowedError' ? 'Depth sensor permission was not granted.' : 'Could not start depth sensing. Check HTTPS, permission, and AR support.';
    $('depth-status').textContent = message; $('depth-reading').textContent = 'No depth reading.'; say(message);
    if (resumeCameraAfterDepth && !isNavigatingAway) startCamera();
  }
}
$('depth-start').addEventListener('click', startDepthScan);
$('depth-stop').addEventListener('click', () => depthSession?.end());
$('depth-speak').addEventListener('click', () => {
  if (!Number.isFinite(latestDepthMeters)) { say('There is no current depth reading.'); return; }
  say(`At the center of the view, a surface is about ${latestDepthMeters.toFixed(1)} meters away. That is a sensor estimate, not an obstacle warning.`);
});
updateRangeToggle();

function normalizeSpeech(text) {
  return text.toLowerCase().replace(/[“”]/g, ' ').replace(/[?!.,]/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^(hey\s+)?(second\s*sense|assistant)[, ]*/i, '').replace(/\b(um|uh|please|could you|would you|can you)\b/g, '').replace(/\s+/g, ' ').trim();
}
function extractDestination(text) {
  const patterns = [
    /\b(?:how do i get|how can i get|get me|get|take me|send me|lead me|guide me|navigate(?: me)?|navigation|directions?|route|go|head|walk|travel|reach|visit|find|search|look(?:ing)?)\b\s+(?:back\s+)?(?:straight\s+)?(?:me\s+)?(?:to|towards|for)?\s*(?:the\s+)?(.+)$/,
    /\b(?:i need|i want)\s+(?:to\s+)?(?:get|go|walk|travel)?\s*(?:to|towards)\s+(.+)$/,
    /\bopen maps\s+(?:and\s+)?(?:to|for)\s+(.+)$/
  ];
  for (const pattern of patterns) { const match = text.match(pattern); if (match?.[1]) return match[1].replace(/^(?:me\s+)?(?:to\s+)?(?:(?:the|a|an)\s+)?/i, '').replace(/\b(please|now|for me|walking directions?)\b/g, '').trim(); }
  return null;
}
async function processRequest(rawText) {
  const raw = rawText.trim(); if (!raw) return;
  $('heard-text').textContent = raw;
  const text = normalizeSpeech(raw);
  if (/\b(cancel|never mind|nevermind)\b/.test(text)) { pendingHomeAddress = false; $('text-command').value = ''; say('Okay, cancelled.'); return; }
  if (/\b(stop listening|turn off voice|stop voice control)\b/.test(text)) { stopVoiceMode(); say('Voice control is off. Tap Talk when you need me again.', { resumeListening: false }); return; }
  if (/\b(?:turn|switch)\s+(?:the\s+)?(?:spoken\s+)?repl(?:y|ies)\s+off\b|\b(?:mute|silence)\s+(?:yourself|replies|spoken replies|voice replies)\b/.test(text)) {
    if (speechOutputEnabled) { speechOutputEnabled = false; localStorage.setItem('secondsense.speech-output', 'false'); updateSpeechToggle(); }
    say('Spoken replies are off. Voice control is still listening.'); return;
  }
  if (/\b(?:turn|switch)\s+(?:the\s+)?(?:spoken\s+)?repl(?:y|ies)\s+on\b|\b(?:unmute|restore)\s+(?:yourself|replies|spoken replies|voice replies)\b/.test(text)) {
    if (!speechOutputEnabled) { speechOutputEnabled = true; localStorage.setItem('secondsense.speech-output', 'true'); updateSpeechToggle(); }
    say('Spoken replies are on.'); return;
  }
  if (/\b(?:turn off|disable)\b.{0,50}\b(?:estimate|guess|range)s?\b/.test(text)) {
    $('range-estimate-toggle').checked = false;
    rangeEstimateEnabled = false; localStorage.setItem('secondsense.range-estimates', 'false');
    say('Camera-only distance guesses are off.'); return;
  }
  if (/\b(?:turn on|enable)\b.{0,50}\b(?:estimate|guess|range)s?\b/.test(text)) {
    $('range-estimate-toggle').checked = true;
    rangeEstimateEnabled = true; localStorage.setItem('secondsense.range-estimates', 'true');
    say('Camera-only distance guesses are on. They may be substantially wrong.'); return;
  }
  if (/\b(stop talking|be quiet|quiet)\b/.test(text)) { stopSpeech(); return; }
  if (/\b(repeat|say that again|repeat that)\b/.test(text)) { say(lastAssistantText); return; }
  if (/\b(help|what can you do|how do i use)\b/.test(text)) { showHelp(); return; }
  if (/\b(forget|remove|delete|clear)\b.{0,25}\b(home|house)\b/.test(text)) { $('forget-home').click(); return; }
  if (/\b(stop|end|exit|close)\b.{0,25}\b(depth|range)\b.{0,15}\b(scan(?:ning)?|reading|session)\b/.test(text) || /\b(stop|end|exit|close)\b.{0,20}\bdepth scan(?:ning)?\b/.test(text)) {
    if (depthSession) { depthSession.end(); say('Depth scan stopped.'); } else say('The depth scan is not running.'); return;
  }
  if (/\b(turn off|switch off|pause|stop)\s+(?:the\s+)?camera\b/.test(text) || /\b(pause|stop)\s+(?:the\s+)?(?:scanning|scan)\b/.test(text)) {
    if (/camera/.test(text)) stopCamera();
    else if (cameraStream) { continuousScanning = false; $('scan-button').textContent = 'Resume scanning'; $('camera-state').textContent = 'Scanning paused'; $('camera-state').classList.remove('on'); }
    say(/camera/.test(text) ? 'Camera is off.' : 'Scanning is paused. The camera is still on.'); return;
  }
  if (/\b(start|resume|continue)\s+(?:the\s+)?(?:camera|scanning|scan)\b/.test(text)) {
    if (!cameraStream) startCamera(); else if (!continuousScanning) $('scan-button').click(); else say('Scanning is already running.'); return;
  }
  if (/\b(?:read|speak|tell me|measure)\b.{0,25}\b(?:distance|range)\b/.test(text) || /\bdepth reading\b/.test(text) || /\bhow far\b/.test(text)) {
    if (Number.isFinite(latestDepthMeters)) { $('depth-speak').click(); return; }
    if (cameraStream && latestEstimatedSummary) { say(`Latest very rough camera-only guesses: ${latestEstimatedSummary}. The real distance may be substantially different. Do not use this to judge walking safety.`); return; }
    say('There is no current distance estimate. Start camera scanning for a very rough camera-only guess, or try hardware depth scan on a supported phone.'); return;
  }
  if (/\b(start|begin|try|enable|turn on|open)\b.{0,20}\b(depth|range)\b.{0,12}\b(scan(?:ning)?|sensor)\b/.test(text)) { $('depth-start').click(); return; }
  const sceneRequest = (/\b(?:what is|what's|describe|tell me|identify)\b/.test(text) && /\b(ahead|around|in front|surroundings|scene|see|that|this|here|there)\b/.test(text))
    || /\bwhat do (?:you|i) see\b/.test(text) || /\bwhat can you see\b/.test(text) || /\b(?:do|can) you see\b/.test(text)
    || /\bwhat am i (?:facing|looking at)\b/.test(text)
    || /\b(?:scan|check|look)\b.{0,25}\b(ahead|around|the area|in front|surroundings|here|there)\b/.test(text);
  if (sceneRequest) {
    if (!cameraStream) { say('I’ll start the camera and keep scanning for familiar objects.'); startCamera(); return; }
    if (!continuousScanning) $('scan-button').click();
    say(latestSceneDescription ? `${latestSceneDescription} Recognition can miss things; use your mobility aid.` : 'I’m scanning continuously. I’ll describe recognized changes as they happen. I may miss objects and cannot tell if the way is clear.'); return;
  }
  const saveCurrentIntent = /\b(save|store|mark|set|remember)\b.{0,35}\b(home|house)\b.{0,30}\b(here|current|this|where i am|my location)\b/.test(text)
    || /\b(save|store|mark|set|remember)\b.{0,30}\b(here|this location|this place|this position|current location|current place|my current location|my location|my position|where i am)\b.{0,20}\b(as|for)\s+(my\s+)?(home|house)\b/.test(text);
  if (saveCurrentIntent) { await saveCurrentLocationAsHome(); return; }
  const inlineHome = raw.match(/\b(?:my home(?: address)? is|set home to|save home as|home address is|remember home as)\s+(.+)$/i)
    || text.match(/\b(?:my home(?: address)? is|set home to|save home as|home address is|remember home as)\s+(.+)$/);
  if (inlineHome?.[1]) { const address = inlineHome[1].trim().replace(/[.!?]+$/, ''); setHome({ label: address, destination: address, kind: 'address' }); pendingHomeAddress = false; say(`Saved ${address} as Home. Say take me home to start walking navigation.`); return; }
  if (pendingHomeAddress && !/\b(home|house)\b/.test(text)) {
    pendingHomeAddress = false; setHome({ label: raw, destination: raw, kind: 'address' }); say(`Saved ${raw} as Home. Say take me home to start walking navigation.`); return;
  }
  if (/\b(where am i|where i am|my location|current location|where are we|my position|locate me|find my location|show my location)\b/.test(text)) { await reportLocation(); return; }
  if (/\b(?:where is|what is|what's|where did i save|tell me)\b.{0,20}\b(my\s+)?(home|house)\b/.test(text)) {
    say(homePlace ? `Your saved Home is ${homePlace.label}. Ask me to take you home to start walking navigation.` : 'You have not saved a Home yet. Tell me an address or save your current location as Home.'); return;
  }
  const routeIntent = /\b(how do i get|how can i get|get me|get|take me|send me|lead me|guide me|navigate|navigation|directions?|route|go|head|walk|travel|reach|visit|find|search|looking for|open maps|i need|i want)\b/.test(text);
  if (routeIntent && /\b(home|house|my place)\b/.test(text)) { navigateHome(); return; }
  if (routeIntent) {
    const destination = extractDestination(text);
    if (destination && destination.length > 1) { navigateTo(destination, destination); return; }
  }
  if (/\b(save|set|change|update|remember)\b.{0,25}\b(home|house)\b/.test(text) || /\bhome address\b/.test(text)) {
    pendingHomeAddress = true; $('home-input').focus(); say('Tell me the home address or place name. You can say it now, or type it in the Home field.'); return;
  }
  if (/\b(start|turn on|open)\b.{0,20}\b(camera|scanner)\b/.test(text)) { if (!cameraStream) startCamera(); else if (!continuousScanning) $('scan-button').click(); else say('Camera scanning is already running.'); return; }
  if (/\b(home|house)\b/.test(text) && /\b(where|directions|route|go|take|navigate|navigation)\b/.test(text)) { navigateHome(); return; }
  say(`I heard “${raw}”. I can help with that in a few ways: ask me to describe the scene, say where you want to go, ask for Home, or ask where you are. You can phrase it naturally.`);
}
$('text-command-form').addEventListener('submit', event => { event.preventDefault(); const value = $('text-command').value; $('text-command').value = ''; processRequest(value); });
$('help-button').addEventListener('click', showHelp);
$('repeat-button').addEventListener('click', () => say(lastAssistantText));
function updateSpeechToggle() {
  $('speech-toggle').textContent = speechOutputEnabled ? '🔊' : '🔇';
  $('speech-toggle').setAttribute('aria-pressed', String(speechOutputEnabled));
  $('speech-toggle').setAttribute('aria-label', speechOutputEnabled ? 'Turn spoken replies off to use your screen reader voice' : 'Turn spoken replies on');
  $('assistant-status').setAttribute('aria-live', speechOutputEnabled ? 'off' : 'polite');
}
updateSpeechToggle();
$('speech-toggle').addEventListener('click', () => {
  speechOutputEnabled = !speechOutputEnabled; localStorage.setItem('secondsense.speech-output', String(speechOutputEnabled)); updateSpeechToggle();
  say(speechOutputEnabled ? 'Spoken replies are on.' : 'Spoken replies are off. Status messages will be available to your screen reader.');
});

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
function updateVoiceUI(listening) {
  voiceIsListening = listening;
  $('talk-button').classList.toggle('listening', listening);
  $('talk-label').textContent = listening ? 'Listening — say “stop voice control” to stop' : 'Start hands-free mode';
  $('voice-indicator').classList.toggle('listening', listening);
  $('talk-button').setAttribute('aria-label', listening ? 'SecondSense is listening' : 'Start hands-free mode');
  if (listening) setAssistantStatus('Listening. Speak naturally. Say “stop voice control” to turn listening off.');
}
function startRecognition() {
  if (!recognition || !voiceModeActive || isSpeaking) return;
  try { recognition.start(); } catch { /* Browser may still be transitioning between listen and speech. */ }
}
function stopVoiceMode() {
  voiceModeActive = false; isSpeaking = false; updateVoiceUI(false);
  if (recognition) { try { recognition.stop(); } catch { /* Already stopped. */ } }
}
if (SpeechRecognition) {
  recognition = new SpeechRecognition(); recognition.lang = navigator.language || 'en-US'; recognition.continuous = true; recognition.interimResults = false; recognition.maxAlternatives = 3;
  recognition.onstart = () => { if (!isSpeaking) updateVoiceUI(true); };
  recognition.onend = () => { updateVoiceUI(false); if (voiceModeActive && !isSpeaking) window.setTimeout(startRecognition, 350); };
  recognition.onerror = (event) => {
    if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(event.error)) {
      voiceModeActive = false; updateVoiceUI(false);
      say('Voice input is unavailable. Check microphone permission, or type a request instead.', { resumeListening: false });
    }
  };
  recognition.onresult = (event) => {
    const result = event.results[event.results.length - 1];
    if (result.isFinal && result[0]?.transcript) processRequest(result[0].transcript.trim());
  };
} else {
  $('talk-label').textContent = 'Start camera — voice input unavailable';
  setAssistantStatus('This browser may not support voice input. You can still start the camera, but voice control needs a supported browser.');
}
$('talk-button').addEventListener('click', () => {
  if (voiceModeActive) {
    stopVoiceMode();
    say('Voice control is off. Tap Start hands-free mode to turn it on again.', { resumeListening: false });
    return;
  }
  voiceModeActive = !!recognition;
  setAssistantStatus(recognition ? 'Starting camera and voice control…' : 'Starting camera. Voice input is unavailable in this browser.');
  // This single user gesture starts both permission-gated features. Once they
  // are running, the main actions are available by speech without more taps.
  startCamera();
  if (recognition) {
    startRecognition();
    say('Hands-free mode is starting. Allow camera and microphone access if asked. Then speak naturally.');
  }
  else say('The camera is starting. This browser does not support speech recognition, so use its screen reader and the on-screen request field.');
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && cameraStream) {
    // Keep the camera session but stop expensive inference while the app is backgrounded.
    continuousScanning = false; $('scan-button').textContent = 'Resume scanning';
    $('camera-state').textContent = 'Background paused'; $('camera-state').classList.remove('on');
  }
});
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
