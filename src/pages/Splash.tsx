import { useEffect } from 'react'
import { MuteToggle, useMagnetic } from '../components/Shell'
import { sfx, unlockAudio } from '../audio/sfx'
import { getToken } from '../lib/api'
import { go } from '../App'

export default function Splash() {
  const btn = useMagnetic<HTMLButtonElement>()

  const enter = () => {
    unlockAudio()
    // give the AudioContext a moment to start, then play the boot swell
    setTimeout(() => sfx.boot(), 30)
    go(getToken() ? '/student' : '/login')
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !(e.target as Element)?.closest?.('button,a,input')) enter()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="screen splash">
      <div className="splash-rings" aria-hidden>
        <svg className="spin-slow" viewBox="0 0 760 760">
          <circle cx="380" cy="380" r="370" fill="none" stroke="#2D3137" strokeWidth="1" />
          <circle cx="380" cy="380" r="300" fill="none" stroke="#6FA6A1" strokeWidth="1" strokeDasharray="4 14" opacity=".6" />
          <circle cx="380" cy="380" r="230" fill="none" stroke="#2D3137" strokeWidth="1" />
          <path d="M380 0 V40 M380 720 V760 M0 380 H40 M720 380 H760" stroke="#6FA6A1" strokeWidth="2" />
        </svg>
      </div>

      <div className="splash-top">
        <span className="mono md c-muted">UPES // HYPERVISION</span>
        <span className="mono md c-muted hide-sm">30.41N · 77.97E · NODE_CC01</span>
        <MuteToggle />
      </div>

      <div className="splash-mid">
        <div className="mono md c-teal" style={{ letterSpacing: '.3em' }}>[ MENTOR SELECTION PROTOCOL ]</div>
        <h1 className="display d-xl glitch">
          Code
          <br />
          Connect<span className="caret">_</span>
        </h1>
        <p className="lede" style={{ fontSize: 17 }}>Pick three mentors. Take one short quiz for each. We build the teams.</p>
        <button ref={btn} className="btn pulse enter-btn" onClick={enter}>
          ENTER <span className="key">↵</span>
        </button>
        <div className="mono md c-muted">ENTER TURNS ON SOUND · MUTE ANY TIME, TOP RIGHT</div>
      </div>

      <div className="boot" aria-hidden>
        <span>&gt; boot sequence ........ <span className="c-sage">OK</span></span>
        <span>&gt; mentor roster ......... <span className="c-sage">LOADED</span></span>
        <span>&gt; quiz channel .......... <span className="c-sage">OPEN</span></span>
        <span>&gt; awaiting operator<span className="blink c-amber">_</span></span>
      </div>
      <div className="boot-right mono md c-muted" aria-hidden>SYS.READY · STEP 00/05</div>
    </div>
  )
}
