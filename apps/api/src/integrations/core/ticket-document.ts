/**
 * A printed ticket as plain lines, and the two forms a CloudPRNT printer can take it in: plain
 * text, and Star Document Markup for big and bold type and a cut. Pure functions, so the layout
 * is tested without a printer.
 */
export type TicketLine =
  | { kind: 'title'; text: string }
  | { kind: 'text'; text: string; bold?: boolean }
  /** A point the cook ticks off by hand. */
  | { kind: 'check'; text: string }
  | { kind: 'rule' }
  | { kind: 'feed' };

/** Characters per line on 80 mm paper in the printer's standard font. */
export const DEFAULT_WIDTH = 42;

/** Breaks text into lines of at most `width` characters, on spaces where it can. */
export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let w = word;
      while (w.length > width) {
        if (line) {
          out.push(line);
          line = '';
        }
        out.push(w.slice(0, width));
        w = w.slice(width);
      }
      if (!line) line = w;
      else if (line.length + 1 + w.length <= width) line += ` ${w}`;
      else {
        out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

const CHECKBOX = '[ ] ';

export function toPlainText(lines: TicketLine[], width = DEFAULT_WIDTH): string {
  const out: string[] = [];
  for (const l of lines) {
    if (l.kind === 'rule') out.push('-'.repeat(width));
    else if (l.kind === 'feed') out.push('');
    else if (l.kind === 'title') out.push(...wrap(l.text.toUpperCase(), width));
    else if (l.kind === 'check') {
      const body = wrap(l.text, width - CHECKBOX.length);
      body.forEach((b, i) => out.push((i === 0 ? CHECKBOX : ' '.repeat(CHECKBOX.length)) + b));
    } else out.push(...wrap(l.text, width));
  }
  // Room to tear the paper off on printers without a cutter.
  return `${out.join('\n')}\n\n\n\n`;
}

/** Star Document Markup treats `[` as the start of a command; a backslash makes it text. */
const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/\[/g, '\\[');

export function toStarMarkup(lines: TicketLine[], width = DEFAULT_WIDTH): string {
  const out: string[] = [];
  for (const l of lines) {
    if (l.kind === 'rule') out.push('-'.repeat(width));
    else if (l.kind === 'feed') out.push('');
    else if (l.kind === 'title')
      out.push(
        `[align: centre][magnify: width 2; height 2][bold: on]${escape(l.text.toUpperCase())}[bold: off][magnify][align: left]`,
      );
    else if (l.kind === 'check') {
      const body = wrap(l.text, width - CHECKBOX.length);
      body.forEach((b, i) =>
        out.push(escape((i === 0 ? CHECKBOX : ' '.repeat(CHECKBOX.length)) + b)),
      );
    } else out.push(l.bold ? `[bold: on]${escape(l.text)}[bold: off]` : escape(l.text));
  }
  return `${out.join('\n')}\n[cut: feed; partial]`;
}
