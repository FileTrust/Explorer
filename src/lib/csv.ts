/// A table as a CSV file the browser saves.
///
/// Cells are quoted when they need to be, and a cell that a spreadsheet would
/// read as a formula (=, +, -, @) is prefixed with a quote mark: these cells hold
/// addresses and method names that came from the chain, and a chain string must
/// not become a formula in someone's spreadsheet.
export function toCsv(header: string[], rows: Array<Array<string | number | bigint | null | undefined>>): string {
  const cell = (value: string | number | bigint | null | undefined) => {
    let text = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [header, ...rows].map(row => row.map(cell).join(',')).join('\r\n');
}

export function downloadCsv(filename: string, header: string[], rows: Array<Array<string | number | bigint | null | undefined>>) {
  const blob = new Blob([toCsv(header, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
