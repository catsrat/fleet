import { deflateSync } from "node:zlib";

// Minimal PDF writer: enough for text documents such as contracts, with no dependency to keep patched.
// WinAnsi encoding covers German characters; anything outside it becomes "?".

export interface PdfLine {
  text: string;
  size?: number;
  bold?: boolean;
  /** Blank space above this line, in points. */
  spaceBefore?: number;
}

const PAGE_WIDTH = 595; // A4 at 72 dpi
const PAGE_HEIGHT = 842;
const MARGIN = 56;
const BOTTOM = 64;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// Characters that exist in WinAnsi but not in Latin-1, at their WinAnsi code points.
const WINANSI: Record<string, number> = { "€": 128, "‚": 130, "„": 132, "…": 133, "‘": 145, "’": 146, "“": 147, "”": 148, "–": 150, "—": 151 };

function pdfString(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = WINANSI[ch] ?? ch.codePointAt(0)!;
    if (ch === "\\" || ch === "(" || ch === ")") out += `\\${ch}`;
    else if (code < 32) out += " ";
    else if (code > 126 && code < 256) out += `\\${code.toString(8).padStart(3, "0")}`;
    else if (code < 256) out += ch;
    else out += "?";
  }
  return out;
}

/** Greedy word wrap using an average glyph width; Helvetica averages about 0.5 em. */
export function wrapText(text: string, size: number, maxWidth: number): string[] {
  const max = Math.max(8, Math.floor(maxWidth / (size * 0.5)));
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph.trim()) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (!line) line = word;
      else if (line.length + 1 + word.length <= max) line += " " + word;
      else {
        out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

/**
 * Renders lines into a multi-page A4 PDF.
 * Object layout is fixed: 1 catalog, 2 pages, 3 regular font, 4 bold font, then a page and a content
 * stream per page — so page n lives at object 5 + 2n and its stream at 6 + 2n.
 */
export function renderPdf(lines: PdfLine[]): Buffer {
  const pages: string[] = [];
  let content = "";
  let y = PAGE_HEIGHT - MARGIN;

  for (const line of lines) {
    const size = line.size ?? 10.5;
    const leading = size * 1.5;
    y -= line.spaceBefore ?? 0;
    if (y - leading < BOTTOM) {
      pages.push(content);
      content = "";
      y = PAGE_HEIGHT - MARGIN;
    }
    y -= leading;
    content += `BT ${line.bold ? "/F2" : "/F1"} ${size} Tf 1 0 0 1 ${MARGIN} ${y.toFixed(2)} Tm (${pdfString(line.text)}) Tj ET\n`;
  }
  pages.push(content);

  const firstPageObj = 5;
  const objects: string[] = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${firstPageObj + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`,
  ];
  pages.forEach((page, i) => {
    const stream = deflateSync(Buffer.from(page, "latin1"));
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${firstPageObj + i * 2 + 1} 0 R >>`,
    );
    objects.push(`<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n${stream.toString("latin1")}\nendstream`);
  });

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}
