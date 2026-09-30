// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

export const TABLE_FENCE_LANGUAGE = 'muninn-table';
export const DEFAULT_TABLE_SOURCE = '| Column 1 | Column 2 |\n| --- | --- |\n| Value 1 | Value 2 |';

type Cell = { value: string; from: number; to: number };
type TableSource = { lines: string[]; headers: string[]; rows: string[][]; eol: string };
export type MarkdownTable = {
  headers: string[];
  rows: string[][];
  alignments?: ('left' | 'center' | 'right' | undefined)[];
  source?: TableSource;
};

const rowCells = (line: string): Cell[] => {
  const boundaries: number[] = [];
  let slashes = 0;
  let index = 0;
  for (const character of line) {
    if (character === '|' && slashes % 2 === 0) boundaries.push(index);
    slashes = character === '\\' ? slashes + 1 : 0;
    index += character.length;
  }
  const start =
    boundaries[0] !== undefined && line.slice(0, boundaries[0]).trim() === ''
      ? boundaries.shift()! + 1
      : 0;
  const last = boundaries.at(-1);
  const end =
    last !== undefined && line.slice(last + 1).trim() === '' ? boundaries.pop()! : line.length;
  const cells: Cell[] = [];
  let from = start;
  for (const to of [...boundaries, end]) {
    cells.push({ value: line.slice(from, to).trim(), from, to });
    from = to + 1;
  }
  return cells;
};

export const isTableDelimiterLine = (line: string): boolean => {
  const cells = rowCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell.value));
};

const escapeCell = (value: string): string => {
  let escaped = '';
  let slashes = 0;
  for (const character of value.replaceAll(/\r?\n/g, ' ')) {
    if (character === '|' && slashes % 2 === 0) escaped += '\\';
    escaped += character;
    slashes = character === '\\' ? slashes + 1 : 0;
  }
  return escaped;
};

const rowSource = (values: string[], original?: string): string => {
  if (original === undefined)
    return '| ' + values.map((value) => escapeCell(value)).join(' | ') + ' |';
  const cells = rowCells(original);
  if (cells.length !== values.length)
    return '| ' + values.map((value) => escapeCell(value)).join(' | ') + ' |';
  let result = original;
  for (let index = cells.length - 1; index >= 0; index--) {
    const cell = cells[index];
    if (cell.value === values[index]) continue;
    const raw = original.slice(cell.from, cell.to);
    const leading = /^\s*/.exec(raw)?.[0] ?? '';
    const trailing = /\s*$/.exec(raw)?.[0] ?? '';
    result =
      result.slice(0, cell.from) +
      leading +
      escapeCell(values[index]) +
      (raw.trim() ? trailing : '') +
      result.slice(cell.to);
  }
  return result;
};

export const parseMarkdownTable = (source: string): MarkdownTable => {
  const lines = source.split(/\r?\n/);
  while (lines.length > 2 && lines.at(-1) === '') lines.pop();
  if (lines.length < 2 || !isTableDelimiterLine(lines[1]))
    throw new Error('Invalid Markdown table.');
  const headers = rowCells(lines[0]).map((cell) => cell.value);
  const rows = lines.slice(2).map((line) => rowCells(line).map((cell) => cell.value));
  const alignments = rowCells(lines[1]).map((cell): 'left' | 'right' | 'center' | undefined => {
    const left = cell.value.startsWith(':');
    const right = cell.value.endsWith(':');
    if (left && right) return 'center';
    if (left) return 'left';
    if (right) return 'right';
    return undefined;
  });
  return {
    headers,
    rows,
    alignments,
    source: {
      lines,
      headers: [...headers],
      rows: rows.map((row) => [...row]),
      eol: source.includes('\r\n') ? '\r\n' : '\n',
    },
  };
};

export const serializeMarkdownTable = (table: MarkdownTable): string => {
  const columns = Math.max(1, table.headers.length);
  const oldLines = table.source?.lines;
  const delimiters = table.alignments ?? [];
  const delimiter =
    oldLines && rowCells(oldLines[1]).length === columns
      ? oldLines[1]
      : '| ' +
        Array.from(
          { length: columns },
          (_, index) =>
            ({ left: ':---', right: '---:', center: ':---:', none: '---' })[
              delimiters[index] ?? 'none'
            ],
        ).join(' | ') +
        ' |';
  return [
    rowSource(table.headers, oldLines?.[0]),
    delimiter,
    ...table.rows.map((row, index) => rowSource(row, oldLines?.[index + 2])),
  ].join(table.source?.eol ?? '\n');
};

export const normalizeTableSource = (source: string): string => {
  if (!source.trim()) return DEFAULT_TABLE_SOURCE;
  parseMarkdownTable(source);
  return source;
};
