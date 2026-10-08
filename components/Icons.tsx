// Small line icons drawn as SVG (stroke = currentColor). No icon font, no emoji.
type P = { size?: number };

export const Arrow = ({ size = 14 }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" /></svg>
);
export const ArrowUpRight = ({ size = 14 }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden><path d="M5 11l6-6M6 5h5v5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" /></svg>
);
export const Send = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden><path d="M8 13V3M4 7l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" /></svg>
);
export const Plus = ({ size = 14 }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" /></svg>
);
export const Close = ({ size = 14 }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" /></svg>
);
export const Chevron = ({ size = 12 }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden><path d="M5 6l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" /></svg>
);
