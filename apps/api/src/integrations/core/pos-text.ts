/**
 * Tills without seats or tables in their data: staff put them in text the till does carry, such
 * as a note, a ticket name or a button ("Tafel 12", "Stoel 2", "S2").
 */
const TABLE_WORDS = /^(?:tafel|table|tbl|t)\s*[:#.-]?\s*/i;
const SEAT_IN_TEXT = /(?:^|\b)(?:stoel|seat|s)\s*[:#.-]?\s*(\d{1,2})\b/i;

/** "Tafel 12" → "12". Empty text gives undefined. */
export function tableInText(raw: string | undefined): string | undefined {
  const label = raw?.trim().replace(TABLE_WORDS, '').trim();
  return label || undefined;
}

/** The first "stoel 2" in any of the texts. */
export function seatInText(...texts: (string | undefined)[]): number | undefined {
  for (const t of texts) {
    const m = t?.match(SEAT_IN_TEXT);
    if (m) return Number(m[1]);
  }
  return undefined;
}
