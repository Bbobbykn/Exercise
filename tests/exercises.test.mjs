// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES, RepCounter, jointAngle, trunkLean } from '../js/exercises.js';

const types = (events) => events.map((e) => e.type);

test('jointAngle measures right angles and straight lines', () => {
  assert.equal(Math.round(jointAngle({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 })), 90);
  assert.equal(Math.round(jointAngle({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 })), 180);
});

test('trunkLean is 0 upright and 45 when leaning diagonally', () => {
  assert.equal(Math.round(trunkLean({ x: 0.5, y: 0.2 }, { x: 0.5, y: 0.5 })), 0);
  assert.equal(Math.round(trunkLean({ x: 0.8, y: 0.2 }, { x: 0.5, y: 0.5 })), 45);
});

// Feeds one angle per step of `ms` milliseconds. `form` can mark frames as bad form.
const run = (counter, angles, ms = 300, form = () => true) =>
  angles.flatMap((a, i) => counter.update(a, i * ms, form(i)));
const squat = (level = 'standard') => RepCounter.forExercise(EXERCISES.squat, 110, level);
const sts = (level = 'standard') => RepCounter.forExercise(EXERCISES.sitToStand, 160, level);
// A slow, controlled squat: stand, lower, hold at the bottom, rise.
const GOOD_SQUAT = [175, 170, 150, 130, 108, 105, 105, 105, 105, 130, 150, 170, 172];

test('squat counts a slow rep that reaches depth and holds it', () => {
  const c = squat();
  const ev = run(c, GOOD_SQUAT);
  assert.deepEqual(types(ev), ['ready', 'holding', 'goal', 'returned', 'rep']);
  assert.equal(c.reps, 1);
  assert.equal(ev.at(-1).extreme, 105);
});

test('squat that is too shallow does not count', () => {
  const c = squat();
  const ev = run(c, [175, 140, 125, 120, 125, 140, 170]);
  assert.equal(c.reps, 0);
  assert.equal(ev.find((e) => e.type === 'partial').reason, 'shallow');
});

test('touching depth without holding it does not count', () => {
  const c = squat();
  const ev = run(c, [175, 150, 130, 108, 130, 150, 170, 172, 172, 172]);
  assert.equal(c.reps, 0);
  assert.equal(ev.find((e) => e.type === 'partial').reason, 'nohold');
});

test('a rushed squat does not count', () => {
  const c = squat('gentle'); // gentle: hold 300 ms, at least 1.5 s per rep
  const ev = run(c, [175, 140, 105, 105, 105, 140, 170], 150);
  assert.equal(c.reps, 0);
  assert.equal(ev.find((e) => e.type === 'partial').reason, 'fast');
});

test('leaning too far during the rep does not count', () => {
  const c = squat();
  const ev = run(c, GOOD_SQUAT, 300, (i) => i !== 6);
  assert.equal(c.reps, 0);
  assert.equal(ev.find((e) => e.type === 'partial').reason, 'form');
});

test('stepping out of view cancels the rep in progress', () => {
  const c = squat();
  run(c, [175, 150, 120]);
  c.interrupt();
  run(c, [105, 105, 105, 105, 130, 170]); // must first stand tall again
  assert.equal(c.reps, 0);
  assert.equal(c.state, 'start');
});

test('half standing is not the start position for squats', () => {
  const c = squat();
  assert.deepEqual(run(c, [150, 160, 162]), []);
  assert.equal(c.state, 'waiting');
});

test('nothing counts until the user starts in position', () => {
  const c = squat();
  assert.deepEqual(run(c, [100, 100, 130]), []);
  assert.equal(c.state, 'waiting');
});

test('strict needs a longer hold than standard', () => {
  const hold3 = [175, 150, 130, 105, 105, 105, 130, 150, 160, 170]; // ~600 ms at depth
  const std = squat(); run(std, hold3);
  const strict = squat('strict'); run(strict, hold3);
  assert.equal(std.reps, 1);
  assert.equal(strict.reps, 0);
});

test('sit to stand counts on standing tall and needs to sit before the next rep', () => {
  const c = sts();
  const up = [95, 100, 120, 140, 162, 165, 168, 168];
  run(c, [...up, 170, 168, 165], 500); // keeps standing: no double count
  assert.equal(c.reps, 1);
  const c2 = sts();
  run(c2, [...up, 168, 140, 110, 100, 120, 140, 162, 165, 168, 168], 500);
  assert.equal(c2.reps, 2);
});

test('sit to stand that does not fully stand does not count', () => {
  const c = sts();
  const ev = run(c, [95, 140, 150, 150, 130, 110]);
  assert.equal(c.reps, 0);
  assert.equal(ev.find((e) => e.type === 'partial').reason, 'shallow');
});

test('formChecks: knee green standing and at depth, red in between or too deep', async () => {
  const { formChecks } = await import('../js/exercises.js');
  const at = (deg) => {
    const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.1 }));
    const r = (deg * Math.PI) / 180;
    Object.assign(lm, {
      11: { x: 0.5, y: 0.2, visibility: 0.9 },
      23: { x: 0.5, y: 0.4, visibility: 0.9 },
      25: { x: 0.5, y: 0.6, visibility: 0.9 },
      27: { x: 0.5 + Math.sin(r) * 0.2, y: 0.6 - Math.cos(r) * 0.2, visibility: 0.9 },
    });
    return formChecks(EXERCISES.squat, lm, 1, 1, 110);
  };
  const knee = (deg) => at(deg).find((c) => c.ids.length === 3).good;
  assert.equal(knee(175), true);
  assert.equal(knee(135), false);
  assert.equal(knee(100), true);
  assert.equal(knee(50), false);
  assert.equal(at(175).find((c) => c.ids.length === 2).good, true); // upright trunk
});

test('parseVideo understands YouTube, Vimeo and video files', async () => {
  const { parseVideo } = await import('../js/video.js');
  const yt = 'https://www.youtube-nocookie.com/embed/A8_Zwr3SIac?rel=0&playsinline=1';
  assert.equal(parseVideo('https://youtu.be/A8_Zwr3SIac?si=epzRIvRS112Odsrh').src, yt);
  assert.equal(parseVideo('https://www.youtube.com/watch?v=A8_Zwr3SIac&t=10').src, yt);
  assert.equal(parseVideo('https://youtube.com/shorts/A8_Zwr3SIac').src, yt);
  assert.equal(parseVideo('https://vimeo.com/12345').src, 'https://player.vimeo.com/video/12345');
  assert.equal(parseVideo('https://example.com/squat.mp4').kind, 'file');
  assert.equal(parseVideo('javascript:alert(1)'), null);
  assert.equal(parseVideo(''), null);
});

test('isScheduled respects weekdays and start/end dates', async () => {
  const { isScheduled, ymd } = await import('../js/schedule.js');
  const mon = new Date(2026, 9, 12), tue = new Date(2026, 9, 13); // Mon 12 Oct, Tue 13 Oct 2026
  const item = { days: [1, 3, 5], startDate: '2026-10-12', endDate: '2026-10-30' };
  assert.equal(isScheduled(item, mon), true);
  assert.equal(isScheduled(item, tue), false);
  assert.equal(isScheduled({ ...item, startDate: '2026-10-19' }, mon), false);
  assert.equal(isScheduled({ ...item, endDate: '2026-10-11' }, mon), false);
  assert.equal(isScheduled({}, tue), true); // no schedule = every day
  assert.equal(ymd(mon), '2026-10-12');
});

test('custom counting rules change hold, start position, lean and depth limits', async () => {
  const { countingRules, formChecks } = await import('../js/exercises.js');
  const ex = EXERCISES.squat;
  const custom = { holdMs: 0, minRepMs: 0, startAngle: 150, moveAngle: 140, maxLean: 30, safeLimit: 90 };
  const c = RepCounter.forExercise(ex, 110, 'custom', custom);
  // Counts a quick rep with no hold, and 152° now counts as standing.
  run(c, [152, 130, 105, 130, 152], 100);
  assert.equal(c.reps, 1);
  const r = countingRules(ex, { target: 110, level: 'custom', custom });
  assert.equal(r.maxLean, 30);
  assert.equal(r.safeLimit, 90);
  // Custom values are ignored unless the level is custom.
  assert.equal(countingRules(ex, { target: 110, level: 'strict', custom }).holdMs, 1000);
  // Out-of-order values are fixed: start above target, safe limit below it.
  const bad = countingRules(ex, { target: 110, level: 'custom', custom: { startAngle: 100, safeLimit: 115 } });
  assert.ok(bad.startAngle > 110 && bad.moveAngle > 110 && bad.moveAngle < bad.startAngle);
  assert.ok(bad.safeLimit < 110);
  assert.equal(countingRules(ex, { target: 110, level: 'custom', custom: { holdMs: 99999 } }).holdMs, 5000);
  // Too deep uses the custom limit: 80° is red with safeLimit 90.
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.1 }));
  const rad = (80 * Math.PI) / 180;
  Object.assign(lm, {
    11: { x: 0.5, y: 0.2, visibility: 0.9 }, 23: { x: 0.5, y: 0.4, visibility: 0.9 }, 25: { x: 0.5, y: 0.6, visibility: 0.9 },
    27: { x: 0.5 + Math.sin(rad) * 0.2, y: 0.6 - Math.cos(rad) * 0.2, visibility: 0.9 },
  });
  assert.equal(formChecks(ex, lm, 1, 1, 110).find((k) => k.ids.length === 3).good, true);
  assert.equal(formChecks(ex, lm, 1, 1, 110, r).find((k) => k.ids.length === 3).good, false);
});

test('ages are kept between 1 and 100', async () => {
  globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  globalThis.sessionStorage ??= globalThis.localStorage;
  const { cleanAge } = await import('../js/store.js');
  assert.equal(cleanAge('5'), 5);
  assert.equal(cleanAge(1), 1);
  assert.equal(cleanAge(140), 100);
  assert.equal(cleanAge(0), null);
  assert.equal(cleanAge(''), null);
});
