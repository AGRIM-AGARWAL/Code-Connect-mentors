import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion'
import Splash from './pages/Splash'
import Login from './pages/Login'
import Register from './pages/Register'
import Student from './pages/Student'
import Admin from './pages/Admin'
import { isDemo } from './lib/api'
import { Backdrop, FogCanvas, Reticle } from './components/Shell'

// Tiny hash router: #/ splash · #/login · #/register · #/student · #/admin
export const go = (path: string) => {
  window.location.hash = path
}

function useRoute() {
  const read = () => window.location.hash.replace(/^#/, '') || '/'
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const f = () => {
      setRoute(read())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return route
}

const pageFor = (route: string) =>
  route.startsWith('/admin') ? 'admin'
  : route.startsWith('/register') ? 'register'
  : route.startsWith('/student') ? 'student'
  : route.startsWith('/login') ? 'login'
  : 'splash'

export default function App() {
  const route = useRoute()
  const key = pageFor(route)
  const reduce = useReducedMotion()
  const page =
    key === 'admin' ? <Admin /> : key === 'register' ? <Register /> : key === 'student' ? <Student /> : key === 'login' ? <Login /> : <Splash />

  // Fog dissolve between screens: outgoing shrinks + blurs, incoming rises out of the fog.
  const EASE_OUT = [0.22, 1, 0.36, 1] as const
  const EASE_INOUT = [0.65, 0, 0.35, 1] as const
  const variants: Variants = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1, transition: { duration: 0.25 } }, exit: { opacity: 0, transition: { duration: 0.2 } } }
    : {
        initial: { opacity: 0, y: 24, filter: 'blur(8px)' },
        animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.6, ease: EASE_OUT }, transitionEnd: { filter: 'none', transform: 'none' } },
        exit: { opacity: 0, scale: 0.97, filter: 'blur(8px)', transition: { duration: 0.45, ease: EASE_INOUT } },
      }

  return (
    <>
      {import.meta.env.VITE_DEMO === '1' && isDemo && <DemoBar />}
      <Backdrop />
      {key !== 'admin' && <FogCanvas />}
      <Reticle />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={key} variants={variants} initial="initial" animate="animate" exit="exit">
          {page}
        </motion.div>
      </AnimatePresence>
    </>
  )
}

// Only in the demo build: explains the sample data and gives quick links
function DemoBar() {
  const reset = async () => {
    if (import.meta.env.VITE_DEMO !== '1') return // keeps demo data out of the real build
    const { resetDemo } = await import('./lib/mock')
    resetDemo()
    try {
      localStorage.removeItem('cc_token')
      sessionStorage.removeItem('cc_admin_pw')
    } catch {
      /* ignore */
    }
    go('/')
    window.location.reload()
  }
  return (
    <div className="demo-bar">
      <span>DEMO · SAMPLE DATA, SAVED ONLY IN THIS BROWSER</span>
      <span className="demo-links">
        <a href="#/login">STUDENT</a>
        <a href="#/admin">ADMIN (PASSWORD: demo)</a>
        <button className="linkish" onClick={reset}>RESET DEMO</button>
      </span>
    </div>
  )
}
