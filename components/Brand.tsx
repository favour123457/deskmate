// Quil brand: a quill feather drawn as a single monochrome SVG (no emoji, no gradient) + wordmark.
export const BRAND = "Quil";

export function QuilMark({ size = 22, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden fill="none">
      {/* vane */}
      <path d="M27.5 3.5C19.4 4.1 11.9 9.3 9.1 18.2L8.2 22.4L12.4 21.4C21.1 18.4 26.4 11.2 27.5 3.5Z" fill={color} />
      {/* shaft cut through the vane, and barb notches */}
      <path d="M25 6.6L10.6 21" stroke="#000" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M15.6 12.3l3.3-.2M12.9 15.6l3.2-.1" stroke="#000" strokeWidth="1.2" strokeLinecap="round" />
      {/* nib */}
      <path d="M10.4 21.2L4.5 27.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span className="wordmark">
      <QuilMark size={size} />
      <span className="wordmark-name">{BRAND}</span>
    </span>
  );
}
