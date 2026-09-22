import assert from "node:assert/strict";
import { test } from "node:test";
import { inflateSync } from "node:zlib";
import { CONTENT_WIDTH, renderPdf, wrapText } from "../lib/pdf";

const decodeStreams = (pdf: Buffer): string => {
  const raw = pdf.toString("latin1");
  const out: string[] = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) out.push(inflateSync(Buffer.from(m[1], "latin1")).toString("latin1"));
  return out.join("\n");
};

test("wraps text without losing or splitting words", () => {
  const text = "Der Beschäftigte wird als Kurierfahrer eingesetzt und liefert mit einem Pedelec aus.";
  const lines = wrapText(text, 10.5, CONTENT_WIDTH);
  assert.ok(lines.length >= 1);
  assert.equal(lines.join(" ").replace(/\s+/g, " "), text);
  for (const l of lines) assert.ok(l.length <= Math.floor(CONTENT_WIDTH / (10.5 * 0.5)), `too long: ${l}`);
});

test("keeps blank lines between paragraphs", () => {
  assert.deepEqual(wrapText("one\n\ntwo", 10, 400), ["one", "", "two"]);
});

test("produces a structurally valid single-page PDF", () => {
  const pdf = renderPdf([{ text: "Arbeitsvertrag", size: 17, bold: true }, { text: "Hello" }]);
  const raw = pdf.toString("latin1");
  assert.ok(raw.startsWith("%PDF-1.4"), "header");
  assert.ok(raw.trimEnd().endsWith("%%EOF"), "trailer");
  assert.match(raw, /\/Type \/Catalog/);
  assert.match(raw, /\/Count 1\b/);
  assert.match(raw, /\/BaseFont \/Helvetica\b/);
  assert.match(raw, /\/BaseFont \/Helvetica-Bold\b/);
  // every object offset in the xref table must point at "<n> 0 obj"
  const count = Number(/\/Size (\d+)/.exec(raw)![1]);
  const offsets = [...raw.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  assert.equal(offsets.length, count - 1);
  offsets.forEach((off, i) => assert.ok(raw.startsWith(`${i + 1} 0 obj`, off), `object ${i + 1} offset wrong`));
});

test("flows onto more pages as content grows", () => {
  const many = Array.from({ length: 140 }, (_, i) => ({ text: `line ${i}` }));
  const raw = renderPdf(many).toString("latin1");
  const pageCount = Number(/\/Count (\d+)/.exec(raw)![1]);
  assert.ok(pageCount > 1, `expected multiple pages, got ${pageCount}`);
  assert.equal([...raw.matchAll(/\/Type \/Page[^s]/g)].length, pageCount);
});

test("escapes characters that would corrupt the file", () => {
  const content = decodeStreams(renderPdf([{ text: "a (b) c \\ d" }]));
  assert.match(content, /\\\(b\\\)/);
  assert.match(content, /\\\\/);
});

test("writes German characters as WinAnsi octal escapes", () => {
  const content = decodeStreams(renderPdf([{ text: "Beschäftigte Vergütung groß" }]));
  assert.match(content, /\\344/, "ä");
  assert.match(content, /\\374/, "ü");
  assert.match(content, /\\337/, "ß");
});
