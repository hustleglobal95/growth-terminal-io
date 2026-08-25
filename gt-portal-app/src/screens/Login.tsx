import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DEMO, CLERK_PUBLISHABLE_KEY } from '../config'
import { login } from '../lib/api'
import { SignIn, SignUp } from '@clerk/clerk-react'

/** Clerk, wearing the same clothes as the rest of the product.
 *
 *  This is the first screen anyone sees, and until now it was built from
 *  different parts than the application behind it. Measured against
 *  portal.css: it was set in Inter while the product is Instrument Sans, its
 *  controls were 42px tall with 10 to 12px corners against the app's 38px and
 *  4px, and its primary button was black while every primary button inside is
 *  Growth Orange. The note that used to sit here claimed --amber resolves to
 *  black in the light theme. It does not. It is #F97316, and it has been for
 *  as long as the light theme has existed, so the claim was carrying a
 *  mismatch rather than explaining one.
 *
 *  Somebody signed in on one design and landed in another. Every value below
 *  is now the token the rest of the product uses, written out because Clerk
 *  takes literals rather than custom properties.
 *
 *  Signal Orange stays on errors as colorDanger. It is a different orange from
 *  the button on purpose: the button is the product's, the error is the
 *  brand's alert, and they are never the same object.
 *
 *  colorInputForeground is load bearing: Clerk defaults input text to black,
 *  which was invisible on the old dark field. It is spelled out here so the
 *  next person to change the palette sees it. */
const CLERK_LOOK = {
  variables: {
    /* --amber, the product's primary. */
    colorPrimary: '#F97316',
    colorPrimaryForeground: '#FFFFFF',
    /* --pane and --text. */
    colorBackground: '#FFFFFF',
    colorForeground: '#0F0F0E',
    /* --muted. */
    colorMutedForeground: '#5A564F',
    colorInput: '#FFFFFF',
    colorInputForeground: '#0F0F0E',
    /* --border2. */
    colorBorder: 'rgba(15,15,14,.16)',
    /* Signal Orange, the brand's alert. */
    colorDanger: '#FC5802',
    colorShimmer: 'rgba(15,15,14,.05)',
    /* --r. The product is a ruled interface, not a rounded one. */
    borderRadius: '4px',
    /* --sans. */
    fontFamily: '"Instrument Sans","Helvetica Neue",Arial,sans-serif'
  },
  elements: {
    /* The page writes its own heading, so Clerk's is hidden rather than
       stacked underneath it. That also retires "Sign in to Growth Terminal
       Engine", which is the name of an internal service and meant nothing to
       the person reading it. */
    header: { display: 'none' },
    /* No card. The heading, the fields and the fine print are one column on
       the page, which is how every other screen in the product is built. */
    rootBox: { width: '100%' },
    cardBox: { width: '100%', border: 'none', boxShadow: 'none' },
    card: { background: 'transparent', boxShadow: 'none', padding: '0', gap: '18px' },
    /* 38px and 4px are .btn. The controls on this screen are the controls in
       the product, at the same height and with the same corner. */
    socialButtonsBlockButton: {
      borderColor: 'rgba(15,15,14,.16)',
      borderRadius: '4px',
      height: '38px',
      boxShadow: 'none'
    },
    formFieldInput: {
      borderRadius: '4px',
      height: '38px',
      borderColor: 'rgba(15,15,14,.16)',
      boxShadow: 'none'
    },
    formButtonPrimary: {
      textTransform: 'none' as const,
      fontWeight: 600,
      letterSpacing: '-.01em',
      borderRadius: '4px',
      height: '38px',
      /* .btn.p is a flat fill inside a hairline. No gradient, no glow. */
      backgroundImage: 'none',
      boxShadow: 'inset 0 0 0 1px rgba(150,58,6,.30)'
    },
    footer: { background: 'transparent' },
    footerActionLink: { color: '#0F0F0E', fontWeight: 600 }
  }
}

/** Mark and address, locked up.
 *
 *  The address rather than the company name, because the name is already said
 *  twice further down the page and because a reviewer, or anyone who lands
 *  here from a link, should be able to see at a glance exactly what site they
 *  are about to type a password into. Set at a size you read rather than
 *  inspect. Alt on the mark is empty now that visible text names the place. */
function Wordmark({ className }: { className: string }) {
  return (
    <span className={className}>
      <img src="/logo-mark-128.png" srcSet="/logo-mark-128.png 2x, /logo-mark-192.png 3x"
        alt="" width={64} height={64} />
      <b>www.growthterminal.io</b>
    </span>
  )
}

/** The picture makes the argument, so the words underneath it stay short.
 *
 *  It is a pipe carrying flow in the dark, choked at one point, with the heat
 *  banked up behind the choke and a trickle getting through. That is the
 *  product in one frame: the constraint is not everywhere, it is somewhere,
 *  and until it moves nothing else you widen will matter. */
function Art() {
  return (
    <div className="lgart">
      <Wordmark className="lgmark" />
      <div className="lgsay">
        <span className="lgeyebrow">The constraint</span>
        <h2>Everything you built runs through one narrow point.</h2>
        <p className="lgnote">Growth Terminal finds it, prices what widening it is worth, and
          checks the answer against what the money did next.</p>
      </div>
    </div>
  )
}

/** The art argues, the right half gets out of the way. Under 980px the panel
 *  folds and the form takes the screen, with the wordmark moved across so the
 *  page is still signed. */
function Split({ children }: { children: React.ReactNode }) {
  return (
    <div className="lgsplit">
      <Art />
      <div className="lgform">{children}</div>
    </div>
  )
}

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

  // Live mode: Clerk owns sign in. Our form is the demo path only.
  if (!DEMO && CLERK_PUBLISHABLE_KEY) {
    return (
      <Split>
        <div className="lgformin">
          <Wordmark className="lgformmark" />
          <h1 className="lghead">Sign in to your workspace.</h1>
          <p className="lgsub">Every analysis, every business, every 90 day plan. One console.</p>
          {/* signUpUrl keeps the link at the bottom of this card inside the app.
              Left unset it points at Clerk's hosted portal on
              accounts.growthterminal.io, whose DNS is proxied through Cloudflare
              and answers Error 1000, so the only way anyone could reach sign up
              was a dead end. Clerk itself works here because it rides the
              backend proxy rather than that hostname. */}
          <SignIn afterSignInUrl="/" signUpUrl="/signup" appearance={CLERK_LOOK} />
          <p className="lgfine">Growth Terminal reads the workbooks you connect and nothing else.</p>
        </div>
      </Split>
    )
  }

  return (
    <Split>
      <form className="logincard" onSubmit={submit}>
        <img className="logo" src="/logo.svg" alt="Growth Terminal" />
        <h1>Sign in to your workspace.</h1>
        <p className="sub">Every analysis, every client, every teammate. One console.</p>
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
    </Split>
  )
}

/** Sign up, served from this app rather than Clerk's hosted portal.
 *
 *  The hosted portal lives at accounts.growthterminal.io, which is proxied by
 *  Cloudflare and answers Error 1000, DNS points to prohibited IP. Clerk's
 *  own records have to be DNS only, so that hostname is broken until the
 *  orange cloud comes off it. Mounting the component here sidesteps it
 *  entirely: this route is on app.growthterminal.io and every Clerk call from
 *  it goes through the backend proxy, which is the path that already works
 *  for sign in.
 *
 *  Demo mode has no Clerk, so it gets the sign in screen instead of a blank
 *  page. */
export function Signup() {
  if (DEMO || !CLERK_PUBLISHABLE_KEY) return <Login />
  return (
    <Split>
      <div className="lgformin">
        <Wordmark className="lgformmark" />
        <h1 className="lghead">Create your workspace.</h1>
        <p className="lgsub">One workbook is enough to start. The first analysis takes a few minutes.</p>
        <SignUp afterSignUpUrl="/" signInUrl="/login" appearance={CLERK_LOOK} />
        <p className="lgfine">Growth Terminal reads the workbooks you connect and nothing else.</p>
      </div>
    </Split>
  )
}
