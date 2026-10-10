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
    startAngle: 165, // standing fully tall
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
      holding: 'Hold it there.',
      partial: 'Try to bend a little lower. That one did not count.',
      nohold: 'Hold the bottom for a moment. That one did not count.',
      form: 'Keep your chest up. That one did not count.',
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
      holding: 'Stand tall and hold.',
      partial: 'Stand up all the way. That one did not count.',
      nohold: 'Stand tall for a moment before sitting. That one did not count.',
      form: 'Stay steady. That one did not count.',
    },
  },
};

// How strict counting is, set per exercise by the practitioner.
// holdMs: how long the target position must be held.
// minRepMs: reps faster than this are not counted.
export const STRICTNESS = {
  gentle: { label: 'Gentle', holdMs: 300, minRepMs: 1500 },
  standard: { label: 'Standard', holdMs: 600, minRepMs: 2000 },
  strict: { label: 'Strict', holdMs: 1000, minRepMs: 3000 },
};
export const fastCue = 'Too fast. Go slowly, that one did not count.';

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
// The shoulder, hip, knee and ankle on that side must all be clearly
// visible, so reps are never counted from a half-seen or guessed body.
export function measure(exercise, landmarks, width, height, minVisibility = 0.65) {
  if (!landmarks) return null;
  const side = pickSide(landmarks);
  const idx = LM[side];
  if (Object.values(idx).some((i) => !landmarks[i] || (landmarks[i].visibility ?? 1) < minVisibility)) return null;
  const pts = exercise.points.map((p) => landmarks[idx[p]]);
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
// A rep only counts when the person
//   - starts from the proper start position (standing tall / seated),
//   - reaches the target angle and holds it for holdMs,
//   - keeps good form the whole way (formOk passed in each frame),
//   - takes at least minRepMs (no bouncing or rushing),
//   - stays in view (interrupt() cancels a rep in progress).
// Anything else is a partial rep with a reason:
// 'shallow' | 'nohold' | 'form' | 'fast'.
export class RepCounter {
  constructor({ direction, startAngle, moveAngle, goalAngle, countAt, holdMs = 0, minRepMs = 0 }) {
    Object.assign(this, { direction, startAngle, moveAngle, goalAngle, countAt, holdMs, minRepMs });
    this.state = 'waiting';
    this.reps = 0;
    this.partials = 0;
    this.extreme = null;
    this.repStart = 0;
    this.goalSince = null;
    this.touchedGoal = false;
    this.badForm = false;
  }

  static forExercise(exercise, target, level = 'standard') {
    const strict = STRICTNESS[level] ?? STRICTNESS.standard;
    return new RepCounter({
      direction: exercise.direction,
      startAngle: exercise.startAngle,
      moveAngle: exercise.moveAngle,
      goalAngle: target ?? exercise.defaultTarget,
      countAt: exercise.countAt,
      holdMs: strict.holdMs,
      minRepMs: strict.minRepMs,
    });
  }

  // The person left the frame or tracking was lost: drop any rep in
  // progress and wait for them to get back into the start position.
  interrupt() {
    if (this.state === 'moving' || this.state === 'goal') this.state = 'waiting';
  }

  update(a, now = Date.now(), formOk = true) {
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
      this.goalSince = null;
      this.touchedGoal = false;
      this.badForm = false;
    }
    if (this.state === 'moving' || this.state === 'goal') {
      this.extreme = d < 0 ? Math.min(this.extreme, a) : Math.max(this.extreme, a);
      if (!formOk) this.badForm = true;
    }
    if (this.state === 'moving') {
      if (atGoal) {
        if (this.goalSince == null) {
          this.goalSince = now;
          this.touchedGoal = true;
          if (this.holdMs > 0) events.push({ type: 'holding' });
        }
        if (now - this.goalSince >= this.holdMs) {
          this.state = 'goal';
          events.push({ type: 'goal' });
          if (this.countAt === 'goal') events.push(this.#finish(now));
        }
      } else {
        this.goalSince = null;
        if (atStart) {
          this.state = 'start';
          events.push(this.#partial(this.touchedGoal ? 'nohold' : 'shallow'));
        }
      }
    } else if (this.state === 'goal' && atStart) {
      this.state = 'start';
      events.push({ type: 'returned' });
      if (this.countAt === 'return') events.push(this.#finish(now));
    }
    return events;
  }

  #partial(reason) {
    this.partials++;
    return { type: 'partial', reason, extreme: this.extreme };
  }

  #finish(now) {
    const duration = now - this.repStart;
    if (this.badForm) return this.#partial('form');
    // Counting on reaching the goal only times the way up, so allow half.
    const minMs = this.countAt === 'goal' ? this.minRepMs / 2 : this.minRepMs;
    if (duration < minMs) return this.#partial('fast');
    this.reps++;
    return { type: 'rep', count: this.reps, extreme: this.extreme, duration };
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
