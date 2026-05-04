/**
 * Tiny CSV export helper.
 *
 * - UTF-8 BOM prefix so Excel on Windows opens the file correctly
 *   (handles emojis / non-ASCII usernames).
 * - Quotes every field, escapes embedded quotes by doubling them.
 * - Optional banner rows at the top for audit traceability — those rows
 *   live in the first column so spreadsheet apps still parse the rest
 *   as a normal table.
 */

function quote(value) {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Build a CSV string from an array of row objects and a column spec.
 *
 * @param {Array<Object>} rows
 * @param {Array<{key: string, header: string, get?: (row) => any}>} columns
 * @param {Object} [options]
 * @param {Array<string>} [options.banner] - audit lines prefixed with `# `
 * @returns {string}
 */
export function buildCsv(rows, columns, options = {}) {
  const lines = [];

  if (Array.isArray(options.banner)) {
    for (const line of options.banner) {
      lines.push(quote(`# ${line}`));
    }
  }

  lines.push(columns.map((c) => quote(c.header)).join(','));

  for (const row of rows || []) {
    const cells = columns.map((c) => {
      const raw = c.get ? c.get(row) : row[c.key];
      return quote(raw);
    });
    lines.push(cells.join(','));
  }

  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

/**
 * Trigger a browser download of the given CSV string.
 * No-op on the server.
 */
export function downloadCsv(csvString, filename) {
  if (typeof window === 'undefined') return;
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Defer revoke so the click has time to register on slow phones
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Convenience: build + download in one shot.
 */
export function exportCsv(rows, columns, filename, options) {
  const csv = buildCsv(rows, columns, options);
  downloadCsv(csv, filename);
  return csv;
}

/**
 * Sanitize a string for safe inclusion in a filename.
 */
export function safeFilenamePart(str) {
  return String(str || 'export')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'export';
}
