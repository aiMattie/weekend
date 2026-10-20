"use client";

/** Rail icon for Meetings: a speech bubble with a waveform (outlined, 24px grid like the other rail icons). */
type P = { size?: number | string; className?: string };

export function MeetingsIcon({ size, className }: P) {
  return (
    <svg width={size ?? 24} height={size ?? 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M4 5.5h16v10H9l-4 3.5v-3.5H4z" /><path d="M9 9v3M12 8v5M15 9.5v2" />
    </svg>
  );
}
