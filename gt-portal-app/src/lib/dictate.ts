/** DICTATION, USING WHAT THE BROWSER ALREADY HAS.
 *
 *  Chrome and Edge ship speech recognition. Nothing is uploaded by this app, no
 *  key rides in the bundle and no credit is spent, which is the whole reason to
 *  use it. Safari and Firefox do not have it, and the honest thing to do there
 *  is say so and leave typing working rather than render a microphone that does
 *  nothing.
 *
 *  Worth knowing and worth saying on the screen: Chrome's implementation sends
 *  audio to Google for recognition. That is a property of the browser rather
 *  than of this product, but somebody dictating a note about their revenue
 *  deserves to be told rather than to find out.
 */

/* The interface is prefixed and is not in the DOM lib, so it is described here
   rather than reached for through any. */
interface SpeechAlt { transcript: string }
interface SpeechResult { readonly length: number; isFinal: boolean;[i: number]: SpeechAlt }
interface SpeechResultList { readonly length: number;[i: number]: SpeechResult }
interface SpeechEvent { resultIndex: number; results: SpeechResultList }
interface SpeechErr { error: string }
interface Recogniser {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SpeechEvent) => void) | null
  onerror: ((e: SpeechErr) => void) | null
  onend: (() => void) | null
}
type RecogniserCtor = new () => Recogniser

function ctor(): RecogniserCtor | null {
  const w = window as unknown as Record<string, unknown>
  const c = (w.SpeechRecognition || w.webkitSpeechRecognition) as RecogniserCtor | undefined
  return c || null
}

export function dictationSupported(): boolean {
  return ctor() !== null
}

export interface Dictation {
  /** Everything settled so far. Interim words are reported separately and are
   *  never appended, because they change under you. */
  onFinal: (text: string) => void
  onInterim: (text: string) => void
  onError: (says: string) => void
  onStop: () => void
}

const SAYS: Record<string, string> = {
  'not-allowed': 'The microphone was blocked. Allow it in the address bar and start again.',
  'service-not-allowed': 'The browser refused speech recognition for this page.',
  'no-speech': 'Nothing was heard. Check the microphone and start again.',
  'audio-capture': 'No microphone was found.',
  'network': 'Speech recognition needs the network and could not reach it.',
  'aborted': ''
}

/** Starts dictating. Returns the stop handle, or null when the browser has no
 *  recogniser, which the caller is expected to have checked already. */
export function dictate(d: Dictation): (() => void) | null {
  const C = ctor()
  if (!C) return null

  const r = new C()
  r.lang = navigator.language || 'en-US'
  r.continuous = true
  r.interimResults = true
  r.maxAlternatives = 1

  /* Chrome ends the session on its own after a pause. For a note that is the
     wrong behaviour, so it restarts until the person actually stops. */
  let wanted = true

  r.onresult = (e) => {
    let final = '', interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i]
      const said = res[0] ? res[0].transcript : ''
      if (res.isFinal) final += said
      else interim += said
    }
    if (final) d.onFinal(final)
    d.onInterim(interim)
  }
  r.onerror = (e) => {
    const says = SAYS[e.error]
    if (says === undefined) d.onError('Dictation stopped: ' + e.error + '.')
    else if (says) d.onError(says)
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') wanted = false
  }
  r.onend = () => {
    if (!wanted) { d.onStop(); return }
    try { r.start() } catch { d.onStop() }
  }

  try { r.start() } catch { return null }

  return () => {
    wanted = false
    try { r.stop() } catch { /* already stopped */ }
  }
}
