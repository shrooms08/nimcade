/** Inline icons lifted from the design prototype. They draw in currentColor unless noted. */

export function PlayIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
      <path d="M4 2.5l7 4.5-7 4.5z" fill="currentColor" />
    </svg>
  )
}

export function StarIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
      <path d="M7 1.5l1.6 3.4 3.7.5-2.7 2.6.7 3.7L7 10l-3.3 1.7.7-3.7L1.7 5.4l3.7-.5z" fill="currentColor" />
    </svg>
  )
}

export function ShareIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 11V2.5M4.5 6L8 2.5 11.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 10v3.5h10V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function InfoIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeOpacity="0.5" />
      <path d="M7 5.5h2M8 7v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function NoticeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke="currentColor" />
      <path d="M7 4.5h2M8 7v4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function TrophyIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 2.5h8v3a4 4 0 01-8 0v-3z" fill="currentColor" />
      <path d="M6.5 10.5h3v2h-3z" fill="currentColor" />
      <path d="M4.5 13h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function CopyIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="5.5" y="2.5" width="8" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 13.5H4.5a2 2 0 01-2-2V5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

/** The tip-success check; its stroke draws itself over 300ms. */
export function DrawnCheck({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path className="nc-drawn-check" d="M8 17l6 6 11-13" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function SwipeUpIcon() {
  return (
    <svg width="26" height="34" viewBox="0 0 26 34" fill="none" aria-hidden="true">
      <path d="M13 31V9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M6 16l7-7 7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function OfflineIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 6.2a9 9 0 0112 0M4.3 8.6a5.6 5.6 0 017.4 0M6.6 11a2.2 2.2 0 012.8 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M2.5 2.5l11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
