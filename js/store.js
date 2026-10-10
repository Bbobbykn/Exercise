// Demo storage in the browser's localStorage. Everything lives on this one
// device; a shared backend is needed before practitioners and users can
// work from different phones.

const KEY = 'exerciseApp.v1';

import { ALL_DAYS, ymd, addDays } from './schedule.js';

const uid = () => Math.random().toString(36).slice(2, 10);

function seed() {
  return {
    practitioners: [{ id: 'p-demo', name: 'Demo Practitioner', pin: '1234' }],
    users: [
      {
        id: 'u-demo',
        practitionerId: 'p-demo',
        name: 'Mary (demo)',
        age: 72,
        code: '1111',
        notes: 'Uses a walking stick. Keep squats shallow.',
        program: [
          { id: uid(), exerciseId: 'squat', sets: 2, reps: 8, target: 115, video: 'https://youtu.be/A8_Zwr3SIac' },
          { id: uid(), exerciseId: 'sitToStand', sets: 2, reps: 10, target: 160 },
        ],
      },
    ],
    sessions: [],
    appointments: [
      {
        id: uid(),
        userId: 'u-demo',
        practitionerId: 'p-demo',
        date: ymd(addDays(new Date(), 4)),
        time: '10:00',
        place: 'Clinic, room 2',
        note: 'Review squat progress',
      },
    ],
  };
}

// Fill in fields added in later versions so older saved data keeps working.
function migrate(data) {
  data.appointments ??= [];
  for (const u of data.users) {
    u.phone ??= '';
    for (const it of u.program) {
      it.days ??= [...ALL_DAYS];
      it.level ??= 'standard';
      it.startDate ??= '';
      it.endDate ??= '';
      it.custom ??= null;
    }
  }
  return data;
}

const byWhen = (a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);

let db = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch {
    /* fall through to seed */
  }
  return migrate(seed());
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* storage full or blocked; keep working in memory */
  }
}
save();

// Ages 1-100; anything else is left blank.
export const cleanAge = (v) => {
  const n = Math.round(Number(v));
  return n >= 1 ? Math.min(100, n) : null;
};

export const store = {
  // Practitioners
  findPractitioner(name, pin) {
    const n = name.trim().toLowerCase();
    return db.practitioners.find((p) => p.name.toLowerCase() === n && p.pin === pin) ?? null;
  },
  addPractitioner(name, pin) {
    const p = { id: uid(), name: name.trim(), pin };
    db.practitioners.push(p);
    save();
    return p;
  },
  practitioner(id) {
    return db.practitioners.find((p) => p.id === id) ?? null;
  },

  // Users
  usersOf(practitionerId) {
    return db.users.filter((u) => u.practitionerId === practitionerId);
  },
  user(id) {
    return db.users.find((u) => u.id === id) ?? null;
  },
  userByCode(code) {
    return db.users.find((u) => u.code === code.trim()) ?? null;
  },
  addUser(practitionerId, { name, age, notes, phone }) {
    let code;
    do code = String(Math.floor(1000 + Math.random() * 9000));
    while (db.users.some((u) => u.code === code));
    const u = { id: uid(), practitionerId, name: name.trim(), age: cleanAge(age), phone: phone ?? '', notes: notes ?? '', code, program: [] };
    db.users.push(u);
    save();
    return u;
  },
  updateUser(id, changes) {
    const u = this.user(id);
    if (!u) return;
    Object.assign(u, changes);
    save();
  },
  deleteUser(id) {
    db.users = db.users.filter((u) => u.id !== id);
    db.sessions = db.sessions.filter((s) => s.userId !== id);
    db.appointments = db.appointments.filter((a) => a.userId !== id);
    save();
  },
  newProgramItem(exerciseId, target) {
    return { id: uid(), exerciseId, sets: 2, reps: 8, target, level: 'standard', days: [...ALL_DAYS], startDate: ymd(), endDate: '' };
  },

  // Exercise sessions
  addSession(session) {
    const s = { id: uid(), date: new Date().toISOString(), ...session };
    db.sessions.push(s);
    save();
    return s;
  },
  sessionsOf(userId) {
    return db.sessions.filter((s) => s.userId === userId).sort((a, b) => b.date.localeCompare(a.date));
  },

  // Check-up appointments, soonest first
  addAppointment(appt) {
    const a = { id: uid(), ...appt };
    db.appointments.push(a);
    save();
    return a;
  },
  deleteAppointment(id) {
    db.appointments = db.appointments.filter((a) => a.id !== id);
    save();
  },
  appointmentsOf(userId) {
    return db.appointments.filter((a) => a.userId === userId).sort(byWhen);
  },
  appointmentsFor(practitionerId) {
    return db.appointments.filter((a) => a.practitionerId === practitionerId).sort(byWhen);
  },

  // Who is signed in on this device
  get current() {
    try {
      return JSON.parse(sessionStorage.getItem(KEY + '.who')) ?? null;
    } catch {
      return null;
    }
  },
  set current(who) {
    try {
      if (who) sessionStorage.setItem(KEY + '.who', JSON.stringify(who));
      else sessionStorage.removeItem(KEY + '.who');
    } catch {
      /* ignore */
    }
  },

  resetDemo() {
    db = seed();
    save();
  },
};
