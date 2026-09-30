// US cash-market clock. rTokens keep trading when this says "closed" — that gap is the product thesis.
// Note: ignores exchange holidays.
export function usMarketStatus(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday as string);
  const mins = (Number(parts.hour) % 24) * 60 + Number(parts.minute);
  const OPEN = 9 * 60 + 30, CLOSE = 16 * 60;
  const weekday = dow >= 1 && dow <= 5;
  const open = weekday && mins >= OPEN && mins < CLOSE;

  // minutes until next open / close
  let untilChange: number;
  if (open) untilChange = CLOSE - mins;
  else {
    let days = 0;
    if (weekday && mins < OPEN) days = 0;
    else days = dow === 5 ? 3 : dow === 6 ? 2 : 1;
    if (!weekday && dow === 0) days = 1;
    untilChange = days * 1440 + OPEN - mins;
  }
  const h = Math.floor(untilChange / 60), m = untilChange % 60;
  const inWeekendWindow = !open && (dow === 6 || dow === 0 || (dow === 5 && mins >= CLOSE) || (dow === 1 && mins < OPEN));
  return {
    open,
    nyTime: `${parts.weekday} ${parts.hour}:${parts.minute} ET`,
    label: open ? `US market open — closes in ${h}h ${m}m` : `US market closed — opens in ${h}h ${m}m`,
    hoursUntilChange: untilChange / 60,
    inWeekendWindow,
  };
}
