/** RFC 4180 quoting, plus a leading apostrophe on formula-looking cells so Excel never executes them. */
export function csvEscape(value: string | number | null | undefined): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
