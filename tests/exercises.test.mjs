// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES, RepCounter, jointAngle, trunkLean } from '../js/exercises.js';

const feed = (counter, angles) => angles.flatMap((a, i) => counter.update(a, i * 100));
const types = (events) => events.map((e) => e.type);

test('jointAngle measures right angles and straight lines', () => {
  assert.equal(Math.round(jointAngle({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 })), 90);
  assert.equal(Math.round(jointAngle({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 })), 180);
});

test('trunkLean is 0 upright and 45 when leaning diagonally', () => {
  assert.equal(Math.round(trunkLean({ x: 0.5, y: 0.2 }, { x: 0.5, y: 0.5 })), 0);
  assert.equal(Math.round(trunkLean({ x: 0.8, y: 0.2 }, { x: 0.5, y: 0.5 })), 45);
});

test('squat counts a rep after going deep enough and standing back up', () => {
  const c = RepCounter.forExercise(EXERCISES.squat, 110);
  const ev = feed(c, [175, 170, 150, 130, 108, 105, 130, 165, 172]);
  assert.deepEqual(types(ev), ['ready', 'goal', 'returned', 'rep']);
  assert.equal(c.reps, 1);
  assert.equal(c.partials, 0);
  assert.equal(ev.at(-1).extreme, 105);
});

test('squat that is too shallow is a partial, not a rep', () => {
  const c = RepCounter.forExercise(EXERCISES.squat, 110);
  feed(c, [175, 140, 125, 140, 170]);
  assert.equal(c.reps, 0);
  assert.equal(c.partials, 1);
});

test('nothing counts until the user starts in position', () => {
  const c = RepCounter.forExercise(EXERCISES.squat, 110);
  assert.deepEqual(feed(c, [100, 100, 130]), []);
  assert.equal(c.state, 'waiting');
});

test('sit to stand counts on standing and needs to sit before the next rep', () => {
  const c = RepCounter.forExercise(EXERCISES.sitToStand, 160);
  feed(c, [95, 100, 140, 165, 170]);
  assert.equal(c.reps, 1);
  feed(c, [170, 168, 165]); // still standing: no double count
  assert.equal(c.reps, 1);
  feed(c, [130, 100, 145, 168]);
  assert.equal(c.reps, 2);
});

test('sit to stand that does not fully stand is a partial', () => {
  const c = RepCounter.forExercise(EXERCISES.sitToStand, 160);
  feed(c, [95, 140, 150, 110]);
  assert.equal(c.reps, 0);
  assert.equal(c.partials, 1);
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
