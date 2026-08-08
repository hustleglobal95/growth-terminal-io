type Fn = (msg: string) => void
const subs: Fn[] = []
export function onToast(fn: Fn) { subs.push(fn); return () => { subs.splice(subs.indexOf(fn), 1) } }
export function toast(msg: string) { subs.forEach(f => f(msg)) }
export function noCredits() { toast('0 credits left. Top up to run an analysis.') }
