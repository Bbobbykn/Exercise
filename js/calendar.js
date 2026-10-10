// Month calendar of workouts, planned exercises and check-ups.
// Filled day: finished workout. Outlined: stopped early. Small dot: exercises
// planned (today onwards). Purple ring: check-up. Tap a day for details.
import { exerciseName } from './exercises.js?v=20261010b';
import { itemsOn, ymd } from './schedule.js?v=20261010b';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function mountCalendar(el, sessions, { appointments = [], program = [] } = {}) {
  const byDay = new Map();
  for (const s of sessions) {
    const k = ymd(new Date(s.date));
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(s);
  }
  const apptsOn = (k) => appointments.filter((a) => a.date === k);
  const today = new Date();
  const todayKey = ymd(today);
  let month = new Date(today.getFullYear(), today.getMonth(), 1);
  let selected = todayKey;

  const render = () => {
    const y = month.getFullYear(), m = month.getMonth();
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const weekdays = [...Array(7)].map((_, i) =>
      new Date(2024, 0, 7 + i).toLocaleDateString(undefined, { weekday: 'narrow' }));
    let active = 0, done = 0;
    let cells = '<span></span>'.repeat(first);
    for (let d = 1; d <= days; d++) {
      const date = new Date(y, m, d), k = ymd(date);
      const list = byDay.get(k) ?? [];
      const complete = list.some((s) => s.completed);
      const planned = k >= todayKey ? itemsOn(program, date).length : 0;
      const appts = apptsOn(k);
      if (list.length) active++;
      if (complete) done++;
      const cls = [
        complete ? 'done' : list.length ? 'some' : '',
        planned && !complete ? 'planned' : '',
        appts.length ? 'appt' : '',
        k === todayKey ? 'today' : '',
        k === selected ? 'sel' : '',
      ].filter(Boolean).join(' ');
      const bits = [
        list.length && `${list.length} workout${list.length > 1 ? 's' : ''}`,
        planned && `${planned} planned`,
        appts.length && 'check-up',
      ].filter(Boolean).join(', ');
      const label = date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) + (bits ? `, ${bits}` : '');
      cells += `<button class="cal-day ${cls}" data-k="${k}" aria-label="${esc(label)}">${d}</button>`;
    }

    const selDate = new Date(selected + 'T00:00');
    const daySessions = (byDay.get(selected) ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
    const dayPlan = selected >= todayKey ? itemsOn(program, selDate) : [];
    const dayAppts = apptsOn(selected);
    const rows = [
      ...dayAppts.map((a) => `<li class="appt-li"><span><b>Check-up${a.time ? ' · ' + esc(a.time) : ''}</b>
        <small>${esc([a.place, a.note].filter(Boolean).join(' · ') || 'With your practitioner')}</small></span></li>`),
      ...daySessions.map((s) => `
        <li><span><b>${esc(exerciseName(s.exerciseId))}</b>
          <small>${new Date(s.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          · ${Math.max(1, Math.round(s.durationSec / 60))} min</small></span>
          <span class="cal-right">${s.reps}/${s.targetSets * s.targetReps} reps
          <small>${s.bestAngle != null ? 'best ' + Math.round(s.bestAngle) + '°' : ''}${s.completed ? '' : ' · stopped'}</small></span></li>`),
      ...dayPlan.filter((it) => !daySessions.some((s) => s.programItemId === it.id && s.completed)).map((it) => `
        <li class="plan-li"><span><b>${esc(exerciseName(it.exerciseId))}</b><small>Planned</small></span>
          <span class="cal-right">${it.sets} × ${it.reps}</span></li>`),
    ];
    const detail = `<h3>${selDate.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
      ${rows.length ? `<ul class="cal-list">${rows.join('')}</ul>` : '<p class="hint">Nothing on this day.</p>'}`;

    el.innerHTML = `
      <div class="cal-head">
        <button class="round" data-nav="-1" aria-label="Previous month">‹</button>
        <strong>${month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
        <button class="round" data-nav="1" aria-label="Next month">›</button>
      </div>
      <p class="cal-sum">${done} day${done === 1 ? '' : 's'} completed${active > done ? `, ${active - done} partly done` : ''}</p>
      <div class="cal-grid">${weekdays.map((w) => `<span class="cal-wd">${w}</span>`).join('')}${cells}</div>
      <div class="cal-legend">
        <span><i class="done"></i>Finished</span><span><i class="some"></i>Stopped early</span>
        <span><i class="planned"></i>Planned</span><span><i class="appt"></i>Check-up</span>
      </div>
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
