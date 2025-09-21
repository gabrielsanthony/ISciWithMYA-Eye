// === CONFIG ===
const TM_MODEL_BASE = "https://teachablemachine.withgoogle.com/models/2qgr_e5GJ/";
const MODEL_URL = TM_MODEL_BASE + "model.json";
const METADATA_URL = TM_MODEL_BASE + "metadata.json";
const STEM_LABEL = "STEM Teacher";
const THRESHOLD = 0.5; // 50%
const verdictEl = document.getElementById("verdict");

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

// Load model ASAP
(async function initModel() {
  model = await tmImage.load(MODEL_URL, METADATA_URL);
  maxPredictions = model.getTotalClasses();
})().catch(err => {
  alert("Failed to load model. Check the model URL.");
  console.error(err);
});

// Camera flow
startCamBtn.addEventListener("click", async () => {
  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
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
  // Fit video into canvas
  const w = canvasEl.width, h = canvasEl.height;
  ctx.drawImage(videoEl, 0, 0, w, h);
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
  // Render the list
  predsEl.innerHTML = "";
  prediction.forEach(p => {
    const li = document.createElement("li");
    const label = document.createElement("span");
    const prob = document.createElement("strong");
    label.textContent = p.className;
    prob.textContent = (p.probability * 100).toFixed(1) + "%";
    li.appendChild(label);
    li.appendChild(prob);
    predsEl.appendChild(li);
  });

  // Verdict: show if STEM Teacher ≥ 50%
  const stem = prediction.find(
    p => p.className.trim().toLowerCase() === STEM_LABEL.toLowerCase()
  );
  if (stem && stem.probability >= THRESHOLD) {
    verdictEl.textContent = "You’re a STEM Educator ✅";
    verdictEl.classList.add("ok");
  } else {
    verdictEl.textContent = "";
    verdictEl.classList.remove("ok");
  }
}
