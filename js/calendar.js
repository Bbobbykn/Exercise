// Month calendar of workouts. Days with a finished workout are filled,
// days with only a stopped workout are outlined. Tap a day for details.
import { exerciseName } from './exercises.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export function mountCalendar(el, sessions) {
  const byDay = new Map();
  for (const s of sessions) {
    const k = dayKey(new Date(s.date));
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(s);
  }
  const today = new Date();
  let month = new Date(today.getFullYear(), today.getMonth(), 1);
  let selected = byDay.has(dayKey(today)) ? dayKey(today) : null;

  const render = () => {
    const y = month.getFullYear(), m = month.getMonth();
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const weekdays = [...Array(7)].map((_, i) =>
      new Date(2024, 0, 7 + i).toLocaleDateString(undefined, { weekday: 'narrow' }));
    let active = 0, done = 0;
    let cells = '<span></span>'.repeat(first);
    for (let d = 1; d <= days; d++) {
      const date = new Date(y, m, d), k = dayKey(date);
      const list = byDay.get(k) ?? [];
      const complete = list.some((s) => s.completed);
      if (list.length) active++;
      if (complete) done++;
      const cls = [complete ? 'done' : list.length ? 'some' : '', k === dayKey(today) ? 'today' : '', k === selected ? 'sel' : '']
        .filter(Boolean).join(' ');
      const label = date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) +
        (list.length ? `, ${list.length} workout${list.length > 1 ? 's' : ''}` : '');
      cells += `<button class="cal-day ${cls}" data-k="${k}" aria-label="${esc(label)}" ${list.length ? '' : 'disabled'}>${d}</button>`;
    }
    const daySessions = selected ? byDay.get(selected) ?? [] : [];
    const detail = daySessions.length
      ? `<h3>${new Date(daySessions[0].date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
         <ul class="cal-list">${daySessions.slice().sort((a, b) => a.date.localeCompare(b.date)).map((s) => `
           <li><span><b>${esc(exerciseName(s.exerciseId))}</b>
             <small>${new Date(s.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
             · ${Math.max(1, Math.round(s.durationSec / 60))} min</small></span>
             <span class="cal-right">${s.reps}/${s.targetSets * s.targetReps} reps
             <small>${s.bestAngle != null ? 'best ' + Math.round(s.bestAngle) + '°' : ''}${s.completed ? '' : ' · stopped'}</small></span></li>`).join('')}
         </ul>`
      : '<p class="hint">Tap a highlighted day to see that workout.</p>';

    el.innerHTML = `
      <div class="cal-head">
        <button class="round" data-nav="-1" aria-label="Previous month">‹</button>
        <strong>${month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
        <button class="round" data-nav="1" aria-label="Next month">›</button>
      </div>
      <p class="cal-sum">${done} day${done === 1 ? '' : 's'} completed${active > done ? `, ${active - done} partly done` : ''}</p>
      <div class="cal-grid">${weekdays.map((w) => `<span class="cal-wd">${w}</span>`).join('')}${cells}</div>
      <div class="cal-legend"><span><i class="done"></i>Finished</span><span><i class="some"></i>Stopped early</span></div>
      <div class="cal-detail">${detail}</div>`;

    el.querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => {
      month = new Date(y, m + Number(b.dataset.nav), 1);
      render();
    }));
    el.querySelectorAll('.cal-day[data-k]').forEach((b) => (b.onclick = () => {
      selected = b.dataset.k;
      render();
    }));
  };
  render();
}
