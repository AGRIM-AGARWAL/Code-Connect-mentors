// DEMO MODE ONLY (VITE_DEMO=1): an in-browser stand-in for the Supabase functions,
// so the site can be clicked through without a backend. Never used in the real build.
import mentorsData from '../../data/mentors.json'
import interestData from '../../data/interest_questions.json'

type Q = { id: string; mentor_id: string; kind: 'skill' | 'interest'; qkey?: string; prompt: string; options: string[]; correct?: number }
type Ans = { served: number; answered?: number; choice: number | null; seconds: number; points: number }
type Reg = { full_name: string; sap_id: string; year: number; contact_number: string; college_email: string }
type State = {
  regs: Record<string, Reg>
  sessions: Record<string, string>
  choices: Record<string, { m: string[]; created: number; finished?: number }>
  answers: Record<string, Record<string, Ans>>
  quizOpen: boolean
  interests: Record<string, Record<string, number>>
  teams: { sap_id: string; mentor_id: string; via: string; score: number | null; created_at: string }[]
  sizes?: Record<string, { min: number; max: number }>
}

export const DEMO_ADMIN_PASSWORD = 'demo'
const SECONDS = 30
const KEY = 'cc_demo_state_v1'

const mentors = (mentorsData as { id: string; name: string; tagline: string; highlights: string[]; github: string; linkedin: string; accent?: string; photoUrl?: string; active?: boolean; skillQuestions: { id: string; q: string; options: string[]; answer: number }[] }[]).filter((m) => m.active !== false).map((m, i) => ({ ...m, sort: i }))
const keys = interestData.keys as { qkey: string; mentorPrompt: string; mentorOptions: string[]; studentPrompt: string; studentOptions: string[] }[]

const questions: Q[] = mentors.flatMap((m, mi) => [
  ...m.skillQuestions.map((q) => ({ id: q.id, mentor_id: m.id, kind: 'skill' as const, prompt: q.q, options: q.options, correct: q.answer })),
  ...Array.from({ length: interestData.perMentor }, (_, j) => keys[(mi + j) % keys.length]).map((k) => ({
    id: `${m.id}__${k.qkey}`, mentor_id: m.id, kind: 'interest' as const, qkey: k.qkey, prompt: k.studentPrompt, options: k.studentOptions,
  })),
])

class MockError extends Error {}
const fail = (code: string): never => {
  throw new MockError(code)
}

// ── seeded sample data so the admin pages have something to show ──
function seed(): State {
  const s: State = { regs: {}, sessions: {}, choices: {}, answers: {}, quizOpen: true, interests: {}, teams: [] }
  let r = 7
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280)
  mentors.forEach((m) => {
    s.interests[m.id] = Object.fromEntries(keys.map((k) => [k.qkey, Math.floor(rnd() * k.mentorOptions.length)]))
  })
  const names = ['Riya Kapoor', 'Arjun Mehta', 'Sneha Rawat', 'Kabir Singh', 'Ananya Bisht', 'Rohan Negi', 'Ishita Joshi', 'Vivaan Rana', 'Diya Thapa', 'Aditya Pant', 'Meera Nair', 'Karan Gupta', 'Tanvi Shah', 'Yash Verma', 'Pooja Iyer', 'Nikhil Das', 'Sara Khan', 'Dev Malhotra', 'Aisha Rao', 'Harsh Jain', 'Nisha Bora', 'Zoya Ali', 'Rahul Sethi', 'Kriti Saini']
  const prefs = [['vanshdeep', 'om', 'chirrayu'], ['om', 'dhairya', 'khushi'], ['chirrayu', 'vanshdeep', 'dhairya'], ['dhairya', 'khushi', 'om'], ['khushi', 'chirrayu', 'vanshdeep']]
  names.forEach((n, i) => {
    const sap = '5900' + String(20001 + i)
    s.regs[sap] = { full_name: n, sap_id: sap, year: 1 + (i % 4), contact_number: '98765' + String(10000 + i).slice(-5), college_email: `${n.split(' ')[0].toLowerCase()}.${sap.slice(-5)}@stu.upes.ac.in` }
    const m = prefs[i % prefs.length]
    s.choices[sap] = { m, created: Date.now() - 3600e3 + i, finished: Date.now() - 600e3 }
    s.answers[sap] = {}
    for (const q of questions.filter((q) => m.includes(q.mentor_id))) {
      const choice = Math.floor(rnd() * q.options.length)
      const key = q.kind === 'skill' ? q.correct! : s.interests[q.mentor_id][q.qkey!]
      const secs = Math.round((3 + rnd() * 25) * 100) / 100
      s.answers[sap][q.id] = { served: 0, answered: 1, choice, seconds: secs, points: choice === key ? 4 + Math.round(2 * (1 - secs / SECONDS) * 100) / 100 : -1 }
    }
  })
  return s
}

let state: State = load()
function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return seed()
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}
export function resetDemo() {
  state = seed()
  save()
}

const student = (t: unknown) => state.sessions[String(t)] ?? fail('INVALID_SESSION')
const admin = (pw: unknown) => (pw === DEMO_ADMIN_PASSWORD ? true : fail('BAD_PASSWORD'))
const now = () => Date.now()

function ordered(sap: string) {
  const c = state.choices[sap]
  return c.m.flatMap((mid, p) => {
    const qs = questions.filter((q) => q.mentor_id === mid).sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'skill' ? -1 : 1))
    return qs.map((q, i) => ({ q, part: p + 1, pn: i + 1, pt: qs.length }))
  })
}

const handlers: Record<string, (a: Record<string, unknown>) => unknown> = {
  student_login: ({ p_sap, p_email }) => {
    const r = state.regs[String(p_sap).trim()]
    if (!r || r.college_email !== String(p_email).trim().toLowerCase()) fail('NOT_REGISTERED')
    if (TEST_ACCOUNTS.includes(r.sap_id) && state.choices[r.sap_id]?.finished) wipe(r.sap_id)
    const token = crypto.randomUUID()
    state.sessions[token] = r.sap_id
    return { token, name: r.full_name, sap_id: r.sap_id }
  },
  student_status: ({ p_token }) => {
    const sap = student(p_token)
    const c = state.choices[sap]
    return {
      name: state.regs[sap].full_name, sap_id: sap, quiz_open: state.quizOpen, question_seconds: SECONDS,
      choices: c ? c.m : null, stage: !c ? 'choose' : c.finished ? 'done' : 'quiz',
    }
  },
  save_choices: ({ p_token, p_m1, p_m2, p_m3 }) => {
    const sap = student(p_token)
    if (!state.quizOpen) fail('QUIZ_CLOSED')
    const m = [p_m1, p_m2, p_m3].map(String)
    if (new Set(m).size !== 3) fail('PICK_3_DIFFERENT')
    if (state.choices[sap]) fail('ALREADY_CHOSEN')
    state.choices[sap] = { m, created: now() }
    state.answers[sap] = {}
    return null
  },
  next_question: ({ p_token }) => {
    const sap = student(p_token)
    const c = state.choices[sap] ?? fail('NO_CHOICES')
    if (c.finished) return { done: true }
    if (!state.quizOpen) return { closed: true }
    const list = ordered(sap)
    for (let i = 0; i < list.length; i++) {
      const { q, part, pn, pt } = list[i]
      const a = state.answers[sap][q.id]
      if (a?.answered) continue
      let elapsed = 0
      if (!a) state.answers[sap][q.id] = { served: now(), choice: null, seconds: 0, points: 0 }
      else {
        elapsed = (now() - a.served) / 1000
        if (elapsed > SECONDS + 3) {
          Object.assign(a, { answered: a.served + SECONDS * 1000, choice: null, seconds: SECONDS, points: 0 })
          continue
        }
      }
      const m = mentors.find((x) => x.id === q.mentor_id)!
      return {
        id: q.id, mentor_id: q.mentor_id, mentor_name: m.name, kind: q.kind, prompt: q.prompt, options: q.options,
        part, index_in_part: pn, part_total: pt, number: i + 1, total: list.length, seconds: SECONDS,
        seconds_left: Math.max(0, SECONDS - elapsed),
      }
    }
    c.finished = now()
    return { done: true }
  },
  submit_answer: ({ p_token, p_question_id, p_choice }) => {
    const sap = student(p_token)
    if (!state.quizOpen) fail('QUIZ_CLOSED')
    const a = state.answers[sap]?.[String(p_question_id)]
    if (!a || a.answered) fail('NOT_CURRENT_QUESTION')
    const q = questions.find((x) => x.id === p_question_id)!
    const elapsed = (now() - a!.served) / 1000
    let choice = p_choice == null ? null : Number(p_choice)
    if (elapsed > SECONDS + 3) choice = null
    let points = 0
    if (choice !== null) {
      const key = q.kind === 'skill' ? q.correct : state.interests[q.mentor_id]?.[q.qkey!]
      points = key === undefined ? 0 : choice === key ? 4 + Math.round(2 * Math.max(0, 1 - Math.min(elapsed, SECONDS) / SECONDS) * 100) / 100 : -1
    }
    Object.assign(a!, { answered: now(), choice, seconds: Math.round(Math.min(elapsed, SECONDS) * 100) / 100, points })
    return null
  },
  admin_login: ({ p_pw }) => admin(p_pw),
  admin_overview: ({ p_pw }) => {
    admin(p_pw)
    const ch = Object.values(state.choices)
    return {
      quiz_open: state.quizOpen, question_seconds: SECONDS, registered: Object.keys(state.regs).length,
      chose: ch.length, finished: ch.filter((c) => c.finished).length,
      teams_generated_at: state.teams[0]?.created_at ?? null,
      mentors: mentors.map((m) => {
        const iq = questions.filter((q) => q.mentor_id === m.id && q.kind === 'interest')
        return {
          id: m.id, name: m.name, active: true, min_team: state.sizes?.[m.id]?.min ?? 5, max_team: state.sizes?.[m.id]?.max ?? 8,
          skill_count: questions.filter((q) => q.mentor_id === m.id && q.kind === 'skill').length,
          interest_count: iq.length,
          interest_missing: iq.filter((q) => state.interests[m.id]?.[q.qkey!] === undefined).length,
          picked_first: ch.filter((c) => c.m[0] === m.id).length,
          picked_any: ch.filter((c) => c.m.includes(m.id)).length,
        }
      }),
    }
  },
  admin_set_quiz_open: ({ p_pw, p_open }) => {
    admin(p_pw)
    state.quizOpen = Boolean(p_open)
    return null
  },
  admin_interests: ({ p_pw }) => {
    admin(p_pw)
    return {
      keys: keys.map((k) => ({ qkey: k.qkey, prompt: k.mentorPrompt, options: k.mentorOptions })),
      answers: Object.entries(state.interests).flatMap(([mentor_id, o]) => Object.entries(o).map(([qkey, answer]) => ({ mentor_id, qkey, answer }))),
    }
  },
  admin_set_interest: ({ p_pw, p_mentor, p_qkey, p_answer }) => {
    admin(p_pw)
    const m = (state.interests[String(p_mentor)] ??= {})
    if (p_answer == null) delete m[String(p_qkey)]
    else m[String(p_qkey)] = Number(p_answer)
    return null
  },
  admin_results: ({ p_pw }) => {
    admin(p_pw)
    return Object.entries(state.choices)
      .sort((a, b) => a[1].created - b[1].created)
      .map(([sap, c]) => {
        const r = state.regs[sap]
        const scores: Record<string, number> = {}
        const seconds: Record<string, number> = {}
        const interests: Record<string, number> = {}
        for (const [qid, a] of Object.entries(state.answers[sap] ?? {})) {
          const q = questions.find((x) => x.id === qid)!
          scores[q.mentor_id] = Math.round(((scores[q.mentor_id] ?? 0) + a.points) * 100) / 100
          seconds[q.mentor_id] = (seconds[q.mentor_id] ?? 0) + a.seconds
          if (q.kind === 'interest' && a.choice !== null) interests[q.qkey!] = a.choice
        }
        return { sap_id: sap, name: r.full_name, email: r.college_email, phone: r.contact_number, year: r.year, choices: c.m, finished: !!c.finished, scores, seconds, interests }
      })
  },
  admin_save_teams: ({ p_pw, p_rows }) => {
    admin(p_pw)
    const t = new Date().toISOString()
    state.teams = (p_rows as { sap_id: string; mentor_id: string; via: string; score: number | null }[]).map((x) => ({ ...x, created_at: t }))
    return null
  },
  admin_get_teams: ({ p_pw }) => {
    admin(p_pw)
    return state.teams
  },
  admin_set_team_size: ({ p_pw, p_mentor, p_min, p_max }) => {
    admin(p_pw)
    const min = Number(p_min), max = Number(p_max)
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 1 || min > max || max > 50) fail('BAD_TEAM_SIZE')
    if (!mentors.some((m) => m.id === p_mentor)) fail('UNKNOWN_MENTOR')
    ;(state.sizes ??= {})[String(p_mentor)] = { min, max }
    return null
  },
  admin_move_student: ({ p_pw, p_sap, p_mentor }) => {
    admin(p_pw)
    if (!mentors.some((m) => m.id === p_mentor)) fail('UNKNOWN_MENTOR')
    const t = state.teams.find((x) => x.sap_id === p_sap) ?? fail('NOT_IN_A_TEAM')
    const pts = Object.entries(state.answers[String(p_sap)] ?? {})
      .filter(([qid]) => questions.find((q) => q.id === qid)?.mentor_id === p_mentor)
      .map(([, a]) => a.points)
    Object.assign(t, { mentor_id: String(p_mentor), via: 'manual', score: pts.length ? Math.round(pts.reduce((a, b) => a + b, 0) * 100) / 100 : null })
    return null
  },
  admin_reset_student: ({ p_pw, p_sap }) => {
    admin(p_pw)
    delete state.choices[String(p_sap)]
    delete state.answers[String(p_sap)]
    state.teams = state.teams.filter((t) => t.sap_id !== p_sap)
    return null
  },
}

export async function mockRpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> {
  await new Promise((r) => setTimeout(r, 120)) // feel like a network call
  try {
    const h = handlers[fn] ?? fail('UNKNOWN_FUNCTION')
    const data = h(args)
    save()
    return { data, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : String(e) } }
  }
}

export async function mockMentors() {
  return mentors.map(({ id, name, tagline, highlights, github, linkedin, accent, photoUrl }) => ({ id, name, tagline, highlights, github, linkedin, accent: accent ?? null, photo_url: photoUrl ?? null }))
}

// Same as test_accounts in 02_quiz.sql: can re-register; fresh quiz on re-register or on login after finishing
const TEST_ACCOUNTS = ['590025687']
function wipe(sap: string) {
  delete state.choices[sap]
  delete state.answers[sap]
  state.teams = state.teams.filter((t) => t.sap_id !== sap)
}

export async function mockRegister(row: Reg & { interests: string[] }) {
  await new Promise((r) => setTimeout(r, 150))
  if (TEST_ACCOUNTS.includes(row.sap_id)) {
    delete state.regs[row.sap_id]
    wipe(row.sap_id)
  }
  if (state.regs[row.sap_id] || Object.values(state.regs).some((r) => r.college_email === row.college_email)) return { error: { code: '23505' } }
  state.regs[row.sap_id] = row
  save()
  return { error: null }
}
