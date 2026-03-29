/**
 * poseWorker.ts
 * Web Worker: runs angle computation + skeletal sense off the main thread.
 * Main thread posts: { landmarks, exercise }
 * Worker posts back: { angles, detectedExercise, confidence }
 *
 * NOTE: Workers cannot import browser APIs or DOM services.
 * All logic here is pure math — no imports from services that touch the DOM.
 */

// ─── Inline angle math (mirror of angleUtils — no DOM imports allowed in worker) ─
function calculateAngle(
  a: { x: number; y: number; z?: number },
  b: { x: number; y: number; z?: number },
  c: { x: number; y: number; z?: number }
): number {
  if (!a || !b || !c) return 0;
  const radians =
    Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) angle = 360.0 - angle;
  return Math.round(angle);
}

function getBestSide(landmarks: any[]): 'left' | 'right' {
  const leftIndices  = [11, 13, 15, 23, 25, 27];
  const rightIndices = [12, 14, 16, 24, 26, 28];
  const leftVis  = leftIndices.reduce((s, i) => s + (landmarks[i]?.visibility || 0), 0) / 6;
  const rightVis = rightIndices.reduce((s, i) => s + (landmarks[i]?.visibility || 0), 0) / 6;
  return leftVis >= rightVis ? 'left' : 'right';
}

function computeAngles(landmarks: any[]): Record<string, number> {
  if (!landmarks || landmarks.length < 29) return {};
  const side = getBestSide(landmarks);
  const ids = side === 'left'
    ? { s: 11, e: 13, w: 15, h: 23, k: 25, a: 27 }
    : { s: 12, e: 14, w: 16, h: 24, k: 26, a: 28 };

  const shoulder = landmarks[ids.s];
  const hip = landmarks[ids.h];
  const ankle = landmarks[ids.a];
  const totalHeight = Math.abs((ankle?.y || 0) - (shoulder?.y || 0)) || 1;

  return {
    knee:      calculateAngle(landmarks[ids.h], landmarks[ids.k], landmarks[ids.a]),
    elbow:     calculateAngle(landmarks[ids.s], landmarks[ids.e], landmarks[ids.w]),
    shoulder:  calculateAngle(landmarks[ids.e], landmarks[ids.s], landmarks[ids.h]),
    bodyLine:  calculateAngle(landmarks[ids.s], landmarks[ids.h], landmarks[ids.a]),
    hipDepth:  Math.round(((ankle?.y || 0) - (hip?.y || 0)) / totalHeight * 100),
  };
}

// ─── Lightweight exercise detection (geometry-based, no ML) ───────────────────
function detectExercise(landmarks: any[], angles: Record<string, number>): {
  label: string;
  confidence: number;
} {
  if (!landmarks || landmarks.length < 29) return { label: 'unknown', confidence: 0 };

  const { knee, elbow, shoulder, hipDepth } = angles;

  // Squat: knees bent, hips low
  if (knee < 140 && hipDepth < 60) return { label: 'squat', confidence: 0.9 };

  // Bicep curl: elbow very bent, shoulder near neutral
  if (elbow < 80 && shoulder < 30) return { label: 'bicepCurl', confidence: 0.85 };

  // Pushup/Plank: horizontal body (shoulders and hips roughly same height)
  const lShoulder = landmarks[11];
  const lHip = landmarks[23];
  const lAnkle = landmarks[27];
  if (lShoulder && lHip && lAnkle) {
    const horizontalStretch = Math.abs(lAnkle.x - lShoulder.x);
    const verticalCompact = Math.abs(lAnkle.y - lShoulder.y);
    if (horizontalStretch > verticalCompact * 0.8) {
      if (elbow < 120) return { label: 'pushup', confidence: 0.85 };
      return { label: 'plank', confidence: 0.8 };
    }
  }

  // Jumping Jack: arms raised (shoulder angle wide)
  if (shoulder > 60) return { label: 'jumpingJack', confidence: 0.75 };

  return { label: 'unknown', confidence: 0.4 };
}

// ─── Message handler ──────────────────────────────────────────────────────────
self.onmessage = (event: MessageEvent) => {
  const { landmarks, exercise: _exercise, frameId } = event.data;

  if (!landmarks || landmarks.length === 0) {
    self.postMessage({ frameId, angles: {}, detectedExercise: 'unknown', confidence: 0 });
    return;
  }

  const angles = computeAngles(landmarks);
  const { label: detectedExercise, confidence } = detectExercise(landmarks, angles);

  // Minimal payload — no deep copies, no metadata overhead
  self.postMessage({ frameId, angles, detectedExercise, confidence });
};
