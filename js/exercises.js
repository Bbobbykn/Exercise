// Exercise definitions, joint-angle maths and the rep counter.
// Pure logic with no DOM access, so it can be unit tested in Node.

// MediaPipe Pose landmark indices.
export const LM = {
  left: { shoulder: 11, hip: 23, knee: 25, ankle: 27 },
  right: { shoulder: 12, hip: 24, knee: 26, ankle: 28 },
};

export const EXERCISES = {
  squat: {
    id: 'squat',
    name: 'Squats',
    // Knee angle: hip - knee - ankle. ~175° standing, smaller as you bend.
    points: ['hip', 'knee', 'ankle'],
    jointLabel: 'Knee angle',
    direction: -1, // the angle gets smaller toward the goal
    startAngle: 160, // standing tall
    moveAngle: 145, // clearly started bending
    defaultTarget: 110, // practitioner can set 80-130°
    targetRange: [80, 130],
    countAt: 'return', // a rep counts once you are back up
    checkTrunk: true,
    safeLimit: 60, // deeper than this is too deep for most older adults
    setup: [
      'Place a sturdy chair or counter next to you for support.',
      'Prop the phone up about 2-3 metres away, sideways on to you.',
      'Make sure your whole body, head to feet, is on screen.',
    ],
    cues: {
      ready: 'Good. Now slowly bend your knees.',
      waiting: 'Stand up tall to begin.',
      goal: 'Good depth. Now push back up.',
      partial: 'Try to bend a little lower.',
    },
  },
  sitToStand: {
    id: 'sitToStand',
    name: 'Sit to stand',
    // Hip angle: shoulder - hip - knee. ~90-110° seated, ~170° standing.
    points: ['shoulder', 'hip', 'knee'],
    jointLabel: 'Hip angle',
    direction: 1, // the angle gets bigger toward the goal
    startAngle: 120, // seated
    moveAngle: 135, // clearly started rising
    defaultTarget: 160, // practitioner can set 140-175°
    targetRange: [140, 175],
    countAt: 'goal', // a rep counts when you are fully standing
    checkTrunk: false,
    setup: [
      'Use a sturdy chair without wheels, pushed against a wall.',
      'Prop the phone up about 2-3 metres away, sideways on to you.',
      'Make sure your whole body and the chair are on screen.',
    ],
    cues: {
      ready: 'Good. Now stand up.',
      waiting: 'Sit down on the chair to begin.',
      goal: null,
      partial: 'Try to stand up all the way.',
    },
  },
};

export function exerciseName(id) {
  return EXERCISES[id]?.name ?? id;
}

// Angle at b (degrees) formed by a-b-c. Landmarks are normalised 0-1, so
// scale by the frame size to avoid distortion on non-square video.
export function jointAngle(a, b, c, width = 1, height = 1) {
  const abx = (a.x - b.x) * width, aby = (a.y - b.y) * height;
  const cbx = (c.x - b.x) * width, cby = (c.y - b.y) * height;
  const dot = abx * cbx + aby * cby;
  const mag = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if (!mag) return NaN;
  const cos = Math.min(1, Math.max(-1, dot / mag));
  return (Math.acos(cos) * 180) / Math.PI;
}

// How far the torso leans from vertical (degrees), 0 = upright.
export function trunkLean(shoulder, hip, width = 1, height = 1) {
  const dx = (shoulder.x - hip.x) * width;
  const dy = (shoulder.y - hip.y) * height;
  return (Math.atan2(Math.abs(dx), -dy) * 180) / Math.PI;
}

// Pick the body side the camera sees best.
export function pickSide(landmarks) {
  const vis = (side) =>
    Object.values(LM[side]).reduce((s, i) => s + (landmarks[i]?.visibility ?? 0), 0);
  return vis('left') >= vis('right') ? 'left' : 'right';
}

// Reads the exercise's joint angle from one frame of landmarks.
// Returns null when the needed joints are not clearly visible.
export function measure(exercise, landmarks, width, height, minVisibility = 0.5) {
  if (!landmarks) return null;
  const side = pickSide(landmarks);
  const idx = LM[side];
  const pts = exercise.points.map((p) => landmarks[idx[p]]);
  if (pts.some((p) => !p || (p.visibility ?? 1) < minVisibility)) return null;
  const angle = jointAngle(pts[0], pts[1], pts[2], width, height);
  if (Number.isNaN(angle)) return null;
  const lean = trunkLean(landmarks[idx.shoulder], landmarks[idx.hip], width, height);
  return { side, angle, lean, joint: pts[1], index: idx[exercise.points[1]], points: pts };
}

// Exponential smoothing to calm jittery pose estimates.
export class Smoother {
  constructor(alpha = 0.4) {
    this.alpha = alpha;
    this.value = null;
  }
  next(v) {
    this.value = this.value == null ? v : this.alpha * v + (1 - this.alpha) * this.value;
    return this.value;
  }
  reset() {
    this.value = null;
  }
}

// State machine: waiting -> start -> moving -> goal -> start ...
// A partial rep is when you leave the start position but come back
// without reaching the goal angle.
export class RepCounter {
  constructor({ direction, startAngle, moveAngle, goalAngle, countAt }) {
    Object.assign(this, { direction, startAngle, moveAngle, goalAngle, countAt });
    this.state = 'waiting';
    this.reps = 0;
    this.partials = 0;
    this.extreme = null;
    this.repStart = 0;
  }

  static forExercise(exercise, target) {
    return new RepCounter({
      direction: exercise.direction,
      startAngle: exercise.startAngle,
      moveAngle: exercise.moveAngle,
      goalAngle: target ?? exercise.defaultTarget,
      countAt: exercise.countAt,
    });
  }

  update(a, now = Date.now()) {
    const d = this.direction;
    const atStart = d < 0 ? a >= this.startAngle : a <= this.startAngle;
    const left = d < 0 ? a < this.moveAngle : a > this.moveAngle;
    const atGoal = d < 0 ? a <= this.goalAngle : a >= this.goalAngle;
    const events = [];

    if (this.state === 'waiting') {
      if (atStart) {
        this.state = 'start';
        events.push({ type: 'ready' });
      }
      return events;
    }
    if (this.state === 'start' && (left || atGoal)) {
      this.state = 'moving';
      this.repStart = now;
      this.extreme = a;
    }
    if (this.state === 'moving' || this.state === 'goal') {
      this.extreme = d < 0 ? Math.min(this.extreme, a) : Math.max(this.extreme, a);
    }
    if (this.state === 'moving') {
      if (atGoal) {
        this.state = 'goal';
        events.push({ type: 'goal' });
        if (this.countAt === 'goal') events.push(this.#rep(now));
      } else if (atStart) {
        this.state = 'start';
        this.partials++;
        events.push({ type: 'partial', extreme: this.extreme });
      }
    } else if (this.state === 'goal' && atStart) {
      this.state = 'start';
      events.push({ type: 'returned' });
      if (this.countAt === 'return') events.push(this.#rep(now));
    }
    return events;
  }

  #rep(now) {
    this.reps++;
    return { type: 'rep', count: this.reps, extreme: this.extreme, duration: now - this.repStart };
  }
}

// Green/red colouring for the camera view. A counted joint is "good" when it
// is in a proper position: the start position (standing tall / seated) or at
// the practitioner's target. In between, or past the safe limit, it is red.
// Squats also check the trunk is not leaning too far forward.
export const MAX_TRUNK_LEAN = 50;

export function formChecks(exercise, landmarks, width, height, target, minVisibility = 0.5) {
  if (!landmarks) return [];
  const goal = target ?? exercise.defaultTarget;
  const d = exercise.direction;
  const checks = [];
  for (const side of ['left', 'right']) {
    const idx = LM[side];
    const ids = exercise.points.map((p) => idx[p]);
    const pts = ids.map((i) => landmarks[i]);
    if (pts.some((p) => !p || (p.visibility ?? 1) < minVisibility)) continue;
    const a = jointAngle(pts[0], pts[1], pts[2], width, height);
    if (Number.isNaN(a)) continue;
    const atStart = d < 0 ? a >= exercise.startAngle : a <= exercise.startAngle;
    const atGoal = d < 0 ? a <= goal : a >= goal;
    const tooFar = exercise.safeLimit != null && (d < 0 ? a < exercise.safeLimit : a > exercise.safeLimit);
    checks.push({ ids, good: (atStart || atGoal) && !tooFar });

    if (exercise.checkTrunk) {
      const sh = landmarks[idx.shoulder], hip = landmarks[idx.hip];
      if ((sh.visibility ?? 1) >= minVisibility) {
        checks.push({ ids: [idx.shoulder, idx.hip], good: trunkLean(sh, hip, width, height) <= MAX_TRUNK_LEAN });
      }
    }
  }
  return checks;
}
