import { DEMO, REGISTRATIONS_TABLE, supabase } from './supabase'

const MESSAGES: Record<string, string> = {
  INVALID_SESSION: 'Your session has expired. Please log in again.',
  NOT_REGISTERED: 'No registration found for this SAP ID and college email.',
  QUIZ_CLOSED: 'The quiz is closed right now.',
  PICK_3_DIFFERENT: 'Pick 3 different mentors.',
  UNKNOWN_MENTOR: 'One of these mentors is no longer available. Refresh and try again.',
  ALREADY_CHOSEN: 'You have already picked your mentors.',
  NO_CHOICES: 'Pick your mentors first.',
  NOT_CURRENT_QUESTION: 'That question was already submitted.',
  BAD_CHOICE: 'Invalid option.',
  BAD_PASSWORD: 'Wrong admin password.',
  ADMIN_NOT_SET: 'The admin password has not been set in Supabase yet (see README, step 2).',
  NOT_CONFIGURED: 'Supabase is not configured (missing env vars).',
  BAD_TEAM_SIZE: 'Team size must be: minimum 0 or more, maximum 1–50, and minimum not above maximum.',
  NOT_IN_A_TEAM: 'That student is not in a saved team.',
}

export class ApiError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  let res: { data: unknown; error: { message: string } | null }
  if (import.meta.env.VITE_DEMO === '1') {
    res = await (await import('./mock')).mockRpc(fn, args)
  } else {
    if (!supabase) throw new ApiError('NOT_CONFIGURED', MESSAGES.NOT_CONFIGURED)
    res = await supabase.rpc(fn, args)
  }
  const { data, error } = res
  if (error) {
    const code = Object.keys(MESSAGES).find((k) => error.message?.includes(k)) ?? 'UNKNOWN'
    if (code === 'UNKNOWN') console.error(fn, error)
    throw new ApiError(code, MESSAGES[code] ?? 'Something went wrong. Please try again.')
  }
  return data as T
}

export const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.')

// ── Types ────────────────────────────────────────────
export type Mentor = {
  id: string
  name: string
  tagline: string | null
  highlights: string[]
  github: string | null
  linkedin: string | null
  accent?: string | null
  photo_url?: string | null
}

export type Status = {
  name: string
  sap_id: string
  quiz_open: boolean
  question_seconds: number
  choices: string[] | null
  stage: 'choose' | 'quiz' | 'done'
}

export type Question = {
  id: string
  mentor_id: string
  mentor_name: string
  kind: 'skill' | 'interest'
  prompt: string
  options: string[]
  part: number
  index_in_part: number
  part_total: number
  number: number
  total: number
  seconds: number
  seconds_left: number
}

export type NextQuestion = Question | { done: true } | { closed: true }

export async function fetchMentors(): Promise<Mentor[]> {
  if (import.meta.env.VITE_DEMO === '1') return (await import('./mock')).mockMentors()
  if (!supabase) throw new ApiError('NOT_CONFIGURED', MESSAGES.NOT_CONFIGURED)
  const { data, error } = await supabase
    .from('mentors')
    .select('id,name,tagline,highlights,github,linkedin,accent,photo_url')
    .order('sort')
    .order('name')
  if (error) throw new ApiError('UNKNOWN', 'Could not load mentors. Please refresh.')
  return data as Mentor[]
}

export type Registration = {
  full_name: string
  sap_id: string
  year: number
  contact_number: string
  college_email: string
  interests: string[]
  other_interest: string | null
}

// Returns null on success, or a Postgres-style error code ('23505' = already registered)
export async function registerStudent(row: Registration): Promise<{ code?: string } | null> {
  if (import.meta.env.VITE_DEMO === '1') return (await (await import('./mock')).mockRegister(row)).error
  if (!supabase) throw new ApiError('NOT_CONFIGURED', MESSAGES.NOT_CONFIGURED)
  const { error } = await supabase.from(REGISTRATIONS_TABLE).insert(row)
  if (error) console.error(error)
  return error
}

export const isDemo = DEMO

// ── Session token (per browser) ──────────────────────
const KEY = 'cc_token'
export const session = {
  get(): string | null {
    try {
      return localStorage.getItem(KEY)
    } catch {
      return null
    }
  },
  set(t: string) {
    try {
      localStorage.setItem(KEY, t)
    } catch {
      /* private mode: token lives only in memory for this tab */
      memToken = t
    }
  },
  clear() {
    memToken = null
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
  },
}
let memToken: string | null = null
export const getToken = () => session.get() ?? memToken
