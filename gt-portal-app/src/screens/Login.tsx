/** THE FRONT DOOR.
 *
 *  The card is the page. Everything else is atmosphere and it stays there.
 *
 *  Behind the card the product runs at the contrast of a watermark: the same
 *  three pictures the analysis draws, at the size of the window, changing with
 *  the line underneath the card. It is not decoration. A spreadsheet with one
 *  column lit, twelve constraints with one of them tallest, and a forecast cone
 *  with the line drawn through it are the three things this company does, and
 *  somebody standing at the door can read all three without being sold to.
 *
 *  The message sits under the card rather than over it, because it is the
 *  reason to bother and the reason you came is the form.
 *
 *  Corners are round here, not the product's 4px rule. That is a decision about
 *  the front door rather than drift: this page is its own place and the
 *  application behind it stays ruled.
 *
 *  Clerk still owns authentication. Nothing on this screen touches a
 *  credential; it is mounted inside the card and dressed to match it.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DEMO, CLERK_PUBLISHABLE_KEY } from '../config'
import { login } from '../lib/api'
import { SignIn, SignUp } from '@clerk/clerk-react'

/** How long each line holds before the next one. */
const DWELL = 7000

/* Clerk takes literals rather than custom properties, so every value below is
   written out. Controls are capsules at 46px to match the card. */
const CLERK_LOOK = {
  variables: {
    colorPrimary: '#F97316',
    colorPrimaryForeground: '#FFFFFF',
    colorBackground: '#FFFFFF',
    colorForeground: '#0F0F0E',
    colorMutedForeground: '#5A564F',
    colorInput: '#FFFFFF',
    colorInputForeground: '#0F0F0E',
    colorBorder: 'rgba(15,15,14,.15)',
    /* Signal Orange, the brand's alert, and a different orange from the button
       on purpose: the button is the product's, the error is the brand's. */
    colorDanger: '#FC5802',
    colorShimmer: 'rgba(15,15,14,.05)',
    borderRadius: '12px',
    fontFamily: '"Instrument Sans","Helvetica Neue",Arial,sans-serif'
  },
  elements: {
    /* The card writes its own heading, so Clerk's is hidden rather than stacked
       under it. That also retires "Sign in to Growth Terminal Engine", which is
       the name of an internal service and meant nothing to the person reading. */
    header: { display: 'none' },
    rootBox: { width: '100%' },
    cardBox: { width: '100%', border: 'none', boxShadow: 'none' },
    card: { background: 'transparent', boxShadow: 'none', padding: '0', gap: '16px' },
    socialButtonsBlockButton: {
      borderRadius: '999px', height: '46px',
      borderColor: 'rgba(15,15,14,.15)', boxShadow: 'none'
    },
    formFieldLabel: { fontSize: '11px', fontWeight: 500, color: '#5A564F' },
    formFieldInput: {
      borderRadius: '999px', height: '46px', padding: '0 18px',
      borderColor: 'rgba(15,15,14,.15)', boxShadow: 'none'
    },
    formButtonPrimary: {
      textTransform: 'none' as const, fontWeight: 600, letterSpacing: '-.01em',
      borderRadius: '999px', height: '46px', backgroundImage: 'none',
      boxShadow: 'inset 0 0 0 1px rgba(150,58,6,.30)'
    },
    dividerLine: { background: 'rgba(15,15,14,.09)' },
    footer: { background: 'transparent' },
    footerActionLink: { color: '#0F0F0E', fontWeight: 600 }
  }
}

/* ------------------------------------------------------------- the message */

interface Message { eyebrow: string; line: string }

const SIGN_IN_MESSAGES: Message[] = [
  { eyebrow: 'Where it starts', line: 'It starts with the spreadsheet you already keep.' },
  { eyebrow: 'What it finds', line: 'Twelve constraints scored. One of them is the reason.' },
  { eyebrow: 'What happens after', line: 'A forecast you can check, not one you have to believe.' }
]

const SIGN_UP_MESSAGES: Message[] = [
  { eyebrow: 'What you need', line: 'One workbook is enough to start.' },
  { eyebrow: 'What comes back', line: 'One constraint, priced, with the evidence underneath it.' },
  { eyebrow: 'What happens after', line: 'A 90 day plan, and every call graded against what happened.' }
]

/* --------------------------------------------------------------- the scenes
   Drawn at a fixed 1440 by 900 and sliced to the window, so the composition is
   the same shape on every screen rather than stretching. */

const W = 1440

function Sheet() {
  const cols = 14, cw = 74, gap = 22, rows = 7, rh = 30, top = 250, win = 9
  const left = (W - (cols * (cw + gap) - gap)) / 2
  const out: React.ReactNode[] = []
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      out.push(<rect key={c + ':' + r} className={c === win ? 'lgcellwin' : 'lgcell'}
        x={left + c * (cw + gap)} y={top + r * (rh + 12)} width={cw} height={rh} rx={rh / 2} />)
    }
  }
  return <>{out}</>
}

function Bars() {
  const n = 12, bw = 64, gap = 40, base = 905, win = 7
  const hs = [190, 120, 300, 380, 210, 96, 250, 560, 300, 130, 205, 84]
  const left = (W - (n * (bw + gap) - gap)) / 2
  return <>{hs.map((h, i) => (
    <rect key={i} className={'lgbar ' + (i === win ? 'lgbarwin' : 'lgbarfill')}
      x={left + i * (bw + gap)} y={base - h} width={bw} height={h} rx={bw / 2}
      style={{ transitionDelay: i * 55 + 'ms' }} />
  ))}</>
}

function Cone() {
  const line = 'M-40,780 C260,720 520,640 760,540 C1000,440 1230,330 1500,210'
  const band = 'M-40,806 C260,748 520,672 760,574 C1000,476 1230,352 1500,164 ' +
    'L1500,268 C1230,392 1000,500 760,600 C520,700 260,760 -40,812 Z'
  return <><path className="lgcone" d={band} /><path className="lgconeline" d={line} /></>
}

const SCENES = [Sheet, Bars, Cone]

function Machine({ at }: { at: number }) {
  return (
    <div className="lgbg" aria-hidden="true">
      <div className="lgglow" />
      <div className="lgdots" />
      <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        {SCENES.map((S, i) => (
          <g key={i} className={'lgscene' + (i === at ? ' on' : '')}><S /></g>
        ))}
      </svg>
    </div>
  )
}

/** Words arrive in reading order rather than as a block that fades. The space
 *  sits between the spans rather than inside them: an inline-block swallows a
 *  trailing space and the sentence sets as one long word. */
function Words({ text }: { text: string }) {
  return <>{text.split(' ').map((w, i) => (
    <React.Fragment key={i}>
      {i > 0 ? ' ' : null}
      <span className="lgw" style={{ animationDelay: i * 34 + 60 + 'ms' }}>{w}</span>
    </React.Fragment>
  ))}</>
}

/** The rotation, and the rail that reports and drives it. */
function useRotation(count: number) {
  const [at, setAt] = useState(0)
  const timer = useRef<number | null>(null)
  const start = (from: number) => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setAt(n => {
        const next = (n + 1) % count
        start(next)
        return next
      })
    }, DWELL)
  }
  useEffect(() => {
    start(0)
    return () => { if (timer.current) window.clearTimeout(timer.current) }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [count])
  const go = (i: number) => { setAt(i); start(i) }
  return [at, go] as const
}

/* ------------------------------------------------------------------- shell */

function Page({ title, sub, messages, children }: {
  title: string; sub: string; messages: Message[]; children: React.ReactNode
}) {
  const [at, go] = useRotation(messages.length)
  const m = messages[at]
  const dwell = useMemo(() => ({ ['--lgdwell' as string]: DWELL + 'ms' }), [])

  return (
    <>
      <Machine at={at} />
      <div className="lgwrap">
        <span className="lgmark">
          <img src="/logo.svg" alt="Growth Terminal" width={262} height={25} />
        </span>

        <main className="lgcard">
          <h1 className="lghead">{title}</h1>
          <p className="lgsub">{sub}</p>
          {children}
        </main>

        <section className="lgmsg" aria-live="polite">
          <span className="lgeyebrow">{m.eyebrow}</span>
          <p className="lgline"><Words text={m.line} /></p>
          <div className="lgrail" role="tablist" aria-label="What Growth Terminal does"
            style={dwell as React.CSSProperties}>
            {messages.map((one, i) => (
              <button key={i} type="button" role="tab" aria-label={one.eyebrow}
                aria-selected={i === at} onClick={() => go(i)}
                className={i === at ? 'on' : i < at ? 'done' : ''}><i /></button>
            ))}
          </div>
        </section>

        <footer className="lgfoot">
          <p className="lgstatus">Verified Meta Tech Provider, built on Meta's official APIs.</p>
          <p className="lgfine">Not affiliated with, or endorsed by, Meta, Instagram, Facebook or Threads.</p>
          <p className="lgfine">growthterminal.io</p>
        </footer>
      </div>
    </>
  )
}

/* -------------------------------------------------------------------- sign in */

export function Login() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null); setBusy(true)
    try {
      await login(email, pw)
      nav('/')
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Sign in failed. Check your details and try again.')
    } finally {
      setBusy(false)
    }
  }

  /* Live mode: Clerk owns sign in. The form below is the demo path only.
     signUpUrl keeps the link at the bottom of Clerk's card inside this app.
     Left unset it points at Clerk's hosted portal on accounts.growthterminal.io,
     whose DNS is proxied through Cloudflare and answers Error 1000, so the only
     way anyone could reach sign up was a dead end. Clerk itself works here
     because it rides the backend proxy rather than that hostname. */
  if (!DEMO && CLERK_PUBLISHABLE_KEY) {
    return (
      <Page title="Sign in to your workspace."
        sub="Every analysis, every business, every 90 day plan. One console."
        messages={SIGN_IN_MESSAGES}>
        <SignIn afterSignInUrl="/" signUpUrl="/signup" appearance={CLERK_LOOK} />
      </Page>
    )
  }

  return (
    <Page title="Sign in to your workspace."
      sub="Every analysis, every business, every 90 day plan. One console."
      messages={SIGN_IN_MESSAGES}>
      <form className="logincard" onSubmit={submit}>
        {DEMO && (
          <div className="note">This build is in demo mode, so any details sign you into the
            sample workspace. Wire the live API in src/config.ts to make this real.</div>
        )}
        <label className="lbl" htmlFor="em">Email</label>
        <input id="em" type="email" required value={email} onChange={e => setEmail(e.target.value)}
          placeholder="you@company.com" autoComplete="email" />
        <label className="lbl" htmlFor="pw">Password</label>
        <input id="pw" type="password" required value={pw} onChange={e => setPw(e.target.value)}
          placeholder="Your password" autoComplete="current-password" />
        {err && <div className="note bad">{err}</div>}
        <button className="btn p" disabled={busy} type="submit">{busy ? 'Signing in' : 'Sign in'}</button>
        <span className="fine">No account yet? Access comes with GT Professional and GT Agency.</span>
      </form>
    </Page>
  )
}

/* -------------------------------------------------------------------- sign up
   Served from this app rather than Clerk's hosted portal. The hosted portal
   lives at accounts.growthterminal.io, which is proxied by Cloudflare and
   answers Error 1000, DNS points to prohibited IP. Clerk's own records have to
   be DNS only, so that hostname is broken until the orange cloud comes off it.
   Mounting the component here sidesteps it entirely: this route is on
   app.growthterminal.io and every Clerk call from it goes through the backend
   proxy, which is the path that already works for sign in.

   Demo mode has no Clerk, so it gets the sign in screen instead of a blank
   page. */
export function Signup() {
  if (DEMO || !CLERK_PUBLISHABLE_KEY) return <Login />
  return (
    <Page title="Create your workspace."
      sub="One workbook is enough to start. The first analysis takes a few minutes."
      messages={SIGN_UP_MESSAGES}>
      <SignUp afterSignUpUrl="/" signInUrl="/login" appearance={CLERK_LOOK} />
    </Page>
  )
}
