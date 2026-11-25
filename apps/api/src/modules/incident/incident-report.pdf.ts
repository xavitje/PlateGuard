import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';

/** One block of the report: a heading and lines of "label: value" or plain text. */
export interface ReportSection {
  title: string;
  rows: { label?: string; text: string }[];
}

export interface ReportInput {
  title: string;
  subtitle: string;
  sections: ReportSection[];
  footer: string;
  page: (n: number, of: number) => string;
}

const A4 = { w: 595.28, h: 841.89 };
const M = 48;
const INK = rgb(0.1, 0.11, 0.13);
const SOFT = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.86, 0.87, 0.9);
const LABEL_W = 130;
const SIZE = 10;
const LEAD = 14;

/** The standard PDF fonts only know Windows-1252: anything else would make pdf-lib throw. */
const safe = (s: string) => s.replace(/→/g, '->').replace(/[^\x20-\x7E\xA0-\xFF€‘’“”–—•…\n]/g, '?');

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of safe(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) line = next;
      else {
        if (line) out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

/**
 * An incident report for the file: portrait A4, the report and the frozen facts in sections,
 * flowing over as many pages as needed, with the page number and a footer on each.
 */
export async function renderIncidentReport(input: ReportInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(safe(input.title));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;
  const newPage = () => {
    page = doc.addPage([A4.w, A4.h]);
    pages.push(page);
    y = A4.h - M;
  };
  const need = (h: number) => {
    if (y - h < M + 24) newPage();
  };

  newPage();
  page.drawText(safe(input.title), { x: M, y: y - 20, size: 20, font: bold, color: INK });
  y -= 38;
  for (const l of wrap(input.subtitle, font, 11, A4.w - 2 * M)) {
    page.drawText(l, { x: M, y, size: 11, font, color: SOFT });
    y -= 16;
  }
  y -= 8;

  for (const s of input.sections) {
    need(48);
    y -= 10;
    page.drawText(safe(s.title), { x: M, y, size: 12.5, font: bold, color: INK });
    y -= 6;
    page.drawLine({
      start: { x: M, y },
      end: { x: A4.w - M, y },
      thickness: 0.7,
      color: LINE,
    });
    y -= LEAD;
    for (const row of s.rows) {
      const x = row.label !== undefined ? M + LABEL_W : M;
      const lines = wrap(row.text || '—', font, SIZE, A4.w - M - x);
      need(lines.length * LEAD);
      if (row.label !== undefined)
        for (const [i, l] of wrap(row.label, bold, SIZE, LABEL_W - 10).entries())
          page.drawText(l, { x: M, y: y - i * LEAD, size: SIZE, font: bold, color: SOFT });
      for (const l of lines) {
        page.drawText(l, { x, y, size: SIZE, font, color: INK });
        y -= LEAD;
      }
      y -= 2;
    }
  }

  pages.forEach((p, i) => {
    p.drawText(safe(input.footer), { x: M, y: M - 18, size: 8, font, color: SOFT });
    const n = safe(input.page(i + 1, pages.length));
    p.drawText(n, {
      x: A4.w - M - font.widthOfTextAtSize(n, 8),
      y: M - 18,
      size: 8,
      font,
      color: SOFT,
    });
  });
  return doc.save();
}
