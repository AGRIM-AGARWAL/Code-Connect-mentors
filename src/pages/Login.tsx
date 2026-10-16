import { useState, type FormEvent } from 'react'
import { Field, TopBar } from '../components/Shell'
import { errMsg, rpc, session } from '../lib/api'
import { isSupabaseConfigured } from '../lib/supabase'
import { sfx, unlockAudio } from '../audio/sfx'
import { go } from '../App'

const SAP_RE = /^5900\d{5}$/

export default function Login() {
  const [sap, setSap] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<{ field: 'sap' | 'email' | 'form'; msg: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    unlockAudio()
    setError(null)
    if (!SAP_RE.test(sap)) return setError({ field: 'sap', msg: 'SAP ID must be 9 digits starting with 5900.' })
    if (!email.trim()) return setError({ field: 'email', msg: 'Enter your college email.' })
    setBusy(true)
    try {
      const r = await rpc<{ token: string }>('student_login', { p_sap: sap, p_email: email.trim().toLowerCase() })
      session.set(r.token)
      sfx.submit()
      go('/student')
    } catch (err) {
      setError({ field: 'form', msg: errMsg(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <div className="col">
        <TopBar left="STEP 01/05 · AUTH" />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
          <span className="mono md c-teal" style={{ letterSpacing: '.2em' }}>
            &gt; ACCESS REQUESTED<span className="blink">_</span>
          </span>
          <h1 className="display d-md glitch">
            Access
            <br />
            <span className="caret">//</span> Code
            <br />
            Connect
          </h1>
          <p className="lede">Log in with your SAP ID and college email.</p>
        </div>

        <form className="brk panel" onSubmit={onSubmit} noValidate>
          <div className="panel-head mono sm c-muted">
            <span>// TERMINAL_01</span>
            <span className="c-sage">● SECURE</span>
          </div>

          {!isSupabaseConfigured && <div className="banner warn">Supabase env vars are missing, so login is disabled.</div>}

          <Field label="SAP ID" htmlFor="sap" error={error?.field === 'sap' ? error.msg : undefined}>
            <input
              id="sap"
              className={`input mono-in ${error?.field === 'sap' ? 'is-invalid' : ''}`}
              placeholder="5900XXXXX"
              inputMode="numeric"
              autoComplete="username"
              aria-invalid={error?.field === 'sap'}
              value={sap}
              onChange={(e) => setSap(e.target.value.replace(/\D/g, '').slice(0, 9))}
            />
          </Field>

          <Field label="College email" htmlFor="email" error={error?.field === 'email' || error?.field === 'form' ? error.msg : undefined}>
            <input
              id="email"
              type="email"
              className={`input ${error?.field === 'email' || error?.field === 'form' ? 'is-invalid' : ''}`}
              placeholder="name.xxxxx@stu.upes.ac.in"
              autoComplete="email"
              aria-invalid={error?.field === 'email'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          <button className="btn block" type="submit" disabled={busy || !isSupabaseConfigured}>
            {busy ? <span className="spinner" /> : 'Enter system →'}
          </button>
        </form>

        <p style={{ textAlign: 'center', margin: 0, color: 'var(--muted)' }}>
          New here? <a href="#/register" style={{ fontWeight: 700 }}>Create access</a>
        </p>

        <div className="screen-foot mono sm c-muted">
          <span>UPES // HYPERVISION</span>
          <span>NODE_CC01</span>
        </div>
      </div>
    </div>
  )
}
