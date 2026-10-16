import { useState, type FormEvent } from 'react'
import MultiSelect from '../components/MultiSelect'
import { Field, MuteToggle, TopBar } from '../components/Shell'
import { isSupabaseConfigured } from '../lib/supabase'
import { getToken, registerStudent, rpc, session } from '../lib/api'
import { sfx, unlockAudio } from '../audio/sfx'
import { go } from '../App'

export const INTEREST_OPTIONS = [
  'Web Development',
  'App Development',
  'AI / Machine Learning',
  'Data Science',
  'Cybersecurity',
  'Cloud & DevOps',
  'Blockchain / Web3',
  'Game Development',
  'IoT / Hardware',
  'Other',
] as const

type Form = {
  fullName: string
  sapId: string
  year: string
  contact: string
  email: string
  interests: string[]
  otherInterest: string
}
type Errors = Partial<Record<keyof Form, string>>

const EMPTY: Form = { fullName: '', sapId: '', year: '', contact: '', email: '', interests: [], otherInterest: '' }

const NAME_RE = /^[A-Za-z]+( [A-Za-z]+)*$/
const SAP_RE = /^5900\d{5}$/
const PHONE_RE = /^[6-9]\d{9}$/
const EMAIL_RE = /^[a-z]+\.(\d{5})@stu\.upes\.ac\.in$/i

export function validate(f: Form): Errors {
  const e: Errors = {}
  const name = f.fullName.trim()

  if (!name) e.fullName = 'Full name is required.'
  else if (name.length < 2) e.fullName = 'Name must be at least 2 characters.'
  else if (!NAME_RE.test(name)) e.fullName = 'Use letters only (single spaces between words).'

  if (!f.sapId) e.sapId = 'SAP ID is required.'
  else if (!SAP_RE.test(f.sapId)) e.sapId = 'SAP ID must be 9 digits starting with 5900.'

  if (!f.year) e.year = 'Select your year.'

  if (!f.contact) e.contact = 'Contact number is required.'
  else if (!PHONE_RE.test(f.contact)) e.contact = 'Enter a valid 10-digit Indian mobile number.'

  const email = f.email.trim()
  const m = email.match(EMAIL_RE)
  if (!email) e.email = 'College email is required.'
  else if (!m) e.email = 'Use your college email: name.xxxxx@stu.upes.ac.in'
  else if (SAP_RE.test(f.sapId) && m[1] !== f.sapId.slice(-5))
    e.email = 'Roll number in email must match the last 5 digits of your SAP ID.'

  if (f.interests.length === 0) e.interests = 'Pick at least one interest.'
  if (f.interests.includes('Other') && !f.otherInterest.trim()) e.otherInterest = 'Tell us your other interest.'

  return e
}

export default function Register() {
  const [form, setForm] = useState<Form>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [touched, setTouched] = useState<Partial<Record<keyof Form, boolean>>>({})
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle')
  const [serverError, setServerError] = useState('')

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    const next = { ...form, [k]: v }
    setForm(next)
    if (touched[k] || errors[k]) setErrors(validate(next))
  }
  const blur = (k: keyof Form) => {
    setTouched((t) => ({ ...t, [k]: true }))
    setErrors(validate(form))
  }
  const err = (k: keyof Form) => (touched[k] ? errors[k] : undefined)
  const digits = (s: string, n: number) => s.replace(/\D/g, '').slice(0, n)
  const cls = (k: keyof Form, extra = '') => `input ${extra} ${err(k) ? 'is-invalid' : ''}`

  // progress label: how many of the 6 required fields are valid
  const filled = (['fullName', 'sapId', 'year', 'contact', 'email', 'interests'] as const).filter(
    (k) => !validate(form)[k] && (k === 'interests' ? form.interests.length > 0 : !!form[k]),
  ).length

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    unlockAudio()
    setServerError('')
    const v = validate(form)
    setErrors(v)
    setTouched({ fullName: true, sapId: true, year: true, contact: true, email: true, interests: true, otherInterest: true })
    if (Object.keys(v).length) return

    setStatus('submitting')
    let error: { code?: string } | null
    try {
      error = await registerStudent({
        full_name: form.fullName.trim().replace(/\s+/g, ' '),
        sap_id: form.sapId,
        year: Number(form.year),
        contact_number: form.contact,
        college_email: form.email.trim().toLowerCase(),
        interests: form.interests,
        other_interest: form.interests.includes('Other') ? form.otherInterest.trim() : null,
      })
    } catch {
      error = { code: 'NOT_CONFIGURED' }
    }

    if (error) {
      setStatus('idle')
      setServerError(
        error.code === '23505'
          ? 'This SAP ID or email is already registered.'
          : error.code === 'NOT_CONFIGURED'
            ? 'Registration is not configured yet (missing Supabase env vars).'
            : 'Something went wrong. Please try again.',
      )
      return
    }
    // log the student straight in so they can continue to mentor selection
    try {
      const r = await rpc<{ token: string }>('student_login', {
        p_sap: form.sapId,
        p_email: form.email.trim().toLowerCase(),
      })
      session.set(r.token)
    } catch {
      /* they can still log in manually */
    }
    sfx.select()
    setStatus('done')
  }

  if (status === 'done') {
    return (
      <div className="screen">
        <div className="col">
          <TopBar left="STEP 01/05 · ACCESS GRANTED" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 60 }}>
            <span className="mono md c-sage" style={{ letterSpacing: '.2em' }}>[ ACCESS GRANTED ]</span>
            <h1 className="display d-lg glitch">
              You're
              <br />
              <span className="caret">in.</span>
            </h1>
            <p className="lede" style={{ color: 'var(--text-2)' }}>
              Welcome, {form.fullName.trim().split(' ')[0]}. Next: pick your 3 mentors and take the quiz.
            </p>
          </div>
          <div style={{ marginTop: 'auto' }}>
            <button className="btn block tall" onClick={() => go(getToken() ? '/student' : '/login')}>
              Continue →
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="col">
        <div className="topbar">
          <a href="#/login" className="mono md" style={{ textDecoration: 'none', height: 44, display: 'flex', alignItems: 'center' }}>
            ← LOG IN
          </a>
          <MuteToggle />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="mono md c-amber" style={{ letterSpacing: '.2em' }}>&gt; NEW OPERATOR</span>
          <h1 className="display d-md glitch">
            Create
            <br />
            access
          </h1>
          <p className="lede">One minute. Use the details on your college ID.</p>
        </div>

        <form className="brk panel" onSubmit={onSubmit} noValidate style={{ gap: 14 }}>
          <div className="panel-head mono sm c-muted">
            <span>// REGISTER_FORM</span>
            <span>FIELD {filled}/6</span>
          </div>

          {!isSupabaseConfigured && <div className="banner warn">Supabase env vars are missing, so registration is disabled.</div>}

          <Field label="Full name" htmlFor="fullName" error={err('fullName')}>
            <input id="fullName" className={cls('fullName')} placeholder="As on your college ID" autoComplete="name"
              value={form.fullName} onChange={(e) => set('fullName', e.target.value)} onBlur={() => blur('fullName')} aria-invalid={!!err('fullName')} />
          </Field>

          <div className="row2">
            <Field label="SAP ID" htmlFor="sapId" error={err('sapId')}>
              <input id="sapId" className={cls('sapId', 'mono-in')} placeholder="5900XXXXX" inputMode="numeric"
                value={form.sapId} onChange={(e) => set('sapId', digits(e.target.value, 9))} onBlur={() => blur('sapId')} aria-invalid={!!err('sapId')} />
            </Field>
            <Field label="Year" htmlFor="year" error={err('year')}>
              <select id="year" className={`${cls('year')} ${form.year ? '' : 'placeholder'}`} value={form.year}
                onChange={(e) => set('year', e.target.value)} onBlur={() => blur('year')}>
                <option value="" disabled>Select year</option>
                <option value="1">1st Year</option>
                <option value="2">2nd Year</option>
                <option value="3">3rd Year</option>
                <option value="4">4th Year</option>
              </select>
            </Field>
          </div>

          <Field label="Contact number" htmlFor="contact" error={err('contact')}>
            <div className={`${cls('contact')} prefix-wrap`}>
              <span className="prefix">+91</span>
              <input id="contact" placeholder="98XXXXXXXX" inputMode="numeric" autoComplete="tel-national"
                value={form.contact} onChange={(e) => set('contact', digits(e.target.value, 10))} onBlur={() => blur('contact')} />
            </div>
          </Field>

          <Field label="College email" htmlFor="email" error={err('email')}>
            <input id="email" type="email" className={cls('email')} placeholder="name.xxxxx@stu.upes.ac.in" autoComplete="email"
              value={form.email} onChange={(e) => set('email', e.target.value)} onBlur={() => blur('email')} aria-invalid={!!err('email')} />
          </Field>

          <Field label="Project interests" htmlFor="interests" error={err('interests')}>
            <MultiSelect id="interests" options={INTEREST_OPTIONS} selected={form.interests} placeholder="Select one or more"
              invalid={Boolean(err('interests'))}
              onChange={(v) => {
                set('interests', v)
                setTouched((t) => ({ ...t, interests: true }))
              }} />
          </Field>

          {form.interests.includes('Other') && (
            <Field label="Other interest" htmlFor="otherInterest" error={err('otherInterest')}>
              <input id="otherInterest" className={cls('otherInterest')} placeholder="Tell us what you'd like to build" maxLength={120}
                value={form.otherInterest} onChange={(e) => set('otherInterest', e.target.value)} onBlur={() => blur('otherInterest')} />
            </Field>
          )}

          {serverError && <div className="banner error">{serverError}</div>}

          <button className="btn block" type="submit" disabled={status === 'submitting' || !isSupabaseConfigured}>
            {status === 'submitting' ? <span className="spinner" /> : 'Register →'}
          </button>
        </form>

        <div className="screen-foot mono sm c-muted">
          <span>UPES // HYPERVISION</span>
          <span>STEP 01/05</span>
        </div>
      </div>
    </div>
  )
}
