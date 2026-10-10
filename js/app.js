import { EXERCISES, exerciseName, measure, formChecks, STRICTNESS, customFields, countingRules, fastCue, Smoother, RepCounter } from './exercises.js';
import { mountCalendar } from './calendar.js';
import { parseVideo, videoEmbed } from './video.js';
import { ALL_DAYS, ymd, addDays, isScheduled, itemsOn, scheduleText } from './schedule.js';
import { store, cleanAge } from './store.js';
import { Voice } from './voice.js';
import { loadPoseModel, startCamera, stopCamera, runDetection, drawPose } from './pose.js';

const app = document.getElementById('app');
const voice = new Voice();
const REST_SECONDS = 30;
let cleanup = null; // teardown for the screen currently shown

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const $ = (sel) => app.querySelector(sel);
const $$ = (sel) => [...app.querySelectorAll(sel)];

function show(html, after) {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  app.innerHTML = html;
  window.scrollTo(0, 0);
  after?.();
}

// ---------- visual helpers ----------

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  chart: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  note: '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2 .6 3.2 2.2 3.8 5"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
};
const icon = (name, size = 24) =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

// Simple drawings of each exercise, used on cards and the exercise page.
const FIGURES = {
  squat: `<circle cx="62" cy="22" r="11"/><path d="M60 34 50 72M57 44l34 8M50 72l32 12M82 84l-7 34h14"/>`,
  sitToStand: `<path d="M14 82h38M18 82V40M20 82v36M48 82v36" opacity=".55"/><circle cx="76" cy="20" r="11"/><path d="M76 32l-2 40M75 44l18 16M74 72l4 24-2 24h12"/>`,
};
const figure = (id, cls = '') =>
  `<svg class="figure ${cls}" viewBox="0 0 110 130" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${FIGURES[id] ?? ''}</svg>`;

const PASTELS = ['orange', 'blue', 'green', 'pink', 'cyan', 'purple'];
const tint = (i) => PASTELS[i % PASTELS.length];

const initials = (n) =>
  String(n ?? '').replace(/\(.*?\)/g, '').trim().split(/\s+/).map((w) => w[0] ?? '').slice(0, 2).join('').toUpperCase() || '?';
const hue = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const avatar = (name, cls = '') =>
  `<span class="avatar ${cls}" style="--h:${hue(name)}" aria-hidden="true">${esc(initials(name))}</span>`;
// A person's photo if they have one, otherwise their initials.
const avatarOf = (person, cls = '') =>
  person?.photo
    ? `<img class="avatar photo ${cls}" src="${esc(person.photo)}" alt="">`
    : avatar(person?.name ?? '?', cls);

// Shrinks a chosen photo to a 256px square JPEG so it fits in local storage.
function photoFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 256, side = Math.min(img.width, img.height);
      const c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => reject(new Error('That file is not a picture.'));
    img.src = URL.createObjectURL(file);
  });
}

const firstName = (n) => String(n).replace(/\s*\(demo\)$/, '').split(' ')[0];

// Dark pill tab bar at the bottom of the screen.
function tabbar(items, active) {
  return `<nav class="tabbar" aria-label="Main">${items.map((i) =>
    `<button data-tab="${i.id}" class="${i.id === active ? 'on' : ''}" aria-label="${i.label}" ${i.id === active ? 'aria-current="page"' : ''}>${icon(i.icon)}</button>`).join('')}</nav>`;
}
const bindTabs = (go) => $$('.tabbar [data-tab]').forEach((b) => (b.onclick = () => go(b.dataset.tab)));

const tile = (label, value, color) =>
  `<div class="tile ${color}"><small>${label}</small><b>${value}</b></div>`;
const listRow = (ic, title, sub, attrs = '') =>
  `<${attrs ? 'button' : 'div'} class="list-row" ${attrs}>${icon(ic)}<span><b>${title}</b><small>${sub}</small></span>${attrs ? icon('right', 20) : ''}</${attrs ? 'button' : 'div'}>`;

// ---------- data helpers ----------

const DAY = 86400000;
const isToday = (iso) => new Date(iso).toDateString() === new Date().toDateString();
const todayLabel = () => 'Today ' + new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
function fmtDate(iso) {
  const d = new Date(iso);
  return isToday(iso) ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
function ago(iso) {
  if (!iso) return 'Never';
  if (isToday(iso)) return 'Today';
  const days = Math.max(1, Math.round((Date.now() - new Date(iso)) / DAY));
  return days <= 1 ? 'Yesterday' : `${days} days ago`;
}
const dayName = (d, long = false) => new Date(d).toLocaleDateString(undefined, { weekday: long ? 'long' : 'short' });
const apptDate = (a) => new Date(`${a.date}T${a.time || '00:00'}`);
const fmtAppt = (a) =>
  `${apptDate(a).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}${a.time ? ' · ' + apptDate(a).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : ''}`;
const upcoming = (appts) => appts.filter((a) => a.date >= ymd());
const WEEKDAY_LETTERS = ALL_DAYS.map((d) => new Date(2024, 0, 7 + d).toLocaleDateString(undefined, { weekday: 'narrow' }));
// Custom counting: one number field per rule (see customFields in exercises.js).
const rulesToCustom = (ex, item) => {
  const r = countingRules(ex, item);
  return Object.fromEntries(customFields(ex).map((f) => [f.key, r[f.key]]));
};
const customEditor = (ex, item) => {
  const r = countingRules(ex, item);
  return `<fieldset class="custom-rules"><legend>Custom counting rules</legend>
    <div class="grid2">${customFields(ex).map((f) => `
      <label>${f.label} (${f.unit})
        <input type="number" inputmode="decimal" data-c="${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" value="${r[f.key] / (f.scale ?? 1)}"></label>`).join('')}
    </div>
    <small class="hint">${ex.direction < 0
      ? 'Order is kept: standing angle above "rep starts", above the target, above "too deep".'
      : 'Order is kept: seated angle below "rep starts", below the target.'}</small>
  </fieldset>`;
};

const targetText = (ex, target) => (ex.direction < 0 ? `Knees to ${target}°` : `Stand to ${target}°`);
const minutes = (sec) => `${Math.max(1, Math.round(sec / 60))} min`;

function userStats(userId) {
  const sessions = store.sessionsOf(userId);
  const program = store.user(userId)?.program ?? [];
  // Last 7 days (oldest first): did they finish anything that day?
  const now = new Date();
  const days = [...Array(7)].map((_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + i));
  const doneKeys = new Set(sessions.filter((x) => x.completed).map((x) => `${new Date(x.date).toDateString()}|${x.programItemId}`));
  const doneDays = new Set(sessions.filter((x) => x.completed).map((x) => new Date(x.date).toDateString()));
  // Plan %: of the exercises scheduled in the last 7 days, how many were finished that day.
  const planned = days.reduce((n, d) => n + itemsOn(program, d).length, 0);
  const planDone = days.reduce((n, d) => n + itemsOn(program, d).filter((it) => doneKeys.has(`${d.toDateString()}|${it.id}`)).length, 0);
  const week = sessions.filter((s) => Date.now() - new Date(s.date) < 7 * DAY);
  const reps = week.reduce((n, s) => n + s.reps, 0);
  const partials = week.reduce((n, s) => n + s.partials, 0);
  const squats = sessions.filter((s) => s.exerciseId === 'squat' && s.bestAngle != null);
  return {
    sessions,
    last: sessions[0]?.date ?? null,
    weekSessions: week.length,
    weekCompleted: week.filter((s) => s.completed).length,
    weekReps: reps,
    quality: reps + partials ? Math.round((reps / (reps + partials)) * 100) : null,
    bestSquat: squats.length ? Math.round(Math.min(...squats.map((s) => s.bestAngle))) : null,
    last7: days.map((d) => ({ date: d, done: doneDays.has(d.toDateString()) })),
    planPct: planned ? Math.round((planDone / planned) * 100) : null,
  };
}

// Sun-Sat chips for this week: a filled dot marks a finished workout,
// a hollow dot a day with exercises planned.
function weekStrip(sessions, program = []) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const doneDays = new Set(sessions.filter((s) => s.completed).map((s) => new Date(s.date).toDateString()));
  return `<div class="week">${[...Array(7)].map((_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const today = d.toDateString() === now.toDateString();
    const dot = doneDays.has(d.toDateString()) ? 'on' : itemsOn(program, d).length ? 'planned' : '';
    return `<div class="day ${today ? 'today' : ''}"><i class="${dot}"></i>
      <small>${d.toLocaleDateString(undefined, { weekday: 'short' })}</small><b>${d.getDate()}</b></div>`;
  }).join('')}</div>`;
}

// ---------- sign in ----------

function roleScreen() {
  store.current = null;
  show(`
    <section class="hero purple welcome">
      <div class="blobs" aria-hidden="true"><i></i><i></i><i></i></div>
      <h1>MoveWell</h1>
      <p>Guided exercise with your phone camera. It counts your reps and coaches you out loud.</p>
    </section>
    <h2 class="section-title">Who is using the app?</h2>
    <div class="grid2">
      <button class="card orange tall choice" data-role="user">
        <span class="pill">Exercise</span>
        <strong>I'm exercising</strong>
        <small>Follow the plan from your practitioner</small>
        ${figure('squat', 'card-figure')}
      </button>
      <button class="card blue tall choice" data-role="pro">
        <span class="pill">Practitioner</span>
        <strong>I'm a health practitioner</strong>
        <small>Add users, assign plans, track progress</small>
        <span class="card-figure big-ic">${icon('users', 64)}</span>
      </button>
    </div>
  `, () => {
    $('[data-role=user]').onclick = userLogin;
    $('[data-role=pro]').onclick = () => proLogin(false);
  });
}

function backHeader(title, onBack, right = '') {
  return `<header class="bar">
    <button class="round" id="back" aria-label="Back">${icon('left')}</button>
    <h1>${title}</h1>${right || '<span class="round-spacer"></span>'}</header>`;
}

function userLogin() {
  show(`
    ${backHeader('Welcome')}
    <section class="hero orange small">
      <h2>Enter your code</h2>
      <p>Type the 4-digit code your practitioner gave you.</p>
    </section>
    <form id="f" class="stack">
      <input id="code" class="code-input" inputmode="numeric" pattern="[0-9]*" maxlength="4"
             autocomplete="one-time-code" aria-label="Your 4-digit code" placeholder="••••" required>
      <p id="err" class="error" role="alert"></p>
      <button class="btn dark big" type="submit">Start</button>
    </form>
    <p class="hint center">Demo code: <strong>1111</strong></p>
  `, () => {
    $('#back').onclick = roleScreen;
    $('#code').focus();
    $('#f').onsubmit = (e) => {
      e.preventDefault();
      const u = store.userByCode($('#code').value);
      if (!u) return ($('#err').textContent = 'That code was not found. Please check it with your practitioner.');
      store.current = { role: 'user', id: u.id };
      userApp(u.id);
    };
  });
}

function proLogin(creating) {
  show(`
    ${backHeader(creating ? 'New account' : 'Sign in')}
    <section class="hero blue small">
      <h2>${creating ? 'Create a practitioner account' : 'Practitioner sign in'}</h2>
      <p>${creating ? 'Choose a name and a PIN of 4 to 8 digits.' : 'Use your name and PIN.'}</p>
    </section>
    <form id="f" class="stack">
      <label>Your name<input id="name" autocomplete="name" required></label>
      <label>PIN<input id="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" required></label>
      <p id="err" class="error" role="alert"></p>
      <button class="btn dark big" type="submit">${creating ? 'Create account' : 'Sign in'}</button>
    </form>
    <button class="link" id="toggle">${creating ? 'I already have an account' : 'Create a new account'}</button>
    ${creating ? '' : '<p class="hint center">Demo: <strong>Demo Practitioner</strong>, PIN <strong>1234</strong></p>'}
  `, () => {
    $('#back').onclick = roleScreen;
    $('#toggle').onclick = () => proLogin(!creating);
    $('#f').onsubmit = (e) => {
      e.preventDefault();
      const name = $('#name').value, pin = $('#pin').value;
      const p = creating ? store.addPractitioner(name, pin) : store.findPractitioner(name, pin);
      if (!p) return ($('#err').textContent = 'Name or PIN is not right.');
      store.current = { role: 'pro', id: p.id };
      proApp(p.id);
    };
  });
}

// ---------- practitioner ----------

const PRO_TABS = [
  { id: 'home', icon: 'home', label: 'Patients' },
  { id: 'progress', icon: 'chart', label: 'Patients progress' },
  { id: 'add', icon: 'plus', label: 'Add patient' },
  { id: 'profile', icon: 'user', label: 'Profile' },
];

function proApp(pid, tab = 'home') {
  const p = store.practitioner(pid);
  if (!p) return roleScreen();
  const go = (t) => proApp(pid, t);
  if (tab === 'add') return proAddUser(p, go);
  if (tab === 'profile') return proProfile(p, go);
  if (tab === 'progress') return proProgress(p, go);

  const users = store.usersOf(pid);
  const stats = users.map((u) => ({ u, s: userStats(u.id) }));
  const activeWeek = stats.filter(({ s }) => s.weekSessions > 0).length;
  const cards = stats.map(({ u, s }, i) => {
    const status = !s.last ? ['Not started', 'muted'] : Date.now() - new Date(s.last) < 3 * DAY ? ['Active', 'good'] : ['Check in', 'warn'];
    const program = u.program.map((it) => `${exerciseName(it.exerciseId)} ${it.sets}×${it.reps}`).join(' · ') || 'No plan yet';
    return `<button class="card ${tint(i)} user-card" data-user="${u.id}">
      <span class="uc-head">${avatarOf(u, 'lg')}<span class="pill ${status[1]}">${status[0]}</span></span>
      <strong>${esc(u.name)}</strong>
      <small>${u.age ? esc(u.age) + ' yrs · ' : ''}Code ${esc(u.code)}</small>
      <small>${esc(program)}</small>
      <span class="card-foot"><span><small>Last exercised</small><b>${ago(s.last)}</b></span>
        <span><small>Full reps</small><b>${s.quality ?? '–'}${s.quality != null ? '%' : ''}</b></span></span>
    </button>`;
  }).join('');

  show(`
    <header class="greet">
      ${avatar(p.name, 'lg')}
      <div><b>Hello, ${esc(firstName(p.name))}</b><small>${todayLabel()}</small></div>
      <button class="round" id="addTop" aria-label="Add patient">${icon('plus')}</button>
    </header>
    <section class="hero purple">
      <div class="blobs" aria-hidden="true"><i></i><i></i><i></i></div>
      <h2>Your patients</h2>
      <p>${activeWeek} of ${users.length} exercised this week</p>
      <div class="faces">${users.slice(0, 3).map((u) => avatarOf(u)).join('')}${users.length > 3 ? `<span class="avatar more">+${users.length - 3}</span>` : ''}</div>
      <button class="btn dark" id="toProgress">See everyone's progress</button>
    </section>
    ${apptList(upcoming(store.appointmentsFor(pid)).slice(0, 5), { showPatient: true, title: 'Upcoming check-ups' })}
    <h2 class="section-title">Patients</h2>
    <div class="stack">${cards || '<p class="empty">No patients yet. Tap + to add one.</p>'}</div>
    ${tabbar(PRO_TABS, 'home')}
  `, () => {
    bindTabs(go);
    $('#addTop').onclick = () => go('add');
    $('#toProgress').onclick = () => go('progress');
    $$('[data-user]').forEach((b) => (b.onclick = () => userDetail(pid, b.dataset.user)));
  });
}

// Check-up appointments as list rows. showPatient adds the patient's photo
// and name (and makes the row open their profile); canDelete adds a remove button.
function apptList(appts, { showPatient = false, canDelete = false, title = '' } = {}) {
  if (!appts.length) return title && !showPatient ? `<h2 class="section-title">${title}</h2><p class="empty">No check-ups booked.</p>` : '';
  return `${title ? `<h2 class="section-title">${title}</h2>` : ''}<div class="list">${appts.map((a) => {
    const u = store.user(a.userId);
    const lead = showPatient ? avatarOf(u, 'sm') : icon('calendar');
    const body = `<span><b>${showPatient ? esc(u?.name ?? '') + ' · ' : ''}${fmtAppt(a)}</b><small>${esc([a.place, a.note].filter(Boolean).join(' · ') || 'Check-up')}</small></span>`;
    if (showPatient) return `<button class="list-row" data-user="${a.userId}">${lead}${body}${icon('right', 20)}</button>`;
    return `<div class="list-row">${lead}${body}${canDelete ? `<button class="link danger-text" data-del-appt="${a.id}">Cancel</button>` : ''}</div>`;
  }).join('')}</div>`;
}

function proAddUser(p, go) {
  show(`
    <header class="bar"><span class="round-spacer"></span><h1>Add patient</h1><span class="round-spacer"></span></header>
    <section class="hero green small">
      <h2>New patient</h2>
      <p>They'll get a 4-digit code to sign in. You can assign their plan next.</p>
    </section>
    <form id="addForm" class="stack">
      <label class="photo-pick"><span id="photoPreview">${avatar('+', 'xl')}</span>
        <span><b>Add a photo</b><small>Optional. Helps you recognise them.</small></span>
        <input id="uPhoto" type="file" accept="image/*" hidden></label>
      <p id="photoErr" class="error" role="alert"></p>
      <label>Name<input id="uName" required></label>
      <label>Age<input id="uAge" type="number" min="1" max="100" inputmode="numeric"></label>
      <label>Phone<input id="uPhone" type="tel" autocomplete="off"></label>
      <label>Notes<textarea id="uNotes" rows="3" placeholder="Health conditions, mobility aids…"></textarea></label>
      <button class="btn dark big" type="submit">Add patient</button>
    </form>
    ${tabbar(PRO_TABS, 'add')}
  `, () => {
    bindTabs(go);
    let photo = null;
    $('#uPhoto').onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        photo = await photoFromFile(file);
        $('#photoPreview').innerHTML = avatarOf({ photo }, 'xl');
        $('#photoErr').textContent = '';
      } catch (err) {
        $('#photoErr').textContent = err.message;
      }
    };
    $('#addForm').onsubmit = (e) => {
      e.preventDefault();
      const u = store.addUser(p.id, { name: $('#uName').value, age: $('#uAge').value, phone: $('#uPhone').value, notes: $('#uNotes').value });
      if (photo) store.updateUser(u.id, { photo });
      userDetail(p.id, u.id);
    };
  });
}

function proProfile(p, go) {
  const users = store.usersOf(p.id);
  const all = users.flatMap((u) => store.sessionsOf(u.id));
  const week = all.filter((s) => Date.now() - new Date(s.date) < 7 * DAY);
  show(`
    <header class="bar"><span class="round-spacer"></span><h1>Profile</h1><span class="round-spacer"></span></header>
    <div class="profile-head">${avatar(p.name, 'xl')}<div><b>${esc(p.name)}</b><small>Health practitioner</small></div></div>
    <div class="tiles">
      ${tile('Patients', users.length, 'green')}
      ${tile('Sessions this week', week.length, 'cyan')}
      ${tile('Reps this week', week.reduce((n, s) => n + s.reps, 0), 'orange')}
    </div>
    <div class="list">
      ${listRow('users', 'Your patients', `${users.length} people`, 'id="toUsers"')}
      ${listRow('chart', 'Patients progress', 'Everyone on one page', 'id="toProgress"')}
      ${listRow('logout', 'Sign out', 'Return to the start screen', 'id="out"')}
    </div>
    ${tabbar(PRO_TABS, 'profile')}
  `, () => {
    bindTabs(go);
    $('#toUsers').onclick = () => go('home');
    $('#toProgress').onclick = () => go('progress');
    $('#out').onclick = roleScreen;
  });
}

// Everyone's progress on one page. Each photo opens that patient's profile.
function proProgress(p, go, sort = 'attention') {
  const users = store.usersOf(p.id);
  const rows = users.map((u) => ({ u, s: userStats(u.id) }));
  if (sort === 'name') rows.sort((a, b) => a.u.name.localeCompare(b.u.name));
  else rows.sort((a, b) => (a.s.planPct ?? -1) - (b.s.planPct ?? -1) || String(a.s.last).localeCompare(String(b.s.last)));
  const active = rows.filter(({ s }) => s.weekSessions > 0).length;
  const withPlan = rows.filter(({ s }) => s.planPct != null);
  const avgPlan = withPlan.length ? Math.round(withPlan.reduce((n, { s }) => n + s.planPct, 0) / withPlan.length) : null;

  const cards = rows.map(({ u, s }, i) => {
    const pct = s.planPct ?? 0;
    const level = s.planPct == null ? 'muted' : pct >= 70 ? 'good' : pct >= 30 ? 'mid' : 'low';
    return `<article class="card ${tint(i)} prog-card">
      <div class="pc-head">
        <button class="photo-link" data-user="${u.id}" aria-label="Open ${esc(u.name)}'s profile">${avatarOf(u, 'xl')}</button>
        <div class="pc-name"><button class="name-link" data-user="${u.id}">${esc(u.name)}</button>
          <small>${u.age ? esc(u.age) + ' yrs · ' : ''}${s.last ? 'Last exercised ' + ago(s.last).toLowerCase() : 'Not exercised yet'}</small></div>
      </div>
      <div class="pc-bar"><span><small>Plan done, last 7 days</small><b>${s.planPct != null ? pct + '%' : 'No plan'}</b></span>
        <div class="bar ${level}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div></div>
      <div class="pc-days" aria-label="Days exercised in the last 7 days">${s.last7.map((d) =>
        `<span class="${d.done ? 'on' : ''}"><i></i><small>${d.date.toLocaleDateString(undefined, { weekday: 'narrow' })}</small></span>`).join('')}</div>
      <div class="pc-stats">
        <span><b>${s.weekReps}</b><small>Reps</small></span>
        <span><b>${s.quality != null ? s.quality + '%' : '–'}</b><small>Full range</small></span>
        <span><b>${s.bestSquat != null ? s.bestSquat + '°' : '–'}</b><small>Best squat</small></span>
      </div>
    </article>`;
  }).join('');

  show(`
    <header class="bar"><span class="round-spacer"></span><h1>Patients progress</h1><span class="round-spacer"></span></header>
    <div class="tiles">
      ${tile('Patients', users.length, 'green')}
      ${tile('Active this week', `${active}/${users.length}`, 'cyan')}
      ${tile('Avg plan done', avgPlan != null ? avgPlan + '%' : '–', 'orange')}
    </div>
    ${users.length ? `<div class="face-strip">${rows.map(({ u }) =>
      `<button class="photo-link" data-user="${u.id}" aria-label="Open ${esc(u.name)}'s profile">${avatarOf(u, 'lg')}<small>${esc(firstName(u.name))}</small></button>`).join('')}</div>` : ''}
    <div class="row between">
      <h2 class="section-title">Everyone</h2>
      <div class="seg" role="group" aria-label="Sort">
        <button data-sort="attention" aria-pressed="${sort === 'attention'}">Needs attention</button>
        <button data-sort="name" aria-pressed="${sort === 'name'}">A–Z</button>
      </div>
    </div>
    <div class="stack">${cards || '<p class="empty">No patients yet. Tap + to add one.</p>'}</div>
    ${tabbar(PRO_TABS, 'progress')}
  `, () => {
    bindTabs(go);
    $$('[data-sort]').forEach((b) => (b.onclick = () => proProgress(p, go, b.dataset.sort)));
    $$('[data-user]').forEach((b) => (b.onclick = () => userDetail(p.id, b.dataset.user, 'progress')));
  });
}

function userDetail(pid, uidv, from = 'home', editing = false) {
  const u = store.user(uidv);
  if (!u) return proApp(pid, from);
  let draft = structuredClone(u.program);
  const s = userStats(u.id);
  const appts = store.appointmentsOf(u.id);
  const reopen = (edit = false) => userDetail(pid, u.id, from, edit);

  const history = s.sessions.slice(0, 20).map((x) => listRow(
    'activity',
    `${esc(exerciseName(x.exerciseId))}${x.completed ? '' : ' <span class="pill warn">Stopped</span>'}`,
    `${fmtDate(x.date)} · ${x.reps}/${x.targetSets * x.targetReps} reps · ${x.partials} not counted · best ${x.bestAngle != null ? Math.round(x.bestAngle) + '°' : '–'} · ${minutes(x.durationSec)}`,
  )).join('');

  // The next two weeks, day by day: planned exercises and check-ups.
  const ahead = [...Array(14)].map((_, i) => {
    const d = addDays(new Date(), i);
    const items = itemsOn(u.program, d);
    const dayAppts = appts.filter((a) => a.date === ymd(d));
    if (!items.length && !dayAppts.length) return '';
    return `<div class="ahead-row ${i === 0 ? 'today' : ''}">
      <span class="ahead-day"><b>${i === 0 ? 'Today' : dayName(d)}</b><small>${d.getDate()}</small></span>
      <span class="ahead-items">${items.map((it, k) => `<span class="pill ${tint(u.program.indexOf(it))}">${exerciseName(it.exerciseId)} ${it.sets}×${it.reps}</span>`).join('')}
        ${dayAppts.map((a) => `<span class="pill appt">Check-up ${a.time ? esc(a.time) : ''}</span>`).join('')}</span>
    </div>`;
  }).join('');

  const profileView = `
    <div class="list details">
      ${listRow('user', 'Age', u.age ? esc(u.age) + ' years old' : 'Not set')}
      ${listRow('note', 'Phone', esc(u.phone || 'Not set'))}
      ${listRow('activity', 'Notes', esc(u.notes || 'None'))}
    </div>`;
  const profileForm = `
    <form id="profileForm" class="stack sheet">
      <label>Name<input id="pName" required value="${esc(u.name)}"></label>
      <label>Age<input id="pAge" type="number" min="1" max="100" inputmode="numeric" value="${esc(u.age ?? '')}"></label>
      <label>Phone<input id="pPhone" type="tel" value="${esc(u.phone ?? '')}"></label>
      <label>Notes<textarea id="pNotes" rows="3" placeholder="Health conditions, mobility aids…">${esc(u.notes)}</textarea></label>
      <div class="row"><button class="btn dark" type="submit">Save details</button><button class="btn ghost" type="button" id="cancelEdit">Cancel</button></div>
    </form>`;

  show(`
    ${backHeader('Patient')}
    <div class="profile-head">
      <label class="photo-edit" aria-label="Change photo">${avatarOf(u, 'xl')}<span class="cam">${icon('camera', 18)}</span>
        <input id="photo" type="file" accept="image/*" hidden></label>
      <div><b>${esc(u.name)}</b><small>${u.age ? esc(u.age) + ' years old' : 'Age not set'}</small></div>
      <div class="code-chip"><small>Code</small><b>${esc(u.code)}</b></div>
    </div>
    <div class="tiles">
      ${tile('Last exercised', ago(s.last), 'green')}
      ${tile('Plan done, 7 days', s.planPct != null ? s.planPct + '%' : '–', 'cyan')}
      ${tile('Full-range reps', s.quality != null ? s.quality + '%' : '–', 'orange')}
    </div>

    <div class="row between"><h2 class="section-title">Profile</h2>${editing ? '' : '<button class="btn ghost" id="editProfile">Edit</button>'}</div>
    ${editing ? profileForm : profileView}

    <h2 class="section-title">Next 2 weeks</h2>
    <div class="ahead sheet">${ahead || '<p class="empty">Nothing planned. Add exercises below and choose their days.</p>'}</div>

    <h2 class="section-title">Plan</h2>
    <div id="program" class="stack"></div>
    <div class="row">
      <button class="btn ghost" id="addEx">${icon('plus', 20)} Add exercise</button>
      <button class="btn dark" id="saveProg">Save plan</button>
    </div>
    <p id="saved" class="ok" role="status"></p>

    ${apptList(upcoming(appts), { canDelete: true, title: 'Check-ups' })}
    <form id="apptForm" class="sheet stack appt-form">
      <b>Book a check-up</b>
      <div class="grid2">
        <label>Date<input id="aDate" type="date" min="${ymd()}" required></label>
        <label>Time<input id="aTime" type="time" required value="10:00"></label>
      </div>
      <label>Place<input id="aPlace" placeholder="Clinic, room 2"></label>
      <label>What it's for<input id="aNote" placeholder="Review progress"></label>
      <button class="btn dark" type="submit">${icon('plus', 20)} Add check-up</button>
    </form>

    <h2 class="section-title">Calendar</h2>
    <section class="sheet" id="cal"></section>

    <h2 class="section-title">History</h2>
    <div class="list">${history || '<p class="empty">No sessions yet.</p>'}</div>

    <button class="btn danger" id="del">${icon('trash', 20)} Remove patient</button>
  `, () => {
    $('#back').onclick = () => proApp(pid, from);
    $('#photo').onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        store.updateUser(u.id, { photo: await photoFromFile(file) });
        reopen(editing);
      } catch (err) {
        alert(err.message);
      }
    };
    if (editing) {
      $('#cancelEdit').onclick = () => reopen(false);
      $('#profileForm').onsubmit = (e) => {
        e.preventDefault();
        store.updateUser(u.id, {
          name: $('#pName').value.trim() || u.name,
          age: cleanAge($('#pAge').value),
          phone: $('#pPhone').value.trim(),
          notes: $('#pNotes').value,
        });
        reopen(false);
      };
    } else {
      $('#editProfile').onclick = () => reopen(true);
    }
    mountCalendar($('#cal'), s.sessions, { appointments: appts, program: u.program });

    const ex0 = (i) => EXERCISES[draft[i].exerciseId];
    // Show the rules actually used, after clamping and ordering.
    const syncCustom = (i) => {
      if (draft[i].level !== 'custom') return;
      draft[i].custom = rulesToCustom(ex0(i), draft[i]);
      const card = $(`#program [data-i="${i}"]`);
      for (const f of customFields(ex0(i))) {
        const input = card.querySelector(`[data-c="${f.key}"]`);
        if (input) input.value = draft[i].custom[f.key] / (f.scale ?? 1);
      }
    };
    const renderProgram = () => {
      $('#program').innerHTML = draft.map((item, i) => {
        const ex = EXERCISES[item.exerciseId];
        const days = item.days?.length ? item.days : ALL_DAYS;
        return `<div class="card ${tint(i)} prog-item" data-i="${i}">
          <div class="prog-top">${figure(item.exerciseId, 'mini')}
            <label>Exercise<select data-f="exerciseId">
              ${Object.values(EXERCISES).map((e) => `<option value="${e.id}" ${e.id === item.exerciseId ? 'selected' : ''}>${e.name}</option>`).join('')}
            </select></label></div>
          <div class="grid3">
            <label>Sets<input type="number" min="1" max="10" data-f="sets" value="${item.sets}"></label>
            <label>Reps<input type="number" min="1" max="50" data-f="reps" value="${item.reps}"></label>
            <label>${ex.direction < 0 ? 'Knee ≤' : 'Hip ≥'}<input type="number" min="${ex.targetRange[0]}" max="${ex.targetRange[1]}" data-f="target" value="${item.target}"></label>
          </div>
          <label>Counting
            <select data-f="level">${Object.entries(STRICTNESS).map(([k, v]) =>
              `<option value="${k}" ${k === (item.level ?? 'standard') ? 'selected' : ''}>${v.label}: hold ${v.holdMs / 1000}s, at least ${v.minRepMs / 1000}s per rep</option>`).join('')}
              <option value="custom" ${item.level === 'custom' ? 'selected' : ''}>Custom: set each rule yourself</option></select></label>
          ${item.level === 'custom' ? customEditor(ex, item) : ''}
          <fieldset class="days"><legend>Days</legend>
            ${ALL_DAYS.map((d) => `<button type="button" class="day-chip" data-day="${d}" aria-pressed="${days.includes(d)}" aria-label="${dayName(new Date(2024, 0, 7 + d), true)}">${WEEKDAY_LETTERS[d]}</button>`).join('')}
          </fieldset>
          <div class="grid2">
            <label>Starts<input type="date" data-f="startDate" value="${esc(item.startDate ?? '')}"></label>
            <label>Ends<input type="date" data-f="endDate" value="${esc(item.endDate ?? '')}"></label>
          </div>
          <label>Instruction video link <small>(YouTube, Vimeo or .mp4)</small>
            <input type="url" inputmode="url" data-f="video" value="${esc(item.video ?? '')}" placeholder="https://youtu.be/…"></label>
          <small class="video-err" data-err="${i}"></small>
          <div class="row between"><small>${ex.jointLabel} target, ${ex.targetRange[0]}–${ex.targetRange[1]}°</small>
          <button class="link danger-text" data-remove="${i}">Remove</button></div>
        </div>`;
      }).join('') || '<p class="empty">No exercises assigned.</p>';
      $$('#program [data-f]').forEach((el) => {
        el.onchange = () => {
          const i = Number(el.closest('[data-i]').dataset.i);
          const f = el.dataset.f;
          if (f === 'exerciseId') {
            draft[i].exerciseId = el.value;
            draft[i].target = EXERCISES[el.value].defaultTarget;
            draft[i].custom = draft[i].level === 'custom' ? rulesToCustom(EXERCISES[el.value], { ...draft[i], level: 'standard' }) : null;
            renderProgram();
          } else if (f === 'video') {
            const ok = !el.value.trim() || parseVideo(el.value);
            draft[i].video = ok ? el.value.trim() : draft[i].video;
            $(`[data-err="${i}"]`).textContent = ok ? '' : 'That link does not look like a video. Paste a YouTube, Vimeo or .mp4 link.';
          } else if (f === 'level') {
            // Start custom rules from whatever the item was counting with.
            if (el.value === 'custom' && !draft[i].custom) draft[i].custom = rulesToCustom(ex0(i), draft[i]);
            draft[i].level = el.value;
            renderProgram();
          } else if (f === 'startDate' || f === 'endDate') {
            draft[i][f] = el.value;
          } else {
            const ex = EXERCISES[draft[i].exerciseId];
            const [lo, hi] = f === 'target' ? ex.targetRange : f === 'sets' ? [1, 10] : [1, 50];
            const v = Math.min(hi, Math.max(lo, Math.round(Number(el.value) || lo)));
            draft[i][f] = v;
            el.value = v;
            if (f === 'target') syncCustom(i);
          }
          $('#saved').textContent = '';
        };
      });
      $$('#program [data-c]').forEach((el) => {
        el.onchange = () => {
          const i = Number(el.closest('[data-i]').dataset.i);
          const field = customFields(ex0(i)).find((c) => c.key === el.dataset.c);
          const n = Number(el.value);
          if (el.value !== '' && !Number.isNaN(n)) {
            const v = Math.min(field.max, Math.max(field.min, n));
            draft[i].custom = { ...draft[i].custom, [field.key]: Math.round(v * (field.scale ?? 1)) };
          }
          syncCustom(i);
          $('#saved').textContent = '';
        };
      });
      $$('#program [data-day]').forEach((b) => (b.onclick = () => {
        const i = Number(b.closest('[data-i]').dataset.i);
        const d = Number(b.dataset.day);
        const days = new Set(draft[i].days?.length ? draft[i].days : ALL_DAYS);
        if (days.has(d)) {
          if (days.size === 1) return; // keep at least one day
          days.delete(d);
        } else days.add(d);
        draft[i].days = [...days].sort();
        b.setAttribute('aria-pressed', days.has(d));
        $('#saved').textContent = '';
      }));
      $$('#program [data-remove]').forEach((b) => (b.onclick = () => { draft.splice(Number(b.dataset.remove), 1); renderProgram(); }));
    };
    renderProgram();

    $('#addEx').onclick = () => { draft.push(store.newProgramItem('squat', EXERCISES.squat.defaultTarget)); renderProgram(); };
    $('#saveProg').onclick = () => {
      const bad = draft.find((it) => it.startDate && it.endDate && it.endDate < it.startDate);
      if (bad) return ($('#saved').textContent = `${exerciseName(bad.exerciseId)}: the end date is before the start date.`);
      store.updateUser(u.id, { program: structuredClone(draft) });
      reopen(editing);
      $('#saved').textContent = `Saved. ${u.name} will see this plan next time they open the app.`;
      $('#saved').scrollIntoView({ block: 'center' });
    };
    $('#apptForm').onsubmit = (e) => {
      e.preventDefault();
      store.addAppointment({
        userId: u.id,
        practitionerId: pid,
        date: $('#aDate').value,
        time: $('#aTime').value,
        place: $('#aPlace').value.trim(),
        note: $('#aNote').value.trim(),
      });
      reopen(editing);
    };
    $$('[data-del-appt]').forEach((b) => (b.onclick = () => {
      if (confirm('Cancel this check-up?')) { store.deleteAppointment(b.dataset.delAppt); reopen(editing); }
    }));
    $('#del').onclick = () => {
      if (confirm(`Remove ${u.name} and all their history?`)) { store.deleteUser(u.id); proApp(pid, from); }
    };
  });
}

// ---------- user ----------

const USER_TABS = [
  { id: 'home', icon: 'home', label: 'Home' },
  { id: 'calendar', icon: 'calendar', label: 'Calendar' },
  { id: 'progress', icon: 'chart', label: 'Progress' },
  { id: 'profile', icon: 'user', label: 'Profile' },
];

function userApp(uidv, tab = 'home') {
  const u = store.user(uidv);
  if (!u) return roleScreen();
  const go = (t) => userApp(uidv, t);
  const s = userStats(u.id);
  const pro = store.practitioner(u.practitionerId);
  const doneToday = (item) => s.sessions.some((x) => x.programItemId === item.id && x.completed && isToday(x.date));
  const appts = store.appointmentsOf(u.id);
  const nextAppt = upcoming(appts)[0];

  if (tab === 'calendar') {
    return show(`
      <header class="bar"><span class="round-spacer"></span><h1>Calendar</h1><span class="round-spacer"></span></header>
      <section class="sheet" id="cal"></section>
      ${tabbar(USER_TABS, 'calendar')}
    `, () => { bindTabs(go); mountCalendar($('#cal'), s.sessions, { appointments: appts, program: u.program }); });
  }

  if (tab === 'progress') {
    const rows = s.sessions.slice(0, 20).map((x) => listRow(
      'activity',
      `${esc(exerciseName(x.exerciseId))}${x.completed ? '' : ' <span class="pill warn">Stopped</span>'}`,
      `${fmtDate(x.date)} · ${x.reps} reps · ${minutes(x.durationSec)}`,
    )).join('');
    return show(`
      <header class="bar"><span class="round-spacer"></span><h1>Progress</h1><span class="round-spacer"></span></header>
      <div class="tiles">
        ${tile('Workouts this week', s.weekCompleted, 'green')}
        ${tile('Reps this week', s.weekReps, 'cyan')}
        ${tile('Full-range reps', s.quality != null ? s.quality + '%' : '–', 'orange')}
      </div>
      <h2 class="section-title">Recent workouts</h2>
      <div class="list">${rows || '<p class="empty">No workouts yet. Your first one will show here.</p>'}</div>
      ${tabbar(USER_TABS, 'progress')}
    `, () => bindTabs(go));
  }

  if (tab === 'profile') {
    return show(`
      <header class="bar"><span class="round-spacer"></span><h1>Profile</h1><span class="round-spacer"></span></header>
      <div class="profile-head">${avatarOf(u, 'xl')}<div><b>${esc(u.name)}</b><small>${u.age ? esc(u.age) + ' years old · ' : ''}Code ${esc(u.code)}</small></div></div>
      <p class="hint">Your practitioner keeps your details up to date. Ask them if anything needs changing.</p>
      <div class="tiles">
        ${tile('Workouts', s.sessions.filter((x) => x.completed).length, 'green')}
        ${tile('Best squat', s.bestSquat != null ? s.bestSquat + '°' : '–', 'cyan')}
        ${tile('This week', s.weekReps + ' reps', 'orange')}
      </div>
      <div class="list">
        ${listRow('activity', 'Physical activity', ago(s.last), 'id="toCal"')}
        ${listRow('note', 'Statistics', `This week: ${s.weekReps} reps`, 'id="toProg"')}
        ${listRow('calendar', 'Next check-up', nextAppt ? fmtAppt(nextAppt) : 'None booked', nextAppt ? 'id="toCal2"' : '')}
        ${listRow('trophy', 'Practitioner', esc(pro?.name ?? 'Not set'))}
        ${listRow('volume', 'Voice coach', voice.enabled ? 'On, tap to turn off' : 'Off, tap to turn on', 'id="voiceRow"')}
        ${listRow('logout', 'Sign out', 'Return to the start screen', 'id="out"')}
      </div>
      ${tabbar(USER_TABS, 'profile')}
    `, () => {
      bindTabs(go);
      $('#toCal').onclick = () => go('calendar');
      $('#toProg').onclick = () => go('progress');
      if (nextAppt) $('#toCal2').onclick = () => go('calendar');
      $('#voiceRow').onclick = () => { voice.enabled = !voice.enabled; go('profile'); };
      $('#out').onclick = roleScreen;
    });
  }

  const todays = itemsOn(u.program, new Date());
  const remaining = todays.filter((i) => !doneToday(i));
  const cards = todays.map((item) => {
    const i = u.program.indexOf(item);
    const ex = EXERCISES[item.exerciseId];
    const done = doneToday(item);
    return `<button class="card ${tint(i)} tall plan-card" data-start="${item.id}">
      <span class="pill">${done ? 'Done today ✓' : `${item.sets} × ${item.reps}`}</span>
      <strong>${ex.name}</strong>
      <small>${item.sets} ${item.sets > 1 ? 'sets' : 'set'} of ${item.reps}</small>
      <small>${targetText(ex, item.target)}</small>
      ${parseVideo(item.video) ? '<small>▶ Video guide</small>' : ''}
      ${figure(item.exerciseId, 'card-figure')}
      <span class="trainer">${avatar(pro?.name ?? '?', 'sm')}<span><small>Practitioner</small><b>${esc(firstName(pro?.name ?? ''))}</b></span></span>
    </button>`;
  });
  if (cards.length % 2) {
    cards.push(`<div class="card pink tall tip-card"><span class="pill">Tip</span><strong>Stay safe</strong>
      <small>Keep a sturdy chair within reach. Stop if you feel pain or dizzy.</small></div>`);
  }

  // The next 6 days that have exercises or a check-up.
  const comingUp = [...Array(6)].map((_, k) => addDays(new Date(), k + 1)).map((d) => {
    const items = itemsOn(u.program, d);
    const dayAppts = appts.filter((a) => a.date === ymd(d));
    if (!items.length && !dayAppts.length) return '';
    return `<div class="ahead-row"><span class="ahead-day"><b>${dayName(d)}</b><small>${d.getDate()}</small></span>
      <span class="ahead-items">${items.map((it) => `<span class="pill ${tint(u.program.indexOf(it))}">${exerciseName(it.exerciseId)}</span>`).join('')}
      ${dayAppts.map((a) => `<span class="pill appt">Check-up ${esc(a.time)}</span>`).join('')}</span></div>`;
  }).join('');
  const nextDay = [...Array(30)].map((_, k) => addDays(new Date(), k + 1)).find((d) => itemsOn(u.program, d).length);

  const heroTitle = !u.program.length ? 'Welcome' : !todays.length ? 'Rest day' : remaining.length ? "Today's plan" : 'All done today';
  const heroText = !u.program.length ? 'Your practitioner has not assigned any exercises yet.'
    : !todays.length ? (nextDay ? `Next exercises on ${dayName(nextDay, true)}.` : 'Nothing planned yet.')
    : `${todays.length - remaining.length} of ${todays.length} exercise${todays.length === 1 ? '' : 's'} done`;

  show(`
    <header class="greet">
      ${avatarOf(u, 'lg')}
      <div><b>Hello, ${esc(firstName(u.name))}</b><small>${todayLabel()}</small></div>
      <button class="round" id="toCalTop" aria-label="Calendar">${icon('calendar')}</button>
    </header>
    <section class="hero purple">
      <div class="blobs" aria-hidden="true"><i></i><i></i><i></i></div>
      <h2>${heroTitle}</h2>
      <p>${heroText}</p>
      ${remaining.length ? `<button class="btn dark" id="startNext">Start ${EXERCISES[remaining[0].exerciseId].name}</button>` : ''}
    </section>
    ${nextAppt ? `<button class="card blue appt-card" id="apptCard">
      <span class="pill">Next check-up</span>
      <strong>${fmtAppt(nextAppt)}</strong>
      <small>${esc([nextAppt.place, nextAppt.note].filter(Boolean).join(' · ') || 'With your practitioner')}</small>
      <span class="trainer">${avatar(pro?.name ?? '?', 'sm')}<span><small>With</small><b>${esc(pro?.name ?? '')}</b></span></span>
    </button>` : ''}
    ${weekStrip(s.sessions, u.program)}
    ${todays.length ? `<h2 class="section-title">Today</h2><div class="grid2">${cards.join('')}</div>` : ''}
    ${comingUp ? `<h2 class="section-title">Coming up</h2><div class="ahead sheet">${comingUp}</div>` : ''}
    ${tabbar(USER_TABS, 'home')}
  `, () => {
    bindTabs(go);
    $('#toCalTop').onclick = () => go('calendar');
    if (nextAppt) $('#apptCard').onclick = () => go('calendar');
    if (remaining.length) $('#startNext').onclick = () => prepScreen(u.id, remaining[0].id);
    $$('[data-start]').forEach((b) => (b.onclick = () => prepScreen(u.id, b.dataset.start)));
  });
}

function prepScreen(uidv, itemId) {
  const u = store.user(uidv);
  const idx = u?.program.findIndex((i) => i.id === itemId) ?? -1;
  if (idx < 0) return userApp(uidv);
  const item = u.program[idx];
  const ex = EXERCISES[item.exerciseId];
  const pro = store.practitioner(u.practitionerId);
  loadPoseModel().catch(() => {}); // start downloading the model while they read
  show(`
    <div class="detail">
      <section class="detail-hero ${tint(idx)}">
        <button class="round light" id="back" aria-label="Back">${icon('left')}</button>
        ${figure(item.exerciseId, 'hero-figure')}
        <div class="detail-title"><h1>${ex.name}</h1><p>Practitioner: ${esc(pro?.name ?? '')}</p></div>
      </section>
      <section class="detail-sheet">
        <div class="row between"><b>Next exercise</b><small><b>${idx + 1}</b> of ${u.program.length}</small></div>
        <div class="ex-row">
          <span class="thumb ${tint(idx)}">${figure(item.exerciseId)}</span>
          <div><b>${ex.name}</b><small>${item.sets} ${item.sets > 1 ? 'sets' : 'set'} of ${item.reps} reps</small>
            <div class="pills"><span class="pill orange">${targetText(ex, item.target)}</span><span class="pill purple">${REST_SECONDS}s rest</span></div></div>
        </div>
        ${parseVideo(item.video) ? `<h3>Watch how</h3>${videoEmbed(item.video, `${ex.name} instructions`)}` : ''}
        <h3>Before you start</h3>
        <ol class="steps">${ex.setup.map((st) => `<li>${esc(st)}</li>`).join('')}<li>Turn your volume up so you can hear the coach.</li></ol>
        <div class="legend"><span><i class="g"></i>Green: good position</span><span><i class="r"></i>Red: adjust</span></div>
        <button class="btn dark big" id="go">I'm ready</button>
      </section>
    </div>
  `, () => {
    $('#back').onclick = () => userApp(uidv);
    $('#go').onclick = () => {
      voice.unlock();
      exerciseScreen(uidv, item);
    };
  });
}

function exerciseScreen(uidv, item) {
  const ex = EXERCISES[item.exerciseId];
  const target = item.target ?? ex.defaultTarget;

  const ringLen = 2 * Math.PI * 44;
  show(`
    <div class="session">
      <div class="stage" id="stage">
        <video id="video" playsinline muted autoplay></video>
        <canvas id="canvas"></canvas>
        <div class="s-top">
          <button class="round-btn" id="stop" aria-label="Stop exercise">✕</button>
          <div class="ring" aria-label="Reps done">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <circle cx="50" cy="50" r="44" class="ring-bg"></circle>
              <circle cx="50" cy="50" r="44" class="ring-fg" id="ring" stroke-dasharray="${ringLen}" stroke-dashoffset="${ringLen}"></circle>
            </svg>
            <b id="reps">0</b>
          </div>
          <div class="s-clock"><b id="clock">00:00</b><small>${ex.name}</small></div>
          <button class="round-btn" id="mute" aria-label="Mute voice">🔊</button>
        </div>
        <div class="s-bottom">
          <div class="feedback" id="feedback" role="status" aria-live="polite">Getting ready…</div>
          <div class="s-stats">
            <div><b id="setLabel">1/${item.sets}</b><small>Set</small></div>
            <div><b id="repsOf">0/${item.reps}</b><small>Reps</small></div>
            <div><b id="form" class="form-ind" aria-hidden="true"></b><small id="formLabel">Form</small></div>
            <div><b>${ex.direction < 0 ? '≤' : '≥'}${target}°</b><small>Target</small></div>
          </div>
          <button class="btn ghost on-dark" id="flip">Switch camera</button>
        </div>
        <div class="overlay" id="status"><p>Starting camera…</p></div>
        <div class="overlay rest" id="rest" hidden>
          <p>Set complete. Rest.</p><b id="restLeft">${REST_SECONDS}</b>
          <button class="btn primary" id="skipRest">Start next set</button>
        </div>
      </div>
    </div>
  `);

  const video = $('#video'), canvas = $('#canvas'), status = $('#status');
  let facing = 'user', stream = null, stopDetect = null;
  const rules = countingRules(ex, item);
  let counter = RepCounter.forExercise(ex, target, item.level, item.custom);
  const smoother = new Smoother();
  let set = 1, totalReps = 0, totalPartials = 0, resting = false, finished = false;
  let lostSince = null, restTimer = null;
  let formIssue = null; // 'lean' | 'deep' during the current rep
  const extremes = [];
  const t0 = Date.now();
  const mmss = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  const clockTimer = setInterval(() => {
    const el = $('#clock');
    if (el) el.textContent = mmss(Math.floor((Date.now() - t0) / 1000));
  }, 1000);

  const showReps = () => {
    $('#reps').textContent = counter.reps;
    $('#repsOf').textContent = `${counter.reps}/${item.reps}`;
    $('#ring').style.strokeDashoffset = ringLen * (1 - Math.min(1, counter.reps / item.reps));
  };

  const say = (text, opts) => voice.say(text, opts);
  const feedback = (text, { speak = true, urgent = false, tone = '' } = {}) => {
    const el = $('#feedback');
    if (!el) return;
    el.textContent = text;
    el.className = 'feedback ' + tone;
    if (speak) say(text, { urgent });
  };

  const handle = (e) => {
    if (e.type === 'ready') feedback(ex.cues.ready, { tone: 'good', urgent: true });
    else if (e.type === 'goal' && ex.cues.goal) feedback(ex.cues.goal, { tone: 'good' });
    else if (e.type === 'holding') feedback(ex.cues.holding, { tone: 'good' });
    else if (e.type === 'partial') {
      totalPartials++;
      const formCue = formIssue === 'deep' ? 'Too deep. Stop at the target. That one did not count.' : ex.cues.form;
      const cue = { shallow: ex.cues.partial, nohold: ex.cues.nohold, form: formCue, fast: fastCue }[e.reason];
      feedback(cue ?? ex.cues.partial, { tone: 'warn', urgent: true });
    } else if (e.type === 'rep') {
      totalReps++;
      extremes.push(e.extreme);
      showReps();
      const left = item.reps - counter.reps;
      let spoken = String(counter.reps);
      if (left === 1) spoken += '. One more!';
      feedback(left === 1 ? `Rep ${counter.reps}. One more!` : `Rep ${counter.reps}. Well done!`, { speak: false, tone: 'good' });
      say(spoken, { urgent: true });
      if (left <= 0) completeSet();
    }
  };

  const onFrame = (landmarks) => {
    const w = video.videoWidth, h = video.videoHeight;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const mirrored = facing === 'user';
    const checks = formChecks(ex, landmarks, w, h, target, rules);
    drawPose(canvas, landmarks, { checks, mirrored });
    const formOk = checks.length ? checks.every((c) => c.good) : null;
    $('#form').className = 'form-ind ' + (formOk == null ? '' : formOk ? 'g' : 'r');
    $('#formLabel').textContent = formOk == null ? 'Form' : formOk ? 'Good' : 'Adjust';
    const m = measure(ex, landmarks, w, h);
    if (!m) {
      lostSince ??= Date.now();
      // Out of view for a moment: cancel the rep in progress so it can't count.
      if (Date.now() - lostSince > 700) {
        counter.interrupt();
        smoother.reset();
      }
      if (Date.now() - lostSince > 2000 && !resting && !finished) {
        feedback('Step back so I can see your whole body.', { tone: 'warn' });
      }
      return;
    }
    lostSince = null;
    const a = smoother.next(m.angle);
    if (resting || finished) return;
    const leaning = ex.checkTrunk && m.lean > rules.maxLean;
    const tooDeep = rules.safeLimit != null && (ex.direction < 0 ? a < rules.safeLimit : a > rules.safeLimit);
    if (counter.state === 'start') formIssue = null;
    if (tooDeep) formIssue = 'deep';
    else if (leaning) formIssue ??= 'lean';
    counter.update(a, Date.now(), !(leaning || tooDeep)).forEach(handle);
    if (tooDeep) feedback('That is deep enough. Do not go lower.', { tone: 'warn' });
    if (counter.state === 'waiting') feedback(ex.cues.waiting, { tone: 'warn' });
    else if (ex.checkTrunk && counter.state !== 'start' && leaning) feedback('Keep your chest up.', { tone: 'warn' });
  };

  const completeSet = () => {
    if (set >= item.sets) return finish(true);
    resting = true;
    say(`Set ${set} complete. Take a rest.`, { urgent: true });
    let left = REST_SECONDS;
    $('#rest').hidden = false;
    $('#restLeft').textContent = left;
    restTimer = setInterval(() => {
      left--;
      $('#restLeft').textContent = left;
      if (left === 5) say('Get ready.', { urgent: true });
      if (left <= 0) nextSet();
    }, 1000);
  };

  const nextSet = () => {
    clearInterval(restTimer);
    $('#rest').hidden = true;
    set++;
    counter = RepCounter.forExercise(ex, target, item.level, item.custom);
    showReps();
    $('#setLabel').textContent = `${set}/${item.sets}`;
    resting = false;
    say(`Set ${set}. ${ex.cues.waiting}`, { urgent: true });
  };

  const finish = (completed) => {
    if (finished) return;
    finished = true;
    const best = extremes.length ? (ex.direction < 0 ? Math.min(...extremes) : Math.max(...extremes)) : null;
    const avg = extremes.length ? extremes.reduce((a, b) => a + b, 0) / extremes.length : null;
    const result = {
      userId: uidv,
      exerciseId: ex.id,
      programItemId: item.id,
      targetSets: item.sets,
      targetReps: item.reps,
      target,
      setsCompleted: completed ? item.sets : set - 1,
      reps: totalReps,
      partials: totalPartials,
      bestAngle: best,
      avgAngle: avg,
      durationSec: Math.round((Date.now() - t0) / 1000),
      completed,
    };
    if (completed || totalReps > 0) store.addSession(result);
    // Stop the camera but let the closing words play.
    stopAll();
    clearInterval(restTimer);
    clearInterval(clockTimer);
    cleanup = null;
    if (completed) say('Great work! You finished your exercise.', { urgent: true });
    summaryScreen(uidv, ex, result);
  };

  const begin = async () => {
    status.hidden = false;
    status.innerHTML = '<p>Starting camera…</p>';
    try {
      stream = await startCamera(video, facing);
      video.classList.toggle('mirrored', facing === 'user');
      status.innerHTML = '<p>Loading movement tracker…</p>';
      const landmarker = await loadPoseModel();
      status.hidden = true;
      feedback(ex.cues.waiting, { tone: 'warn' });
      stopDetect = runDetection(landmarker, video, onFrame);
    } catch (err) {
      const denied = err?.name === 'NotAllowedError';
      status.innerHTML = `<p>${denied ? 'Camera access was blocked. Allow the camera in your browser settings, then try again.' : esc(err?.message || 'Something went wrong.')}</p>
        <button class="btn primary" id="retry">Try again</button>`;
      $('#retry').onclick = begin;
    }
  };

  const stopAll = () => {
    stopDetect?.();
    stopDetect = null;
    stopCamera(stream);
    stream = null;
  };

  cleanup = () => {
    stopAll();
    clearInterval(restTimer);
    clearInterval(clockTimer);
    voice.stop();
  };

  $('#stop').onclick = () => {
    if (totalReps === 0) return userApp(uidv);
    finish(false);
  };
  $('#skipRest').onclick = nextSet;
  $('#mute').onclick = () => {
    voice.enabled = !voice.enabled;
    if (!voice.enabled) voice.stop();
    $('#mute').textContent = voice.enabled ? '🔊' : '🔇';
  };
  $('#flip').onclick = () => {
    stopAll();
    facing = facing === 'user' ? 'environment' : 'user';
    begin();
  };

  begin();
}

function summaryScreen(uidv, ex, r) {
  const quality = r.reps + r.partials ? Math.round((r.reps / (r.reps + r.partials)) * 100) : 0;
  show(`
    <section class="hero ${r.completed ? 'green' : 'orange'} summary-hero">
      <div class="blobs" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="big-emoji" aria-hidden="true">${r.completed ? '🎉' : '👍'}</div>
      <h1>${r.completed ? 'Well done!' : 'Good effort!'}</h1>
      <p>${ex.name}: ${r.reps} reps${r.completed ? ', all sets finished.' : '.'}</p>
    </section>
    <div class="tiles four">
      ${tile('Sets', `${r.setsCompleted}/${r.targetSets}`, 'green')}
      ${tile('Best ' + ex.jointLabel.toLowerCase(), r.bestAngle != null ? Math.round(r.bestAngle) + '°' : '–', 'cyan')}
      ${tile('Full-range reps', quality + '%', 'orange')}
      ${tile('Time', minutes(r.durationSec), 'purple')}
    </div>
    <button class="btn dark big wide" id="home">Back to my plan</button>
  `, () => {
    $('#home').onclick = () => userApp(uidv);
  });
}

// ---------- start ----------

const who = store.current;
if (who?.role === 'pro' && store.practitioner(who.id)) proApp(who.id);
else if (who?.role === 'user' && store.user(who.id)) userApp(who.id);
else roleScreen();
