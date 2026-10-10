// Camera access and in-browser pose detection with MediaPipe Pose Landmarker.
// Video never leaves the phone: the model runs locally in the browser.

const MP_VERSION = '0.10.14';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

let landmarkerPromise = null;

export function loadPoseModel() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import(`${MP_BASE}/vision_bundle.mjs`);
      const fileset = await FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
      const options = (delegate) => ({
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
      try {
        return await PoseLandmarker.createFromOptions(fileset, options('GPU'));
      } catch {
        return await PoseLandmarker.createFromOptions(fileset, options('CPU'));
      }
    })();
    landmarkerPromise.catch(() => (landmarkerPromise = null));
  }
  return landmarkerPromise;
}

export async function startCamera(video, facingMode = 'user') {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser cannot use the camera. Open the app over https in Chrome or Safari.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
  });
  video.srcObject = stream;
  video.muted = true;
  video.setAttribute('playsinline', '');
  await video.play();
  if (!video.videoWidth) await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));
  return stream;
}

export function stopCamera(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}

// Runs detection on each new video frame and hands landmarks to onFrame.
export function runDetection(landmarker, video, onFrame) {
  let running = true;
  let lastTime = -1;
  const loop = () => {
    if (!running) return;
    if (video.readyState >= 2 && video.currentTime !== lastTime) {
      lastTime = video.currentTime;
      const result = landmarker.detectForVideo(video, performance.now());
      onFrame(result.landmarks?.[0] ?? null);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return () => (running = false);
}

const BONES = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 31], [28, 32], [27, 29], [28, 30], [29, 31], [30, 32],
];

// Draws the skeleton. Body parts the exercise checks are drawn thicker in
// green (proper position) or red (outside the proper range); the rest is white.
// checks: [{ ids: [landmark indices], good }] from formChecks.
// mirrored: flip x to match a mirrored selfie preview.
export const GOOD = '#22c55e';
export const BAD = '#ef4444';

export function drawPose(canvas, landmarks, { checks = [], mirrored }) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!landmarks) return;
  const px = (p) => [(mirrored ? 1 - p.x : p.x) * w, p.y * h];
  const scale = Math.max(w, h) / 640;
  const visible = (p) => (p.visibility ?? 1) >= 0.4;
  const line = (a, b) => {
    ctx.beginPath();
    ctx.moveTo(...px(a));
    ctx.lineTo(...px(b));
    ctx.stroke();
  };
  const dot = (p, r) => {
    ctx.beginPath();
    ctx.arc(...px(p), r, 0, Math.PI * 2);
    ctx.fill();
  };

  ctx.lineCap = 'round';
  ctx.lineWidth = 4 * scale;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.fillStyle = '#ffffff';
  for (const [a, b] of BONES) {
    if (visible(landmarks[a]) && visible(landmarks[b])) line(landmarks[a], landmarks[b]);
  }
  for (const i of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
    if (visible(landmarks[i])) dot(landmarks[i], 4 * scale);
  }

  for (const { ids, good } of checks) {
    const color = good ? GOOD : BAD;
    const pts = ids.map((i) => landmarks[i]);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 9 * scale;
    for (let k = 1; k < pts.length; k++) line(pts[k - 1], pts[k]);
    // A ring on the joint itself (the middle point of a three-point check).
    if (pts.length === 3) {
      dot(pts[1], 13 * scale);
      ctx.fillStyle = '#ffffff';
      dot(pts[1], 5 * scale);
    }
  }
}
