import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DEMO } from '../config'
import { login } from '../lib/api'

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

  return (
    <div className="loginwrap">
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
    </div>
  )
}
