import type { CardMark, CardRow } from '@plateguard/domain';
import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';

export interface CardInput {
  title: string;
  subtitle: string;
  /** Column headings: the allergen names, in card order. */
  allergens: { code: string; name: string }[];
  rows: CardRow[];
  legend: Record<Exclude<CardMark, null>, string>;
  footer: string;
  page: (n: number, of: number) => string;
}

const A4 = { w: 841.89, h: 595.28 };
const M = 36;
const COL = 33;
const ROW = 19;
const HEAD = 92;
const INK = rgb(0.1, 0.11, 0.13);
const SOFT = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.86, 0.87, 0.9);
const BAND = rgb(0.965, 0.97, 0.98);

/** The standard PDF fonts only know Windows-1252: anything else would make pdf-lib throw. */
const safe = (s: string) => s.replace(/→/g, '->').replace(/[^\x20-\x7E\xA0-\xFF€‘’“”–—•…]/g, '?');

function fit(text: string, font: PDFFont, size: number, width: number) {
  let t = safe(text);
  if (font.widthOfTextAtSize(t, size) <= width) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > width) t = t.slice(0, -1);
  return `${t}…`;
}

function mark(page: PDFPage, m: CardMark, x: number, y: number, bold: PDFFont) {
  if (m === 'CONTAINS') page.drawCircle({ x, y, size: 4.6, color: INK });
  else if (m === 'ON_REQUEST')
    page.drawCircle({ x, y, size: 4.2, borderColor: INK, borderWidth: 1.4 });
  else if (m === 'TRACES') page.drawCircle({ x, y, size: 1.9, color: SOFT });
  else if (m === 'UNKNOWN')
    page.drawText('?', { x: x - 2.6, y: y - 3.4, size: 10, font: bold, color: INK });
}

/**
 * The printable allergen card of one published menu: every dish against the 14 EU allergens,
 * landscape A4, with the legend and the version on every page. Text is passed in translated.
 */
export async function renderAllergenCard(input: CardInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(safe(input.title));
  doc.setSubject(safe(input.subtitle));
  doc.setProducer('PlateGuard');
  doc.setCreator('PlateGuard');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const gridW = COL * input.allergens.length;
  const nameW = A4.w - 2 * M - gridW;
  const top = A4.h - M - 46;
  const bottom = M + 44;
  const perPage = Math.max(1, Math.floor((top - HEAD - bottom) / ROW));
  const pages = Math.max(1, Math.ceil(input.rows.length / perPage));

  for (let p = 0; p < pages; p++) {
    const page = doc.addPage([A4.w, A4.h]);
    page.drawText(safe(input.title), { x: M, y: A4.h - M - 18, size: 20, font: bold, color: INK });
    page.drawText(fit(input.subtitle, font, 10, A4.w - 2 * M), {
      x: M,
      y: A4.h - M - 34,
      size: 10,
      font,
      color: SOFT,
    });

    // Column headings, turned so long allergen names fit.
    input.allergens.forEach((a, i) => {
      const cx = M + nameW + i * COL + COL / 2;
      page.drawText(fit(a.name, bold, 9, HEAD - 8), {
        x: cx + 3,
        y: top - HEAD + 6,
        size: 9,
        font: bold,
        color: INK,
        rotate: degrees(90),
      });
    });
    page.drawLine({
      start: { x: M, y: top - HEAD },
      end: { x: A4.w - M, y: top - HEAD },
      thickness: 1,
      color: INK,
    });

    const rows = input.rows.slice(p * perPage, (p + 1) * perPage);
    rows.forEach((row, r) => {
      const y = top - HEAD - (r + 1) * ROW;
      if (r % 2 === 1)
        page.drawRectangle({ x: M, y, width: A4.w - 2 * M, height: ROW, color: BAND });
      page.drawText(fit(row.dish.name, font, 10, nameW - 8), {
        x: M + 4,
        y: y + 6,
        size: 10,
        font,
        color: INK,
      });
      input.allergens.forEach((a, i) =>
        mark(page, row.marks[a.code] ?? null, M + nameW + i * COL + COL / 2, y + ROW / 2, bold),
      );
    });
    for (let i = 0; i <= input.allergens.length; i++) {
      const x = M + nameW + i * COL;
      page.drawLine({
        start: { x, y: top - HEAD - rows.length * ROW },
        end: { x, y: top - 4 },
        thickness: 0.5,
        color: LINE,
      });
    }

    // Legend and footer on every page, so a single printed page still explains itself.
    let lx = M;
    const ly = M + 22;
    for (const m of ['CONTAINS', 'ON_REQUEST', 'TRACES', 'UNKNOWN'] as const) {
      mark(page, m, lx + 5, ly + 3, bold);
      const label = safe(input.legend[m]);
      page.drawText(label, { x: lx + 14, y: ly, size: 9, font, color: INK });
      lx += 14 + font.widthOfTextAtSize(label, 9) + 22;
    }
    page.drawText(fit(input.footer, font, 8, A4.w - 2 * M - 70), {
      x: M,
      y: M,
      size: 8,
      font,
      color: SOFT,
    });
    const pn = safe(input.page(p + 1, pages));
    page.drawText(pn, {
      x: A4.w - M - font.widthOfTextAtSize(pn, 8),
      y: M,
      size: 8,
      font,
      color: SOFT,
    });
  }
  return doc.save();
}
