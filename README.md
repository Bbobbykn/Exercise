# MoveWell (working name)

A mobile-first web app that helps older adults exercise safely. The phone camera tracks the body, measures joint angles, counts reps and speaks feedback. Health practitioners add users, assign programs and follow progress on a dashboard.

## What's in this first version

**Sign in.** The first screen asks "I'm exercising" or "I'm a health practitioner".
- Practitioners sign in with name + PIN (or create an account).
- Users type the 4-digit code their practitioner gives them.
- Demo logins: practitioner `Demo Practitioner` / PIN `1234`; user code `1111`.

**Practitioner dashboard**
- Patients progress page: every patient on one page with their photo, plan done in the last 7 days (progress bar), which days they exercised, reps, full-range % and best squat. Sort by "Needs attention" or A–Z. Tapping a photo or name opens that patient's profile.
- Patient photos: add one when creating a patient, or tap the photo on their profile to change it (stored on the device, shrunk to 256 px).
- List of users with last exercised, sessions completed this week and % of full-range reps.
- Add a user (name, age 1-100, notes); the app gives them a login code.
- Pastel card design with a dark pill tab bar (Users, Add user, Profile).
- Patient profile (name, age, phone, notes, photo) is added and edited by the practitioner only; patients see it read-only.
- Plan ahead: each exercise has its weekdays, a start date and an optional end date, plus a "Next 2 weeks" preview on the patient page. Patients only see the exercises planned for today, with a "Coming up" list.
- Check-ups: practitioners book appointments (date, time, place, what it's for). Patients see the next check-up on their home screen, in their profile and on the calendar; practitioners see upcoming check-ups across all patients on their home screen.
- Counting strictness per exercise (Gentle / Standard / Strict), or **Custom** to set each counting rule yourself: hold time at the target, minimum time per rep, the start position angle, the angle where a rep begins, and for squats the maximum forward lean and the "too deep" limit. Angles are kept in a sensible order (for squats: standing > rep starts > target > too deep).
- Per user: edit the program (exercise, sets, reps, target angle and an optional instruction video link: YouTube, Vimeo or .mp4), notes, a workout calendar, and session history (reps, partial reps, best angle, time).

**User side**
- Today's exercises with a "Done today" tick, a safety reminder, and setup steps before each exercise.
- Home: greeting, a "Today's plan" card with a start button, this week's day strip (dots on workout days) and pastel plan cards.
- Tab bar: Home, Calendar (finished and stopped-early days, tap for details), Progress (weekly stats and recent workouts) and Profile (voice coach on/off, sign out).
- Exercise pages play the practitioner's instruction video under "Watch how" before the user starts.
- Full-screen camera with the skeleton drawn on top. The checked body parts turn green when in a proper position (standing tall, seated, or at the target angle) and red when outside it (part-way, too deep, or leaning too far forward on squats). No angle numbers are shown on the body.
- A rep ring and timer at the top. Set, reps, a green/red form dot and the target along the bottom.
- 30-second rest between sets, then a summary screen. Results are saved to the practitioner's history.

**Exercises**

| Exercise | Joint measured | A rep counts when | Practitioner sets |
|---|---|---|---|
| Squats | Knee (hip-knee-ankle) | You bend to the target and stand back up past 160° | Depth, 80-130° (default 110°) |
| Sit to stand | Hip (shoulder-hip-knee) | You rise from seated (≤120°) to the target | Standing angle, 140-175° (default 160°) |

A rep only counts when the person starts from the proper position (fully standing for squats, seated for sit-to-stand), reaches the target and **holds it**, keeps good form the whole way (no leaning too far forward, no going dangerously deep), takes long enough (no bouncing), and stays fully in view (shoulder, hip, knee and ankle clearly visible). Anything else is logged as "not counted" and the coach says why.

| Strictness | Hold at target | Minimum time per rep |
|---|---|---|
| Gentle | 0.3 s | 1.5 s |
| Standard (default) | 0.6 s | 2 s |
| Strict | 1 s | 3 s |

For sit-to-stand the minimum time applies to the way up, so it is halved. With **Custom** counting the practitioner sets each of these numbers (and the angles) per exercise.

**Spoken feedback** (browser speech, mute button on screen): "Stand up tall to begin", "Good, now slowly bend your knees", "Try to bend a little lower", "Try to stand up all the way", "Keep your chest up" (squats, if leaning over 50°), "Step back so I can see your whole body", rep counts, "One more!", "Nice and slow" for rushed reps, set complete / rest / get ready, and a well done at the end.

## How it works

- Plain HTML, CSS and JavaScript modules. No build step.
- Pose detection: [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) (lite model), loaded from a CDN and run on the phone. Video never leaves the device.
- The app uses whichever side of the body the camera sees best, so the phone should face the person side-on.
- Storage: browser `localStorage`. **All data stays on one device**, so a practitioner and a user only share data if they use the same phone. A real backend is the next step for separate devices.

```
index.html
css/styles.css
js/app.js        screens and the exercise session
js/exercises.js  exercise settings, angle maths, rep counter (pure, tested)
js/pose.js       camera + MediaPipe + skeleton drawing
js/voice.js      spoken feedback
js/calendar.js   calendar of workouts, planned days and check-ups
js/schedule.js   which exercises are planned on which day
js/video.js      instruction video links (YouTube, Vimeo, .mp4)
js/store.js      demo storage
tests/           node --test tests/*.test.mjs
```

## Running it

**Live site:** https://bbobbykn.github.io/Exercise/ (deployed by `.github/workflows/pages.yml` on every push to `main`; Settings → Pages → Source must be "GitHub Actions").

Phones only allow the camera on `https://` pages (or `localhost`). Any static host works: GitHub Pages, Netlify, Vercel or Cloudflare Pages. Upload this folder as is.

On a computer: `npx serve .` (or `python3 -m http.server`) and open `http://localhost:3000` with a webcam.

## Known limits

- Single-device storage (see above); no real authentication yet.
- Angles are 2D from one camera, so accuracy is best side-on with the whole body in view and good lighting.
- Thresholds (start/standing angles, trunk lean) are sensible defaults and should be checked by a practitioner with real users.
