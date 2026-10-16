import { useCallback, useEffect, useRef, useState } from 'react'
import { Loading, MuteToggle, PhotoTile, TopBar, useMagnetic } from '../components/Shell'
import { ApiError, errMsg, rpc, type Mentor, type NextQuestion, type Question, type Status } from '../lib/api'
import { RANKS } from '../lib/mentorStyle'
import { decorate } from './Select'
import { sfx, unlockAudio } from '../audio/sfx'

type View =
  | { t: 'brief' }
  | { t: 'loading' }
  | { t: 'question'; q: Question; deadline: number }
  | { t: 'between'; finishedPart: number; count: number }
  | { t: 'closed' }
  | { t: 'error'; msg: string }

const KEYS = ['A', 'B', 'C', 'D', 'E', 'F']
const STEEL = '#7C93B0'

const startedKey = (sap: string) => `cc_started_${sap}`
const wasStarted = (sap: string) => {
  try {
    return localStorage.getItem(startedKey(sap)) === '1'
  } catch {
    return false
  }
}

export default function Quiz({ token, status, mentors, onFinished }: { token: string; status: Status; mentors: Mentor[] | null; onFinished: () => void }) {
  const [view, setView] = useState<View>({ t: 'brief' })
  const [choice, setChoice] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(Date.now())
  const submitting = useRef(false)
  const lastTick = useRef(-1)

  const dm = mentors ? decorate(mentors) : []
  const squad = (status.choices ?? []).map((id) => dm.find((m) => m.id === id))
  const byId = (id: string) => dm.find((m) => m.id === id)

  const fetchNext = useCallback(async () => {
    unlockAudio()
    try {
      localStorage.setItem(startedKey(status.sap_id), '1')
    } catch {
      /* ignore */
    }
    setView({ t: 'loading' })
    setChoice(null)
    lastTick.current = -1
    try {
      const r = await rpc<NextQuestion>('next_question', { p_token: token })
      if ('done' in r) return onFinished()
      if ('closed' in r) return setView({ t: 'closed' })
      const t = Date.now()
      setNow(t)
      setView({ t: 'question', q: r, deadline: t + r.seconds_left * 1000 })
    } catch (e) {
      setView({ t: 'error', msg: errMsg(e) })
    }
  }, [token, onFinished, status.sap_id])

  const submit = useCallback(
    async (q: Question, c: number | null) => {
      if (submitting.current) return
      submitting.current = true
      setBusy(true)
      sfx.submit()
      const done = () => {
        submitting.current = false
        setBusy(false)
      }
      try {
        await rpc('submit_answer', { p_token: token, p_question_id: q.id, p_choice: c })
      } catch (e) {
        // already recorded (e.g. timed out on the server) → just move on
        if (!(e instanceof ApiError && e.code === 'NOT_CURRENT_QUESTION')) {
          done()
          return setView(e instanceof ApiError && e.code === 'QUIZ_CLOSED' ? { t: 'closed' } : { t: 'error', msg: errMsg(e) })
        }
      }
      done()
      // end of a part (but not the last one) → checkpoint screen
      if (q.index_in_part === q.part_total && q.number < q.total) {
        sfx.partChime()
        setView({ t: 'between', finishedPart: q.part, count: q.part_total })
      } else {
        fetchNext()
      }
    },
    [token, fetchNext],
  )

  // timer tick + auto-skip at 0
  useEffect(() => {
    if (view.t !== 'question') return
    const id = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(id)
  }, [view.t])

  useEffect(() => {
    if (view.t !== 'question') return
    const left = Math.ceil((view.deadline - now) / 1000)
    if (left <= 5 && left >= 1 && left !== lastTick.current) {
      lastTick.current = left
      sfx.tick()
    }
    if (now >= view.deadline && !submitting.current) submit(view.q, null)
  }, [now, view, submit])

  // keyboard: A–D pick, Enter locks
  const keyState = useRef({ view, choice, submit })
  keyState.current = { view, choice, submit }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { view: v, choice: c, submit: s } = keyState.current
      if (v.t !== 'question' || submitting.current) return
      const i = KEYS.indexOf(e.key.toUpperCase())
      if (i > -1 && i < v.q.options.length) {
        setChoice(i)
        e.preventDefault()
      }
      if (e.key === 'Enter' && c !== null && !(e.target as Element)?.closest?.('button')) {
        e.preventDefault()
        s(v.q, c)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (view.t === 'brief') return <Briefing squad={squad} seconds={status.question_seconds} started={wasStarted(status.sap_id)} onStart={fetchNext} />

  if (view.t === 'loading') return <div className="screen"><Loading text="INCOMING" /></div>

  if (view.t === 'closed')
    return (
      <div className="screen">
        <div className="col">
          <TopBar left="CHANNEL CLOSED" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 70 }}>
            <span className="mono md c-clay" style={{ letterSpacing: '.2em' }}>// TRANSMISSION ENDED</span>
            <h1 className="display d-lg glitch">Quiz<br /><span className="caret">closed</span></h1>
            <p className="lede">The Hypervision team has ended the quiz. Your answers so far are saved.</p>
          </div>
        </div>
      </div>
    )

  if (view.t === 'error')
    return (
      <div className="screen">
        <div className="col">
          <TopBar left="SYS.ERROR" />
          <div className="banner error" style={{ marginTop: 40 }}>{view.msg}</div>
          <button className="btn block" onClick={fetchNext}>Try again</button>
        </div>
      </div>
    )

  if (view.t === 'between') {
    const done = squad[view.finishedPart - 1]
    const next = squad[view.finishedPart]
    return (
      <div className="screen">
        <div className="col">
          <TopBar left="STEP 04/05 · CHECKPOINT" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 60 }}>
            <span className="mono md" style={{ letterSpacing: '.2em', color: done?.accent ?? 'var(--clay)' }}>
              // {done?.first.toUpperCase() ?? 'PART'} · {view.count} QUESTIONS DONE
            </span>
            <h1 className="display glitch" style={{ fontSize: 'clamp(64px, 21vw, 104px)', lineHeight: 0.8 }}>
              Part {view.finishedPart}
              <br />
              <span className="caret">complete</span>
            </h1>
            <p className="lede" style={{ color: 'var(--text-2)' }}>Answers saved. Take a breath. The next timer only starts when you press go.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="mono sm c-muted">MISSION PROGRESS · {view.finishedPart}/3</span>
            <div className="progress3">
              {[0, 1, 2].map((k) => (
                <div key={k}>
                  {k < view.finishedPart && <div className={`fill ${k === view.finishedPart - 1 ? 'anim' : ''}`} style={{ background: squad[k]?.accent ?? 'var(--clay)' }} />}
                </div>
              ))}
            </div>
          </div>
          {next && (
            <div className="next-up rise" style={{ background: next.accent }}>
              <PhotoTile url={next.photo_url} initials={next.ini} color={next.accent} size={30} label={next.name} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span className="mono sm" style={{ fontWeight: 700 }}>UP NEXT · PART {view.finishedPart + 1}/3</span>
                <span className="n">{next.first}</span>
              </div>
            </div>
          )}
          <div style={{ marginTop: 'auto' }}>
            <GoButton onClick={fetchNext}>Start part {view.finishedPart + 1} →</GoButton>
          </div>
        </div>
      </div>
    )
  }

  // ── question ──
  const { q, deadline } = view
  const left = Math.min(q.seconds, Math.max(0, (deadline - now) / 1000))
  const shown = Math.ceil(left)
  const danger = left <= 5
  const ringColor = danger ? 'var(--clay)' : 'var(--amber)'
  const m = byId(q.mentor_id)
  const accent = m?.accent ?? 'var(--teal)'
  const isSkill = q.kind === 'skill'

  return (
    <div className="screen">
      {danger && <div className="vign" aria-hidden />}
      <div className="col" style={{ gap: 16 }}>
        <header className="quiz-head">
          <div className="topbar">
            <div className="part-id">
              <span className="bar" style={{ background: accent }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span className="mono sm c-muted">PART {q.part}/3</span>
                <span className="n" style={{ color: accent }}>{m?.first ?? q.mentor_name}</span>
              </div>
            </div>
            <MuteToggle />
          </div>
          <div className="segs" style={{ gridTemplateColumns: `repeat(${q.part_total}, minmax(0, 1fr))` }} aria-label={`Question ${q.index_in_part} of ${q.part_total}`}>
            {Array.from({ length: q.part_total }, (_, i) => (
              <span key={i} style={{ background: i < q.index_in_part - 1 ? 'var(--teal)' : i === q.index_in_part - 1 ? 'var(--text)' : undefined }} />
            ))}
          </div>
        </header>

        <div className="q-mid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="q-tag" style={{ color: isSkill ? 'var(--teal)' : STEEL }}>{isSkill ? 'SKILLS' : 'INTEREST MATCH'}</span>
            <span className="mono md c-muted">Q_{pad(q.index_in_part)} / {pad(q.part_total)}</span>
          </div>
          <div className={`ring ${danger ? 'danger' : ''}`} role="timer" aria-label={`${shown} seconds left`}>
            <svg aria-hidden width="96" height="96" viewBox="0 0 96 96">
              <circle cx="48" cy="48" r="40" fill="none" stroke="var(--line-soft)" strokeWidth="6" />
              <circle className="prog" cx="48" cy="48" r="40" fill="none" stroke={ringColor} strokeWidth="6" strokeDasharray="251.3" strokeDashoffset={(251.3 * (1 - left / q.seconds)).toFixed(1)} transform="rotate(-90 48 48)" />
            </svg>
            <div className="t">
              <b style={{ color: ringColor }}>{shown}</b>
              <span className="mono sm c-muted">{danger ? `${shown}S LEFT` : 'SEC'}</span>
            </div>
          </div>
        </div>

        <h1 className="q-text" key={q.id}>{q.prompt}</h1>

        <div className="opts" role="radiogroup" aria-label="Answer options">
          {q.options.map((o, i) => (
            <button key={i} role="radio" aria-checked={choice === i} className={`opt ${choice === i ? 'on' : ''}`} onClick={() => setChoice(i)} disabled={busy}>
              <span className="key">{KEYS[i]}</span>
              <span>{o}</span>
            </button>
          ))}
        </div>

        <div className="q-actions">
          <div className="row">
            <button className="btn-outline" style={{ height: 58, minWidth: 92 }} onClick={() => submit(q, null)} disabled={busy}>Skip</button>
            <button className="btn" style={{ height: 58 }} onClick={() => submit(q, choice)} disabled={busy || choice === null}>
              {busy ? <span className="spinner" /> : 'Lock answer →'}
            </button>
          </div>
          <span className="mono sm c-muted" style={{ textAlign: 'center' }}>KEYS A–{KEYS[q.options.length - 1]} TO PICK · ENTER TO LOCK</span>
        </div>
      </div>
    </div>
  )
}

const pad = (n: number) => String(n).padStart(2, '0')

function GoButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  const mag = useMagnetic<HTMLButtonElement>()
  return <button ref={mag} className="btn block tall" onClick={onClick}>{children}</button>
}

function Briefing({ squad, seconds, started, onStart }: { squad: (ReturnType<typeof decorate>[number] | undefined)[]; seconds: number; started: boolean; onStart: () => void }) {
  return (
    <div className="screen">
      <div className="col" style={{ gap: 16 }}>
        <TopBar left="STEP 03/05 · BRIEFING" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="mono md c-teal" style={{ letterSpacing: '.2em' }}>// INCOMING TRANSMISSION</span>
          <h1 className="display d-md glitch">Mission<br />briefing</h1>
        </div>

        <section className="brk panel" style={{ padding: 16, gap: 10 }}>
          <span className="mono sm c-muted">YOUR SQUAD · ONE QUIZ PART EACH</span>
          <div className="squad">
            {squad.map((m, k) => (
              <div key={k} className="squad-row rise" style={{ background: m?.accent ?? 'var(--panel)', animationDelay: `${k * 80}ms` }}>
                <span className="p">PART {k + 1}</span>
                <span className="n">{m?.first ?? '—'}</span>
                <span className="r">{RANKS[k]}</span>
              </div>
            ))}
          </div>
        </section>

        <ol className="rules-list">
          <li><span className="k c-amber">10</span><span><strong>10 questions per part.</strong> 5 on the mentor's skills, 5 on what you're into.</span></li>
          <li><span className="k c-clay">{seconds}s</span><span><strong>{seconds} seconds per question.</strong> The ring turns red for the last 5. At zero, it moves on. The timer keeps running if you refresh.</span></li>
          <li><span className="k c-teal">±</span><span><strong>Right or matching answer +4</strong>, plus up to +2 for speed. <strong>Wrong −1</strong>, skip 0.</span></li>
          <li><span className="k c-muted">?</span><span><strong>No scores shown.</strong> Answer honestly. We use it to build teams.</span></li>
        </ol>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="mono sm c-muted" style={{ textAlign: 'center' }}>30 QUESTIONS · UP TO 15 MIN · SOUND ON RECOMMENDED</span>
          <GoButton onClick={onStart}>{started ? 'Continue quiz →' : 'Begin part 1 →'}</GoButton>
        </div>
      </div>
    </div>
  )
}

