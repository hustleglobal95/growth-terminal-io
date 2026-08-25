/** The legal foot of the application.
 *
 *  Everything here already existed on the marketing site and nowhere inside
 *  the product a customer actually works in. That gap matters twice over. A
 *  buyer running vendor review looks for the operating entity and the policies
 *  from wherever they happen to be standing, and a person who wants to know
 *  what a connected account is allowed to do should not have to leave the
 *  workspace and go hunting on a marketing page to find out.
 *
 *  These link out rather than restating anything. A policy that exists in two
 *  places drifts, and the version a customer reads has to be the version that
 *  is under review, so the marketing site stays the single source and this is
 *  a route to it.
 *
 *  The Meta line is not decoration. Growth Terminal publishes through Meta's
 *  APIs, and Meta's platform terms require the relationship to be stated and
 *  the absence of endorsement to be explicit wherever the integration is
 *  presented. It is presented in here, so it is stated in here. */
const LEGAL: [string, string][] = [
  ['Privacy', 'https://growthterminal.io/legal/privacy'],
  ['Terms', 'https://growthterminal.io/legal/terms'],
  ['Cookies', 'https://growthterminal.io/legal/cookies'],
  ['Security', 'https://growthterminal.io/security'],
  ['Status', 'https://growthterminal.io/status']
]

export function LegalFooter() {
  return (
    <footer className="legalfoot">
      <div className="lfrow">
        <span className="lfent">Growth Terminal LLC</span>
        <nav className="lflinks">
          {LEGAL.map(([label, href]) => (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer">{label}</a>
          ))}
        </nav>
      </div>
      <p className="lfnote">Growth Terminal is a verified Meta Tech Provider and publishes through
        Meta's official APIs. Not affiliated with, or endorsed by, Meta, Instagram, Facebook or
        Threads. Google Sheets is a trademark of Google LLC.</p>
    </footer>
  )
}
