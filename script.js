// ===== UI + thresholds =====
const STEM_LABEL = "STEM Teacher";
const THRESHOLD = 0.5;
const verdictEl = document.getElementById("verdict");
const meterEl = document.getElementById("stemMeter");
const stemFill = document.getElementById("stemFill");
const stemLabel = document.getElementById("stemLabel");

// ===== Teachable Machine config =====
const TM_MODEL_BASE = "https://teachablemachine.withgoogle.com/models/2qgr_e5GJ/";
const MODEL_URL = TM_MODEL_BASE + "model.json";
const METADATA_URL = TM_MODEL_BASE + "metadata.json";

let model, maxPredictions;
let webcamOn = false;
let webcamStream = null;

// DOM refs
const videoEl = document.getElementById("webcam");
const canvasEl = document.getElementById("canvas");
const ctx = canvasEl.getContext("2d");
const predsEl = document.getElementById("predictions");
const startCamBtn = document.getElementById("startCamBtn");
const stopCamBtn = document.getElementById("stopCamBtn");

// ===== Load model with clear diagnostics =====
(async function initModel() {
  console.log("Loading TFJS & TM…", {
    MODEL_URL, METADATA_URL,
    tmImageLoaded: !!window.tmImage,
    tfLoaded: !!window.tf
  });

  // Reachability checks (spot 404/403/CORS immediately)
  const [mRes, mdRes] = await Promise.all([
    fetch(MODEL_URL, { mode: "cors" }),
    fetch(METADATA_URL, { mode: "cors" }),
  ]);
  if (!mRes.ok) throw new Error(`model.json HTTP ${mRes.status}`);
  if (!mdRes.ok) throw new Error(`metadata.json HTTP ${mdRes.status}`);

  model = await tmImage.load(MODEL_URL, METADATA_URL);
  maxPredictions = model.getTotalClasses();
  console.log("Model loaded OK. Classes:", maxPredictions);
})().catch(err => {
  alert("Failed to load model. See console for details.");
  console.error("Model load error:", err);
  console.error("MODEL_URL:", MODEL_URL);
  console.error("METADATA_URL:", METADATA_URL);
});

// =======================================================
// Camera helpers — reliably pick the FRONT (selfie) camera
// =======================================================
async function getVideoInputs() {
  // Ask for permission so device labels are populated
  let tmp;
  try {
    tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  } catch (_) { /* permission may already be granted */ }
  if (tmp) tmp.getTracks().forEach(t => t.stop());

  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(d => d.kind === "videoinput");
}

function pickFrontDevice(devices) {
  const frontRe = /(front|user|self|face)/i;
  let front = devices.find(d => frontRe.test(d.label));
  // Some browsers list front at index 1 with no label
  if (!front && devices.length > 1) front = devices[1];
  return front || devices[0];
}

async function startCamera(preferFront = true) {
  const devices = await getVideoInputs();
  if (!devices.length) throw new Error("No cameras found");

  const chosen = preferFront ? pickFrontDevice(devices) : devices[0];

  // Stop any previous stream
  if (webcamStream) webcamStream.getTracks().forEach(t => t.stop());

  // Try by exact deviceId first; fall back to facingMode if needed
  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: chosen.deviceId } }
    });
  } catch (e) {
    console.warn("deviceId exact failed, falling back to facingMode 'user'", e);
    webcamStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "user" } }
    });
  }

  videoEl.srcObject = webcamStream;
  await videoEl.play();

  webcamOn = true;
  startCamBtn.disabled = true;
  stopCamBtn.disabled = false;
  videoEl.hidden = true; // draw to canvas instead
  loopCamera();
}

// ===== Buttons =====
startCamBtn.addEventListener("click", () => startCamera(true)); // prefer front
stopCamBtn.addEventListener("click", () => {
  if (webcamStream) webcamStream.getTracks().forEach(t => t.stop());
  webcamOn = false;
  startCamBtn.disabled = false;
  stopCamBtn.disabled = true;
});

// ===== Draw + predict (mirrored for selfie) =====
async function loopCamera() {
  if (!webcamOn) return;
  const w = canvasEl.width, h = canvasEl.height;

  // Mirror horizontally so it feels like a selfie
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(videoEl, 0, 0, w, h);
  ctx.restore();

  await predictFromCanvas();
  requestAnimationFrame(loopCamera);
}

// ===== Prediction =====
async function predictFromCanvas() {
  if (!model) return;
  const prediction = await model.predict(canvasEl, false); // no extra flip; we already mirrored
  prediction.sort((a, b) => b.probability - a.probability);
  renderPreds(prediction);
}

function renderPreds(prediction) {
  // (optional hidden list for debugging)
  predsEl.innerHTML = "";
  prediction.forEach(p => {
    const li = document.createElement("li");
    li.textContent = `${p.className} ${(p.probability * 100).toFixed(1)}%`;
    predsEl.appendChild(li);
  });

  // STEM bar + verdict
  const stem = prediction.find(p => p.className.trim().toLowerCase() === STEM_LABEL.toLowerCase());
  const pct = Math.round((stem?.probability ?? 0) * 100);

  stemFill.style.width = `${pct}%`;
  stemLabel.textContent = `STEM ${pct}%`;
  meterEl.setAttribute("aria-valuenow", String(pct));

  if (stem && stem.probability >= THRESHOLD) {
    verdictEl.textContent = "You’re a STEM Educator ✅";
    verdictEl.classList.add("ok");
  } else {
    verdictEl.textContent = "";
    verdictEl.classList.remove("ok");
  }
}
