/**
 * Janki wordmark logo — SVG inline component.
 *
 * Icon: Crowley's unicursal hexagram in gold, with a googly-eyed rose at its
 * centre — matches the home-screen and dock icon.
 *
 * Usage:
 *   <Logo />          — default (h-8, horizontal lockup)
 *   <Logo iconOnly /> — square icon only (for favicons / small spaces)
 *   <Logo className="h-10" />
 */

interface LogoProps {
  /** Render only the square icon mark, not the wordmark */
  iconOnly?: boolean
  className?: string
}

export default function Logo({ iconOnly = false, className = 'h-8' }: LogoProps) {
  if (iconOnly) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 48 48"
        fill="none"
        aria-label="Janki"
        className={className}
      >
        <IconMark />
      </svg>
    )
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 220 48"
      fill="none"
      aria-label="Janki"
      className={className}
    >
      {/* ── Icon mark (48×48 zone) ── */}
      <IconMark />

      {/* ── Wordmark ── */}
      {/* "j" — slightly lighter to echo the icon's indigo */}
      <text
        x="58"
        y="34"
        fontFamily="var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif"
        fontSize="26"
        fontWeight="700"
        fill="#4f46e5"
        letterSpacing="-0.5"
      >
        j
      </text>
      {/* "anki" — darker slate for contrast */}
      <text
        x="74"
        y="34"
        fontFamily="var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif"
        fontSize="26"
        fontWeight="700"
        fill="#1e1b4b"
        letterSpacing="-0.5"
      >
        anki
      </text>
    </svg>
  )
}

/** The square icon tile — reused by both variants. Same art as the home-screen
 *  icon (public/icons/janki.svg), drawn at 512 and scaled into the 48×48 zone. */
function IconMark() {
  return (
    <>
      <defs>
        <clipPath id="janki-tile">
          <rect width="48" height="48" rx="11" />
        </clipPath>
        <radialGradient id="janki-bg" cx="50%" cy="45%" r="70%">
          <stop offset="0" stopColor="#3b1466" />
          <stop offset="1" stopColor="#10041d" />
        </radialGradient>
        <linearGradient id="janki-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe27a" />
          <stop offset="1" stopColor="#e8a317" />
        </linearGradient>
      </defs>
      <g clipPath="url(#janki-tile)">
        <g transform="scale(0.09375)">
          <rect width="512" height="512" fill="url(#janki-bg)" />
          <circle cx="256" cy="262" r="196" stroke="#f5c542" strokeOpacity=".18" strokeWidth="4" />
          <g fill="#ffe9a8">
            <path d="M70 70l5 13 13 5-13 5-5 13-5-13-13-5 13-5z" />
            <path d="M440 64l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" />
            <path d="M444 430l5 12 12 5-12 5-5 12-5-12-12-5 12-5z" />
            <path d="M62 440l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" />
          </g>

          {/* ── Unicursal hexagram, one stroke ── */}
          <path d="M256 92 L403.2 347 L108.8 177 L256 432 L403.2 177 L108.8 347 Z"
                stroke="#1a0630" strokeWidth="34" strokeLinejoin="round" />
          <path d="M256 92 L403.2 347 L108.8 177 L256 432 L403.2 177 L108.8 347 Z"
                stroke="url(#janki-gold)" strokeWidth="20" strokeLinejoin="round" />

          {/* ── The rose, gone silly ── */}
          <g transform="translate(256 262)">
            <g fill="#ff4f86" stroke="#1a0630" strokeWidth="5">
              {[0, 72, 144, 216, 288].map(a => (
                <circle key={a} cx="0" cy="-36" r="32" transform={`rotate(${a})`} />
              ))}
            </g>
            <circle r="42" fill="#ff8fb4" stroke="#1a0630" strokeWidth="5" />
            {/* Googly eyes, pupils wandering off */}
            <circle cx="-17" cy="-10" r="16" fill="#fff" stroke="#1a0630" strokeWidth="4" />
            <circle cx="19" cy="-12" r="19" fill="#fff" stroke="#1a0630" strokeWidth="4" />
            <circle cx="-23" cy="-5" r="8" fill="#1a0630" />
            <circle cx="26" cy="-18" r="9" fill="#1a0630" />
            {/* Grin with tongue out */}
            <path d="M-20 14 Q0 34 22 12" stroke="#1a0630" strokeWidth="5" strokeLinecap="round" />
            <path d="M-2 22 Q2 42 14 36 Q18 26 12 19" fill="#e0245e" stroke="#1a0630" strokeWidth="4" strokeLinejoin="round" />
          </g>
        </g>
      </g>
    </>
  )
}
