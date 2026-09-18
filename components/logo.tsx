export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span
        aria-hidden="true"
        className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
        </svg>
      </span>
      <span className="font-display text-lg font-semibold tracking-tight text-foreground">
        Dom<span className="text-primary">Track</span>
      </span>
    </span>
  )
}
