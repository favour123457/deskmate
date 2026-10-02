// The trader profile: quick-pick answers that become one plain sentence the analyst reads.
export type ProfileAnswers = {
  size: string;
  risk: string;
  weekends: string;
  place: string;
  notes: string;
};

export const SIZE_OPTIONS = ["Under $500", "$500 – $2,000", "$2,000 – $10,000", "Over $10,000"];
export const RISK_OPTIONS = [
  { value: "Careful", hint: "Protect what I have" },
  { value: "Balanced", hint: "Some swings are fine" },
  { value: "Aggressive", hint: "Big swings for big upside" },
];
export const WEEKEND_OPTIONS = ["Usually hold", "Sometimes", "Close before Friday"];

export const DEFAULT_ANSWERS: ProfileAnswers = {
  size: "$500 – $2,000",
  risk: "Balanced",
  weekends: "Usually hold",
  place: "Lagos",
  notes: "Student. I can't watch the US session live.",
};

export function detectPlace(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const city = tz.split("/").pop()?.replace(/_/g, " ");
    return city || DEFAULT_ANSWERS.place;
  } catch {
    return DEFAULT_ANSWERS.place;
  }
}

export function profileText(a: ProfileAnswers): string {
  const weekend =
    a.weekends === "Usually hold" ? "usually holds positions through the weekend"
      : a.weekends === "Sometimes" ? "sometimes holds through the weekend"
        : "closes positions before the Friday US close";
  const parts = [
    `Trades from ${a.place || "outside the US"}.`,
    `Book size ${a.size}.`,
    `Risk appetite: ${a.risk.toLowerCase()}.`,
    `${weekend[0].toUpperCase()}${weekend.slice(1)}.`,
  ];
  if (a.notes.trim()) parts.push(a.notes.trim());
  return parts.join(" ");
}

export function profileSummary(a: ProfileAnswers): string {
  return `${a.size}, ${a.risk.toLowerCase()}`;
}

const KEY = "dm.profileAnswers";

export function loadAnswers(): ProfileAnswers | null {
  try {
    const v = localStorage.getItem(KEY);
    return v ? { ...DEFAULT_ANSWERS, ...(JSON.parse(v) as Partial<ProfileAnswers>) } : null;
  } catch {
    return null;
  }
}

export function saveAnswers(a: ProfileAnswers) {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
    localStorage.setItem("dm.profile", JSON.stringify(profileText(a)));
    localStorage.setItem("dm.onboarded", "1");
  } catch {
    /* storage unavailable: the desk falls back to the example profile */
  }
}
