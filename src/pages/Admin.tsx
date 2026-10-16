import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Field, Loading, MuteToggle } from '../components/Shell'
import { ApiError, errMsg, rpc } from '../lib/api'
import { allocate, type AllocationResult, type MentorSlot, type Placement, type StudentResult } from '../lib/allocate'
import { accentFor, pad2 } from '../lib/mentorStyle'

// ── Types returned by the admin functions ──────────────────────────────
type MentorRow = MentorSlot & {
  active: boolean
  skill_count: number
  interest_count: number
  interest_missing: number
  picked_first: number
  picked_any: number
}
type Overview = {
  quiz_open: boolean
  question_seconds: number
  registered: number
  chose: number
  finished: number
  teams_generated_at: string | null
  mentors: MentorRow[]
}
type Interests = {
  keys: { qkey: string; prompt: string; options: string[] }[]
  answers: { mentor_id: string; qkey: string; answer: number }[]
}
type Result = StudentResult & { email: string; phone: string; year: number }
type SavedTeam = { sap_id: string; mentor_id: string; via: Placement['via']; score: number | null; created_at: string }

const PW_KEY = 'cc_admin_pw'
const readPw = () => {
  try {
    return sessionStorage.getItem(PW_KEY) ?? ''
  } catch {
    return ''
  }
}
const savePw = (pw: string) => {
  try {
    if (pw) sessionStorage.setItem(PW_KEY, pw)
    else sessionStorage.removeItem(PW_KEY)
  } catch {
    /* ignore */
  }
}

export default function Admin() {
  const [pw, setPw] = useState(readPw)
  const [ok, setOk] = useState(false)
  const [checking, setChecking] = useState(!!readPw())

  useEffect(() => {
    if (!pw) return
    rpc('admin_login', { p_pw: pw })
      .then(() => setOk(true))
      .catch(() => {
        savePw('')
        setPw('')
      })
      .finally(() => setChecking(false))
    // only on first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const logout = () => {
    savePw('')
    setPw('')
    setOk(false)
  }

  if (checking) return <div className="screen"><Loading /></div>
  if (!ok)
    return (
      <AdminLogin
        onOk={(p) => {
          savePw(p)
          setPw(p)
          setOk(true)
        }}
      />
    )
  return <Dashboard pw={pw} onAuthFail={logout} onLogout={logout} />
}

function AdminLogin({ onOk }: { onOk: (pw: string) => void }) {
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await rpc('admin_login', { p_pw: pw })
      onOk(pw)
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="screen">
      <div className="col">
        <div className="topbar">
          <span className="mono c-muted">// ADMIN CONSOLE</span>
          <MuteToggle />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 40 }}>
          <span className="mono md c-amber" style={{ letterSpacing: '.2em' }}>&gt; HYPERVISION TEAM ONLY</span>
          <h1 className="display d-md glitch">Admin<br />access</h1>
        </div>
        <form className="brk panel" onSubmit={submit}>
          <div className="panel-head mono sm c-muted"><span>// ADMIN_TERMINAL</span><span className="c-sage">● SECURE</span></div>
          <Field label="Admin password" htmlFor="pw" error={error || undefined}>
            <input id="pw" type="password" className={`input ${error ? 'is-invalid' : ''}`} value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
          </Field>
          <button className="btn block" disabled={busy || !pw}>{busy ? <span className="spinner" /> : 'Enter console →'}</button>
        </form>
      </div>
    </div>
  )
}

type Tab = 'control' | 'interests' | 'teams' | 'students'
type Call = <T>(fn: string, args?: Record<string, unknown>) => Promise<T>

function Dashboard({ pw, onAuthFail, onLogout }: { pw: string; onAuthFail: () => void; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('control')
  const [ov, setOv] = useState<Overview | null>(null)
  const [error, setError] = useState('')

  const call = useCallback(
    async <T,>(fn: string, args: Record<string, unknown> = {}): Promise<T> => {
      try {
        return await rpc<T>(fn, { p_pw: pw, ...args })
      } catch (e) {
        if (e instanceof ApiError && e.code === 'BAD_PASSWORD') onAuthFail()
        throw e
      }
    },
    [pw, onAuthFail],
  )

  const loadOverview = useCallback(async () => {
    try {
      setOv(await call<Overview>('admin_overview'))
      setError('')
    } catch (e) {
      setError(errMsg(e))
    }
  }, [call])

  useEffect(() => {
    loadOverview()
  }, [loadOverview])

  // accent per mentor follows the overview order (same as the student roster)
  const accents = useMemo(() => Object.fromEntries((ov?.mentors ?? []).map((m, i) => [m.id, accentFor(null, i)])), [ov?.mentors])

  return (
    <div className="admin">
      <header className="admin-head">
        <div className="admin-head-in">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
            <span className="brand-name" style={{ fontSize: 28 }}>CODE CONNECT<span className="caret">_</span></span>
            <span className="mono c-muted">// ADMIN CONSOLE</span>
          </div>
          <nav className="admin-nav" aria-label="Admin sections">
            {(
              [
                ['control', 'Control'],
                ['interests', 'Interests'],
                ['teams', 'Teams'],
                ['students', 'Students'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} className={`nav-btn ${tab === k ? 'on' : ''}`} aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
            <button className="btn-outline sm" onClick={onLogout}>Sign out</button>
          </nav>
        </div>
      </header>

      <main className="admin-main">
        {error && <div className="banner error">{error}</div>}
        {!ov ? (
          !error && <Loading />
        ) : (
          <>
            {tab === 'control' && <ControlTab ov={ov} call={call} refresh={loadOverview} accents={accents} />}
            {tab === 'interests' && <InterestsTab ov={ov} call={call} onSaved={loadOverview} accents={accents} />}
            {tab === 'teams' && <TeamsTab ov={ov} call={call} refresh={loadOverview} accents={accents} />}
            {tab === 'students' && <StudentsTab ov={ov} call={call} refresh={loadOverview} />}
          </>
        )}
      </main>
    </div>
  )
}

function SecHead({ n, title, sub, children }: { n: string; title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="sec-head">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="mono c-teal">// {n}</span>
        <h2>{title}</h2>
        {sub && <span className="a-sub">{sub}</span>}
      </div>
      {children && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{children}</div>}
    </div>
  )
}

function ControlTab({ ov, call, refresh, accents }: { ov: Overview; call: Call; refresh: () => void; accents: Record<string, string> }) {
  const [busy, setBusy] = useState(false)
  const active = ov.mentors.filter((m) => m.active)
  const seats = active.reduce((a, m) => a + m.max_team, 0)
  const missing = active.filter((m) => m.interest_missing > 0)
  const pct = ov.registered ? Math.round((ov.chose / ov.registered) * 100) : 0

  async function toggle() {
    setBusy(true)
    try {
      await call('admin_set_quiz_open', { p_open: !ov.quiz_open })
      refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <section className="a-grid">
        <div className="a-card span brk">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="mono c-muted">QUIZ STATUS</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className={`status-dot ${ov.quiz_open ? 'live' : ''}`} />
              <span className="a-num" style={{ fontSize: 48 }}>{ov.quiz_open ? 'OPEN' : 'CLOSED'}</span>
            </div>
            <span className="a-sub">{ov.quiz_open ? 'Students can pick mentors and take the quiz.' : 'Students see "quiz offline". Nobody can pick or answer.'}</span>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className={`btn-outline ${ov.quiz_open ? 'clay' : 'amber'}`} onClick={toggle} disabled={busy}>
              {ov.quiz_open ? 'Close quiz' : 'Open quiz'}
            </button>
            <button className="btn-outline" onClick={refresh}>Refresh</button>
          </div>
        </div>
        <Stat label="Registered" value={ov.registered} sub="students" />
        <Stat label="Picks locked" value={ov.chose} sub={`${pct}% of registered`} />
        <Stat label="Quiz complete" value={ov.finished} sub="all 3 parts submitted" />
        <Stat label="Team seats" value={seats} sub={ov.chose > seats ? 'Not enough seats for everyone' : `${active.length} mentors × up to 8`} bad={ov.chose > seats} />
      </section>

      {missing.length > 0 && (
        <div className="banner warn">
          Interest answers are missing for {missing.map((m) => m.name).join(', ')}. Their interest questions score 0 until you fill them in under Interests.
        </div>
      )}

      <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SecHead n="01" title="Mentors" />
        <div className="a-table-wrap">
          <table className="a-table">
            <thead>
              <tr><th>#</th><th>Mentor</th><th>1st choice of</th><th>Picked by</th><th>Questions</th><th>Team size (min – max)</th></tr>
            </thead>
            <tbody>
              {ov.mentors.map((m, i) => (
                <tr key={m.id} style={{ opacity: m.active ? 1 : 0.5 }}>
                  <td className="num c-muted">{pad2(i + 1)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="dot" style={{ background: accents[m.id] }} />
                      <span style={{ fontWeight: 700 }}>{m.name}</span>
                      {!m.active && <span className="pill">inactive</span>}
                    </div>
                  </td>
                  <td className="num">{m.picked_first}</td>
                  <td className="num">{m.picked_any}</td>
                  <td>
                    {m.skill_count} skill + {m.interest_count} interest
                    {m.interest_missing > 0 && <span className="pill warn">{m.interest_missing} unset</span>}
                  </td>
                  <td><TeamSizeCell m={m} call={call} onSaved={refresh} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

/** Inline editor for a mentor's min / max team size. */
function TeamSizeCell({ m, call, onSaved }: { m: MentorRow; call: Call; onSaved: () => void }) {
  const [min, setMin] = useState(String(m.min_team))
  const [max, setMax] = useState(String(m.max_team))
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [err, setErr] = useState('')
  useEffect(() => {
    setMin(String(m.min_team))
    setMax(String(m.max_team))
  }, [m.min_team, m.max_team])
  const changed = min !== String(m.min_team) || max !== String(m.max_team)
  const lo = Number(min), hi = Number(max)
  const valid = min !== '' && max !== '' && Number.isInteger(lo) && Number.isInteger(hi) && lo >= 0 && hi >= 1 && lo <= hi && hi <= 50

  async function save() {
    setState('saving')
    setErr('')
    try {
      await call('admin_set_team_size', { p_mentor: m.id, p_min: lo, p_max: hi })
      setState('saved')
      onSaved()
    } catch (e) {
      setState('error')
      setErr(errMsg(e))
    }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <label className="sr-only" htmlFor={`min-${m.id}`}>Minimum team size for {m.name}</label>
        <input id={`min-${m.id}`} className="input size-in" type="number" min={0} max={50} value={min}
          onChange={(e) => { setMin(e.target.value); setState('idle') }} />
        <span className="c-muted">–</span>
        <label className="sr-only" htmlFor={`max-${m.id}`}>Maximum team size for {m.name}</label>
        <input id={`max-${m.id}`} className="input size-in" type="number" min={1} max={50} value={max}
          onChange={(e) => { setMax(e.target.value); setState('idle') }} />
        {changed && (
          <button className="btn-outline sm amber" onClick={save} disabled={!valid || state === 'saving'}>
            {state === 'saving' ? 'Saving…' : 'Save'}
          </button>
        )}
        {!changed && state === 'saved' && <span className="mono sm c-sage">SAVED</span>}
      </div>
      {changed && !valid && <span className="a-sub bad">Min 0+, max 1–50, min ≤ max.</span>}
      {state === 'error' && <span className="a-sub bad">{err}</span>}
    </div>
  )
}

function Stat({ label, value, sub, bad }: { label: string; value: number; sub: string; bad?: boolean }) {
  return (
    <div className="a-card">
      <span className="mono c-muted">{label}</span>
      <span className="a-num">{value}</span>
      <span className={`a-sub ${bad ? 'bad' : ''}`}>{sub}</span>
    </div>
  )
}

function InterestsTab({ ov, call, onSaved, accents }: { ov: Overview; call: Call; onSaved: () => void; accents: Record<string, string> }) {
  const [data, setData] = useState<Interests | null>(null)
  const [saving, setSaving] = useState<string>('')
  const [error, setError] = useState('')

  useEffect(() => {
    call<Interests>('admin_interests').then(setData).catch((e) => setError(errMsg(e)))
  }, [call])

  if (!data) return error ? <div className="banner error">{error}</div> : <Loading />
  const get = (m: string, k: string) => data.answers.find((a) => a.mentor_id === m && a.qkey === k)?.answer

  async function set(m: string, k: string, v: string) {
    const answer = v === '' ? null : Number(v)
    setSaving(`${m}:${k}`)
    setError('')
    try {
      await call('admin_set_interest', { p_mentor: m, p_qkey: k, p_answer: answer })
      setData((d) =>
        d && {
          ...d,
          answers: [
            ...d.answers.filter((a) => !(a.mentor_id === m && a.qkey === k)),
            ...(answer === null ? [] : [{ mentor_id: m, qkey: k, answer }]),
          ],
        },
      )
      onSaved()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setSaving('')
    }
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SecHead
        n="02"
        title="Mentor interests"
        sub="Copy each mentor's answers from the Google Form sheet. Matching student answer: +4 plus speed bonus. Non-matching: −1. Changes save instantly."
      />
      {error && <div className="banner error">{error}</div>}
      <div className="int-grid">
        {ov.mentors.filter((m) => m.active).map((m) => {
          const unset = data.keys.filter((k) => get(m.id, k.qkey) === undefined).length
          return (
            <article key={m.id} className="int-card">
              <div className="hd" style={{ background: accents[m.id] }}>
                <span className="n">{m.name.split(' ')[0]}</span>
                <span className="mono sm" style={{ fontWeight: 700 }}>{unset ? `${unset} UNSET` : 'ALL SET'}</span>
              </div>
              <div className="bd">
                {data.keys.map((k) => (
                  <label key={k.qkey}>
                    {k.prompt}
                    <select
                      className={`input ${get(m.id, k.qkey) === undefined ? 'unset' : ''}`}
                      value={get(m.id, k.qkey) ?? ''}
                      disabled={saving === `${m.id}:${k.qkey}`}
                      onChange={(e) => set(m.id, k.qkey, e.target.value)}
                    >
                      <option value="">— not set —</option>
                      {k.options.map((o, i) => <option key={i} value={i}>{o}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function TeamsTab({ ov, call, refresh, accents }: { ov: Overview; call: Call; refresh: () => void; accents: Record<string, string> }) {
  const [results, setResults] = useState<Result[] | null>(null)
  const [saved, setSaved] = useState<SavedTeam[] | null>(null)
  const [draft, setDraft] = useState<AllocationResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    try {
      const [r, t] = await Promise.all([call<Result[]>('admin_results'), call<SavedTeam[]>('admin_get_teams')])
      setResults(r)
      setSaved(t)
    } catch (e) {
      setError(errMsg(e))
    }
  }, [call])

  useEffect(() => {
    load()
  }, [load])

  const people = useMemo(() => Object.fromEntries((results ?? []).map((r) => [r.sap_id, r])), [results])

  async function generate() {
    setBusy(true)
    setError('')
    setMsg('')
    try {
      if (ov.quiz_open) {
        await call('admin_set_quiz_open', { p_open: false })
        refresh()
      }
      const [r, ints] = await Promise.all([call<Result[]>('admin_results'), call<Interests>('admin_interests')])
      setResults(r)
      const mi: Record<string, Record<string, number>> = {}
      for (const a of ints.answers) (mi[a.mentor_id] ??= {})[a.qkey] = a.answer
      setDraft(allocate(ov.mentors.filter((m) => m.active), r, mi))
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!draft) return
    setBusy(true)
    setError('')
    try {
      await call('admin_save_teams', {
        p_rows: draft.placements.map((p) => ({ sap_id: p.sap_id, mentor_id: p.mentor_id, via: p.via, score: p.score })),
      })
      await load()
      setDraft(null)
      setMsg('Teams saved.')
      refresh()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  if (!results || !saved) return error ? <div className="banner error">{error}</div> : <Loading />

  const shown: Placement[] = draft ? draft.placements : saved
  const unfinished = results.filter((r) => !r.finished).length
  const count = (mid: string) => shown.filter((p) => p.mentor_id === mid).length
  const activeM = ov.mentors.filter((m) => m.active)
  const underMin = activeM.filter((m) => count(m.id) < m.min_team)
  const overMax = activeM.filter((m) => count(m.id) > m.max_team)

  // Put an unplaced student into a team (preview only, before saving).
  function addUnplaced(sap: string, mentorId: string) {
    if (!draft) return
    setDraft({
      ...draft,
      unplaced: draft.unplaced.filter((x) => x !== sap),
      placements: [...draft.placements, { sap_id: sap, mentor_id: mentorId, via: 'manual', score: people[sap]?.scores[mentorId] ?? null }],
    })
  }

  // Move a student to another mentor's team. Preview → changes the preview only; saved teams → saved straight away.
  async function move(sap: string, mentorId: string) {
    const name = people[sap]?.name ?? sap
    const to = ov.mentors.find((m) => m.id === mentorId)?.name ?? mentorId
    setError('')
    setMsg('')
    if (draft) {
      setDraft({
        ...draft,
        placements: draft.placements.map((p) =>
          p.sap_id === sap ? { ...p, mentor_id: mentorId, via: 'manual', score: people[sap]?.scores[mentorId] ?? null } : p,
        ),
      })
      setMsg(`${name} moved to ${to} in the preview. Save teams to keep it.`)
      return
    }
    setBusy(true)
    try {
      await call('admin_move_student', { p_sap: sap, p_mentor: mentorId })
      await load()
      setMsg(`${name} moved to ${to}.`)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  function exportCsv() {
    const rows = [['Mentor', 'Student', 'SAP ID', 'Email', 'Phone', 'Year', 'Placed via', 'Score in mentor quiz']]
    for (const m of ov.mentors)
      for (const p of shown.filter((x) => x.mentor_id === m.id)) {
        const s = people[p.sap_id]
        rows.push([m.name, s?.name ?? '', p.sap_id, s?.email ?? '', s?.phone ?? '', String(s?.year ?? ''), VIA[p.via], p.score == null ? '' : String(p.score)])
      }
    if (draft) for (const sap of draft.unplaced) rows.push(['UNPLACED', people[sap]?.name ?? '', sap, people[sap]?.email ?? '', people[sap]?.phone ?? '', '', '', ''])
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'code-connect-teams.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const sub = draft
    ? 'Preview, not saved yet. Check the teams, then save. Only admins can see teams.'
    : saved.length
      ? `Last generated ${new Date(saved[0].created_at).toLocaleString()} · students cannot see this`
      : `${results.length} students picked mentors (${unfinished} haven't finished).`

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SecHead n="03" title={draft ? 'Teams · preview' : 'Teams'} sub={sub}>
        {draft ? (
          <>
            <button className="btn-outline" onClick={() => setDraft(null)} disabled={busy}>Discard</button>
            <button className="btn" style={{ height: 48, fontSize: 20 }} onClick={save} disabled={busy}>Save teams</button>
          </>
        ) : (
          <button className="btn" style={{ height: 48, fontSize: 20 }} onClick={generate} disabled={busy || results.length === 0}>
            {busy ? <span className="spinner" /> : ov.quiz_open ? 'End quiz & create teams' : saved.length ? 'Re-create teams' : 'Create teams'}
          </button>
        )}
        {shown.length > 0 && <button className="btn-outline teal" onClick={exportCsv}>Export CSV ↓</button>}
      </SecHead>

      {ov.quiz_open && !draft && <div className="banner warn">Creating teams will end the quiz for all students first.</div>}
      {msg && <div className="banner ok">{msg}</div>}
      {error && <div className="banner error">{error}</div>}
      {draft && unfinished > 0 && <div className="banner warn">{unfinished} student(s) didn't finish. They are placed using the points they scored.</div>}
      {shown.length > 0 && underMin.length > 0 && (
        <div className="banner warn">Below the minimum team size: {underMin.map((m) => `${m.name} (${count(m.id)}/${m.min_team})`).join(', ')}</div>
      )}
      {shown.length > 0 && overMax.length > 0 && (
        <div className="banner warn">Above the maximum team size: {overMax.map((m) => `${m.name} (${count(m.id)}/${m.max_team})`).join(', ')}</div>
      )}

      <div className="team-grid">
        {ov.mentors
          .filter((m) => m.active || shown.some((p) => p.mentor_id === m.id))
          .map((m) => {
            const members = shown
              .filter((p) => p.mentor_id === m.id)
              .sort((a, b) => VIA_ORDER[a.via] - VIA_ORDER[b.via] || (b.score ?? -99) - (a.score ?? -99))
            return (
              <article key={m.id} className="team">
                <div className="hd" style={{ background: accents[m.id] }}>
                  <span className="n">{m.name.split(' ')[0]}</span>
                  <span className="mono sm" style={{ fontWeight: 700 }}>
                    {members.length}/{m.max_team}{members.length < m.min_team ? ' · UNDER MIN' : members.length > m.max_team ? ' · OVER MAX' : ''}
                  </span>
                </div>
                {members.length === 0 ? (
                  <ul><li className="c-muted">No students yet.</li></ul>
                ) : (
                  <ul>
                    {members.map((p) => (
                      <li key={p.sap_id} className="member">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                          <span>{people[p.sap_id]?.name ?? p.sap_id}</span>
                          <span className="meta" style={{ textAlign: 'left' }}>{VIA[p.via]} · {p.score == null ? '—' : `${round(p.score)} pts`}</span>
                        </div>
                        <label className="sr-only" htmlFor={`move-${p.sap_id}`}>Move {people[p.sap_id]?.name ?? p.sap_id} to another team</label>
                        <select id={`move-${p.sap_id}`} className="input move-sel" value="" disabled={busy}
                          onChange={(e) => e.target.value && move(p.sap_id, e.target.value)}>
                          <option value="">Move to…</option>
                          {ov.mentors.filter((x) => x.active && x.id !== m.id).map((x) => (
                            <option key={x.id} value={x.id}>{x.name.split(' ')[0]} ({count(x.id)}/{x.max_team})</option>
                          ))}
                        </select>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            )
          })}
        {draft && draft.unplaced.length > 0 && (
          <article className="team empty-team">
            <span className="mono c-clay">UNASSIGNED · {draft.unplaced.length}</span>
            <span style={{ fontSize: 14, color: 'var(--text-2)' }}>All teams were full. Raise a team size, or add them to a team here (preview only).</span>
            <ul style={{ padding: 0 }}>
              {draft.unplaced.map((sap) => (
                <li key={sap} className="member">
                  <span>{people[sap]?.name ?? sap} <span className="meta">{sap}</span></span>
                  <label className="sr-only" htmlFor={`add-${sap}`}>Add {people[sap]?.name ?? sap} to a team</label>
                  <select id={`add-${sap}`} className="input move-sel" value="" onChange={(e) => e.target.value && addUnplaced(sap, e.target.value)}>
                    <option value="">Add to…</option>
                    {activeM.map((x) => <option key={x.id} value={x.id}>{x.name.split(' ')[0]} ({count(x.id)}/{x.max_team})</option>)}
                  </select>
                </li>
              ))}
            </ul>
          </article>
        )}
      </div>
    </section>
  )
}

function StudentsTab({ ov, call, refresh }: { ov: Overview; call: Call; refresh: () => void }) {
  const [results, setResults] = useState<Result[] | null>(null)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState('')
  const [q, setQ] = useState('')

  const load = useCallback(() => {
    call<Result[]>('admin_results').then(setResults).catch((e) => setError(errMsg(e)))
  }, [call])
  useEffect(load, [load])

  const name = Object.fromEntries(ov.mentors.map((m) => [m.id, m.name.split(' ')[0]]))
  if (!results) return error ? <div className="banner error">{error}</div> : <Loading />
  const list = results.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()) || r.sap_id.includes(q))

  async function reset(sap: string) {
    if (confirm !== sap) return setConfirm(sap)
    setConfirm('')
    try {
      await call('admin_reset_student', { p_sap: sap })
      load()
      refresh()
    } catch (e) {
      setError(errMsg(e))
    }
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SecHead n="04" title="Students" sub={`${results.length} picked mentors · Reset deletes a student's picks and answers so they can start again.`}>
        <label className="sr-only" htmlFor="student-search">Search students</label>
        <input id="student-search" className="input search" placeholder="Search name or SAP ID" value={q} onChange={(e) => setQ(e.target.value)} />
      </SecHead>
      {error && <div className="banner error">{error}</div>}
      <div className="a-table-wrap">
        <table className="a-table">
          <thead>
            <tr><th>Student</th><th>SAP ID</th><th>1st</th><th>2nd</th><th>3rd</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.sap_id}>
                <td style={{ fontWeight: 600 }}>{r.name}</td>
                <td className="num c-muted">{r.sap_id}</td>
                {r.choices.map((m) => (
                  <td key={m}>
                    {name[m] ?? m} <span className="mono-cell c-muted" style={{ fontSize: 12 }}>{round(r.scores[m] ?? 0)}</span>
                  </td>
                ))}
                <td>{r.finished ? <span className="pill ok">Finished</span> : <span className="pill" style={{ marginLeft: 0 }}>In progress</span>}</td>
                <td>
                  <button className="linkish" style={{ color: 'var(--clay)' }} onClick={() => reset(r.sap_id)}>
                    {confirm === r.sap_id ? 'Click again to reset' : 'Reset'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

const VIA: Record<Placement['via'], string> = {
  choice1: '1st choice',
  choice2: '2nd choice',
  choice3: '3rd choice',
  interest: 'Interest match',
  manual: 'Moved by admin',
}
const VIA_ORDER: Record<Placement['via'], number> = { choice1: 0, choice2: 1, choice3: 2, interest: 3, manual: 4 }
const round = (n: number) => Math.round(n * 100) / 100
