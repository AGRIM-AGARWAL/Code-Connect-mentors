// Sound effects — all synthesised with the Web Audio API (no audio files needed).
// Soft and low: master gain ≈ −18 dB. Sound never carries information on its own.

// ← Drop your own recording at public/audio/voice-select.mp3 to replace the built-in voice.
export const VOICE_SELECT_URL = '/audio/voice-select.mp3'

/** Sound is switched OFF for the whole site. Set to true to bring all sounds (and the mute button) back. */
export const SOUND_ON = false

const MUTE_KEY = 'cc.muted'
let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = readMuted()
const listeners = new Set<(m: boolean) => void>()

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export const isMuted = () => muted
export function setMuted(m: boolean) {
  muted = m
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0')
  } catch {
    /* ignore */
  }
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.126, ctx.currentTime, 0.05)
  if (m) window.speechSynthesis?.cancel()
  listeners.forEach((f) => f(m))
}
export function onMuteChange(f: (m: boolean) => void) {
  listeners.add(f)
  return () => listeners.delete(f)
}

/** Call from a click/keypress (browsers only allow audio after a user gesture). */
export function unlockAudio() {
  if (!SOUND_ON) return
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = muted ? 0 : 0.126
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
}

const ready = () => !!ctx && !!master && !muted && ctx.state === 'running'
const dB = (d: number) => Math.pow(10, d / 20)

function tone(o: { type?: OscillatorType; f0: number; f1?: number; dur: number; gain?: number; delay?: number; attack?: number }) {
  if (!ready()) return
  const c = ctx!
  const t = c.currentTime + (o.delay ?? 0)
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(o.f0, t)
  if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur)
  const peak = o.gain ?? 1
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + (o.attack ?? 0.005))
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur)
  osc.connect(g).connect(master!)
  osc.start(t)
  osc.stop(t + o.dur + 0.05)
}

function noise(o: { dur: number; gain: number; from: number; to: number; delay?: number }) {
  if (!ready()) return
  const c = ctx!
  const t = c.currentTime + (o.delay ?? 0)
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * o.dur), c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buf
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(o.from, t)
  lp.frequency.exponentialRampToValueAtTime(o.to, t + o.dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(o.gain, t + o.dur * 0.6)
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur)
  src.connect(lp).connect(g).connect(master!)
  src.start(t)
}

let lastHover = 0

export const sfx = {
  boot() {
    noise({ dur: 1.2, gain: 0.35, from: 200, to: 2400 })
    tone({ f0: 55, dur: 1.4, gain: 0.5, attack: 0.4 })
  },
  hover() {
    const now = performance.now()
    if (now - lastHover < 80) return
    lastHover = now
    tone({ f0: 1200, dur: 0.012, gain: dB(-30) * 8 })
  },
  select() {
    noise({ dur: 0.04, gain: 0.25, from: 4000, to: 1500 })
    tone({ f0: 440, f1: 220, dur: 0.16, gain: 0.7 })
  },
  unselect() {
    tone({ f0: 220, f1: 330, dur: 0.09, gain: 0.5 })
  },
  lockIn() {
    ;[110, 138.6, 164.8].forEach((f) => tone({ type: 'triangle', f0: f, dur: 1.8, gain: 0.35, attack: 0.3 }))
    noise({ dur: 1.5, gain: 0.12, from: 300, to: 3000 })
  },
  tick() {
    tone({ type: 'triangle', f0: 880, dur: 0.03, gain: dB(-24) * 6 })
  },
  submit() {
    tone({ f0: 520, f1: 660, dur: 0.07, gain: 0.5 })
  },
  partChime() {
    ;[392, 494, 587].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 1.6, gain: 0.35, delay: i * 0.12 }))
  },
  mission() {
    sfx.partChime()
    noise({ dur: 2, gain: 0.1, from: 3000, to: 9000, delay: 0.2 })
  },
}

/** "SELECT YOUR MENTORS": your recording if present, else the browser's own voice, else a soft stinger. */
export async function playSelectVoice() {
  if (!SOUND_ON || muted) return
  try {
    const a = new Audio(VOICE_SELECT_URL)
    a.volume = 0.8
    await a.play()
    return
  } catch {
    /* no file → fall back */
  }
  const synth = window.speechSynthesis
  if (synth && typeof SpeechSynthesisUtterance !== 'undefined') {
    const u = new SpeechSynthesisUtterance('Select your mentors')
    u.rate = 0.88
    u.pitch = 0.7
    u.volume = 0.8
    const en = synth.getVoices().find((v) => /en[-_](GB|US|IN)/i.test(v.lang))
    if (en) u.voice = en
    synth.cancel()
    synth.speak(u)
    return
  }
  tone({ type: 'triangle', f0: 196, dur: 0.9, gain: 0.4, attack: 0.05 })
  tone({ type: 'triangle', f0: 294, dur: 0.9, gain: 0.3, delay: 0.15 })
}
