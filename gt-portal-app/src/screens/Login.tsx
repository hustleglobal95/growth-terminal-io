import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DEMO, CLERK_PUBLISHABLE_KEY } from '../config'
import { login } from '../lib/api'
import { SignIn, SignUp } from '@clerk/clerk-react'

/** Clerk, wearing the same clothes as the rest of the product.
 *
 *  These values were left over from the dark theme, so the first thing anyone
 *  saw was a near black card floating on a white page, in an app that is white
 *  everywhere else. The numbers below are not new: they are the tokens in
 *  portal.css. Primary is --amber, which the white theme redefines to black,
 *  so the sign in button matches .btn.p rather than inventing a colour. The
 *  card gets the same hairline and radius as every other surface, --border on
 *  --card at --r, so it reads as one of ours.
 *
 *  Orange stays where it belongs, on errors, as --alert. It is not the button.
 *
 *  colorInputForeground is load bearing: Clerk defaults input text to black,
 *  which was invisible on the old dark field. It is spelled out here so the
 *  next person to change the palette sees it. */
const CLERK_LOOK = {
  variables: {
    colorPrimary: '#000000',
    colorPrimaryForeground: '#FFFFFF',
    colorBackground: '#FFFFFF',
    colorForeground: '#000000',
    colorMutedForeground: '#6E6E6E',
    colorInput: '#FFFFFF',
    colorInputForeground: '#000000',
    colorBorder: 'rgba(0,0,0,.14)',
    colorDanger: '#FC5802',
    colorShimmer: 'rgba(0,0,0,.05)',
    borderRadius: '12px',
    fontFamily: '"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif'
  },
  elements: {
    rootBox: { width: '100%', maxWidth: '480px' },
    cardBox: {
      width: '100%',
      border: '1px solid rgba(0,0,0,.09)',
      borderRadius: '14px',
      boxShadow: '0 1px 2px rgba(0,0,0,.04)'
    },
    card: { boxShadow: 'none' },
    headerTitle: { fontWeight: 600, letterSpacing: '-.015em' },
    socialButtonsBlockButton: { borderColor: 'rgba(0,0,0,.14)' },
    formButtonPrimary: {
      textTransform: 'none' as const,
      fontWeight: 600,
      letterSpacing: '-.01em'
    },
    footerActionLink: { color: '#000000', fontWeight: 600 }
  }
}

/** Split sign in: brand key art fills the left half, the form the right.
 *  The art panel reads /login-bg.jpg from public and disappears under
 *  900px so phones get a clean full-width form. */
function Split({ children }: { children: React.ReactNode }) {
  return (
    <div className="loginsplit">
      <div className="loginart" aria-hidden="true" />
      <div className="loginside">{children}</div>
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
        {/* signUpUrl keeps the link at the bottom of this card inside the app.
            Left unset it points at Clerk's hosted portal on
            accounts.growthterminal.io, whose DNS is proxied through Cloudflare
            and answers Error 1000, so the only way anyone could reach sign up
            was a dead end. Clerk itself works here because it rides the
            backend proxy rather than that hostname. */}
        <SignIn afterSignInUrl="/" signUpUrl="/signup" appearance={CLERK_LOOK} />
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
      <SignUp afterSignUpUrl="/" signInUrl="/login" appearance={CLERK_LOOK} />
    </Split>
  )
}
