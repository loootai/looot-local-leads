/** One CSV cell. Quotes when needed and stops spreadsheet formula injection (=, +, -, @ at the start). */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join("; ") : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV text from rows, with the given columns in order. */
export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: (keyof T & string)[]): string {
  return [columns.join(","), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n";
}
