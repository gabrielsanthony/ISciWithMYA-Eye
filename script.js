const STEM_LABEL = "STEM Teacher";
const THRESHOLD = 0.5;
const verdictEl = document.getElementById("verdict");
const meterEl = document.getElementById("stemMeter");
const stemFill = document.getElementById("stemFill");
const stemLabel = document.getElementById("stemLabel");

// === CONFIG ===
const TM_MODEL_BASE = "https://teachablemachine.withgoogle.com/models/2qgr_e5GJ/";
const MODEL_URL = TM_MODEL_BASE + "model.json";
const METADATA_URL = TM_MODEL_BASE + "metadata.json";

let model, maxPredictions;
let webcamOn = false;
let webcamStream = null;

const videoEl = document.getElementById("webcam");
const canvasEl = document.getElementById("canvas");
const ctx = canvasEl.getContext("2d");
const predsEl = document.getElementById("predictions");
const startCamBtn = document.getElementById("startCamBtn");
const stopCamBtn = document.getElementById("stopCamBtn");
const fileInput = document.getElementById("fileInput");

// Load model ASAP with clear diagnostics
(async function initModel() {
  console.log("Loading TFJS & TM…", {
    MODEL_URL,
    METADATA_URL,
    tmImageLoaded: !!window.tmImage,
    tfLoaded: !!window.tf
  });

  // Quick reachability checks (helps spot 404/403/CORS immediately)
  const mRes = await fetch(MODEL_URL, { mode: "cors" });
  if (!mRes.ok) throw new Error(`model.json HTTP ${mRes.status}`);
  const mdRes = await fetch(METADATA_URL, { mode: "cors" });
  if (!mdRes.ok) throw new Error(`metadata.json HTTP ${mdRes.status}`);

  // Now load via TM helper
  model = await tmImage.load(MODEL_URL, METADATA_URL);
  maxPredictions = model.getTotalClasses();
  console.log("Model loaded OK. Classes:", maxPredictions);
})().catch(err => {
  alert("Failed to load model. See console for details.");
  console.error("Model load error:", err);
  console.error("MODEL_URL:", MODEL_URL);
  console.error("METADATA_URL:", METADATA_URL);
});

// Camera flow
startCamBtn.addEventListener("click", async () => {
  try {
    // Use the selfie (front) camera
    webcamStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "user" } }   // was "environment"
    });
    videoEl.srcObject = webcamStream;
    await videoEl.play();
    webcamOn = true;
    startCamBtn.disabled = true;
    stopCamBtn.disabled = false;
    videoEl.hidden = true; // we’ll draw to canvas instead
    loopCamera();
  } catch (e) {
    alert("Camera permission denied or not available.");
    console.error(e);
  }
});

stopCamBtn.addEventListener("click", () => {
  if (webcamStream) {
    webcamStream.getTracks().forEach(t => t.stop());
  }
  webcamOn = false;
  startCamBtn.disabled = false;
  stopCamBtn.disabled = true;
});

// Draw + predict repeatedly when webcam is on
async function loopCamera() {
  if (!webcamOn) return;
  const w = canvasEl.width, h = canvasEl.height;

  // Mirror horizontally for a natural selfie view
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(videoEl, 0, 0, w, h);
  ctx.restore();

  await predictFromCanvas();
  requestAnimationFrame(loopCamera);
}

// Image upload flow
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const img = new Image();
  img.onload = async () => {
    // Fit image to canvas
    const scale = Math.min(canvasEl.width / img.width, canvasEl.height / img.height);
    const w = img.width * scale, h = img.height * scale;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.drawImage(img, (canvasEl.width - w)/2, (canvasEl.height - h)/2, w, h);
    await predictFromCanvas();
  };
  img.src = URL.createObjectURL(file);
});

// Predict using pixels from canvas
async function predictFromCanvas() {
  if (!model) return;
  const prediction = await model.predict(canvasEl, false); // no horizontal flip
  // Sort by probability desc
  prediction.sort((a, b) => b.probability - a.probability);
  renderPreds(prediction);
}

function renderPreds(prediction) {
  // (optional) keep raw scores updated in the hidden list
  predsEl.innerHTML = "";
  prediction.forEach(p => {
    const li = document.createElement("li");
    li.textContent = `${p.className} ${(p.probability * 100).toFixed(1)}%`;
    predsEl.appendChild(li);
  });

  // Find STEM class prob
  const stem = prediction.find(
    p => p.className.trim().toLowerCase() === STEM_LABEL.toLowerCase()
  );
  const pct = Math.round((stem?.probability ?? 0) * 100);

  // Update meter
  stemFill.style.width = `${pct}%`;
  stemLabel.textContent = `STEM ${pct}%`;
  meterEl.setAttribute("aria-valuenow", String(pct));

  // Verdict
  if (stem && stem.probability >= THRESHOLD) {
    verdictEl.textContent = "You’re a STEM Educator ✅";
    verdictEl.classList.add("ok");
  } else {
    verdictEl.textContent = "";
    verdictEl.classList.remove("ok");
  }
}
