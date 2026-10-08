// Lamplight mark: a lamp flame with a rising price line inside it, on a lamp base. Flat ruby, no gradients.
export const BRAND = "Lamplight";

export function LogoMark({ size = 28, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <path d="M17.6 2.4C17.3 5.6 20 7.9 21.9 10.6C23.2 12.5 23.8 14.6 23.8 16.9A7.8 7.8 0 0 1 8.2 16.9C8.2 13.6 9.9 11.1 11.9 9.1C12.3 10.9 13.1 11.9 14 12.4C13.5 8.6 15.1 5 17.6 2.4Z" fill="#d61f55" />
      <path d="M12.2 19.6l2.6-2.8 2 1.6 3.1-3.8" fill="none" stroke="#fff3ea" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.6 27.2h14.8" stroke="#d61f55" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="brandmark">
      <LogoMark size={size} />
      <span className="brandmark-name">{BRAND}</span>
    </span>
  );
}
