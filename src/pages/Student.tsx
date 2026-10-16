import { useCallback, useEffect, useState } from 'react'
import { Loading, TopBar } from '../components/Shell'
import { ApiError, errMsg, fetchMentors, getToken, rpc, session, type Mentor, type Status } from '../lib/api'
import { go } from '../App'
import Select, { decorate } from './Select'
import Quiz from './Quiz'
import { RANKS } from '../lib/mentorStyle'
import { sfx } from '../audio/sfx'

export default function Student() {
  const token = getToken()
  const [status, setStatus] = useState<Status | null>(null)
  const [mentors, setMentors] = useState<Mentor[] | null>(null)
  const [error, setError] = useState('')

  const logout = () => {
    session.clear()
    go('/login')
  }

  const load = useCallback(async () => {
    if (!token) return go('/login')
    setError('')
    try {
      setStatus(await rpc<Status>('student_status', { p_token: token }))
    } catch (e) {
      if (e instanceof ApiError && e.code === 'INVALID_SESSION') return logout()
      setError(errMsg(e))
    }
  }, [token])

  useEffect(() => {
    load()
    fetchMentors().then(setMentors).catch((e) => setError(errMsg(e)))
  }, [load])

  if (error)
    return (
      <div className="screen">
        <div className="col">
          <TopBar left="SYS.ERROR" />
          <div className="banner error" style={{ marginTop: 40 }}>{error}</div>
          <button className="btn block" onClick={load}>Try again</button>
        </div>
      </div>
    )
  if (!status || !token) return <div className="screen"><Loading text="CONNECTING" /></div>

  if (status.stage === 'done') return <Complete status={status} mentors={mentors} onLogout={logout} />

  if (!status.quiz_open)
    return (
      <div className="screen">
        <div className="col">
          <TopBar left="STANDBY" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 70 }}>
            <span className="mono md c-teal" style={{ letterSpacing: '.2em' }}>// CHANNEL CLOSED</span>
            <h1 className="display d-lg glitch">Quiz<br /><span className="caret">offline</span></h1>
            <p className="lede">The quiz isn't open right now. Wait for the Hypervision team to open it, then refresh.</p>
          </div>
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="btn block tall" onClick={load}>Refresh</button>
            <button className="btn-outline" onClick={logout}>Log out</button>
          </div>
        </div>
      </div>
    )

  if (status.stage === 'choose') return <Select token={token} mentors={mentors} onSaved={load} />

  return <Quiz token={token} status={status} mentors={mentors} onFinished={load} />
}

function Complete({ status, mentors, onLogout }: { status: Status; mentors: Mentor[] | null; onLogout: () => void }) {
  useEffect(() => {
    const t = setTimeout(() => sfx.mission(), 300)
    return () => clearTimeout(t)
  }, [])
  const dm = mentors ? decorate(mentors) : []
  const picks = (status.choices ?? []).map((id) => dm.find((m) => m.id === id))
  const bits = [
    [-150, -220, 200, '#C9A66B'], [140, -240, -160, '#6FA6A1'], [-170, 40, 120, '#B4645A'], [165, 60, -220, '#C9A66B'],
    [-60, -280, 90, '#9C8399'], [70, -290, -90, '#7C93B0'], [-120, 200, 300, '#8FA88A'], [110, 220, -300, '#6FA6A1'],
    [-185, -110, 45, '#B4645A'], [185, -120, -45, '#C9A66B'], [20, 260, 180, '#9C8399'], [-20, -310, -180, '#6FA6A1'],
  ] as const
  return (
    <div className="screen">
      <div className="bits" aria-hidden>
        {bits.map(([x, y, r, c], i) => (
          <span key={i} className="bit" style={{ ['--x' as string]: `${x}px`, ['--y' as string]: `${y}px`, ['--r' as string]: `${r}deg`, background: c, animationDelay: `${(i % 4) * 0.05}s` }} />
        ))}
      </div>
      <div className="col" style={{ position: 'relative' }}>
        <TopBar left="STEP 05/05 · DONE" />
        <div className="center-card" style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 80 }}>
          <span className="mono md c-sage" style={{ letterSpacing: '.24em' }}>[ ALL SYSTEMS GREEN ]</span>
          <h1 className="display glitch c-amber" style={{ fontSize: 'clamp(64px, 21vw, 116px)', lineHeight: 0.78 }}>Mission<br />complete</h1>
          <p className="lede" style={{ color: 'var(--text-2)', maxWidth: 340 }}>
            Well done, {status.name.split(' ')[0]}. All 3 parts are in. The Hypervision team will announce the mentor teams soon.
          </p>
        </div>
        {picks.length === 3 && (
          <div className="done-picks">
            {picks.map((m, k) => (
              <div key={k} style={{ background: m?.accent ?? 'var(--panel)' }}>
                <span className="mono sm" style={{ fontWeight: 700, letterSpacing: '.06em' }}>{RANKS[k]} ✓</span>
                <span className="n">{m?.first ?? '—'}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="mono sm c-muted" style={{ textAlign: 'center' }}>YOU CAN CLOSE THIS TAB SAFELY</span>
          <button className="btn-outline" style={{ height: 52 }} onClick={onLogout}>Log out</button>
        </div>
      </div>
    </div>
  )
}
