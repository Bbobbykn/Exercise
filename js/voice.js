// Spoken feedback using the browser's built-in speech synthesis.

export class Voice {
  constructor() {
    this.enabled = true;
    this.lastSaid = new Map();
    this.lastAny = 0;
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  }

  // Call from a button tap: phones only allow speech after a user gesture.
  unlock() {
    if (!this.synth) return;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    this.synth.speak(u);
  }

  // urgent: interrupt whatever is being said (used for rep counts).
  // repeatGap: don't repeat the same phrase within this many ms.
  say(text, { urgent = false, repeatGap = 6000, gap = 2500 } = {}) {
    if (!this.enabled || !this.synth || !text) return false;
    const now = Date.now();
    if (!urgent) {
      if (now - (this.lastSaid.get(text) ?? 0) < repeatGap) return false;
      if (now - this.lastAny < gap || this.synth.speaking) return false;
    } else {
      this.synth.cancel();
    }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9;
    u.pitch = 1;
    u.lang = 'en-US';
    this.synth.speak(u);
    this.lastSaid.set(text, now);
    this.lastAny = now;
    return true;
  }

  stop() {
    this.synth?.cancel();
  }
}
