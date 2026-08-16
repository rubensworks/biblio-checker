/**
 * A single parsed BibTeX entry.
 */
export interface IBibtexEntry {
  /**
   * The BibTeX citation key, such as `taelman_iswc_gtfs_2016`.
   */
  key: string;
  /**
   * The BibTeX entry type in lowercase, such as `inproceedings`.
   */
  entryType: string;
  /**
   * All fields of the entry, keyed by lowercased field name.
   */
  fields: Record<string, string>;
}

const LATEX_COMMANDS: [ RegExp, string ][] = [
  [ /\\&/gu, '&' ],
  [ /\\%/gu, '%' ],
  [ /\\\$/gu, '$' ],
  [ /\\#/gu, '#' ],
  [ /\\_/gu, '_' ],
  [ /\\'\{?([A-Za-z])\}?/gu, '$1' ],
  [ /\\`\{?([A-Za-z])\}?/gu, '$1' ],
  [ /\\"\{?([A-Za-z])\}?/gu, '$1' ],
  [ /\\\^\{?([A-Za-z])\}?/gu, '$1' ],
  [ /\\~\{?([A-Za-z])\}?/gu, '$1' ],
  [ /\\c\{?([A-Za-z])\}?/gu, '$1' ],
  [ /\\v\{?([A-Za-z])\}?/gu, '$1' ],
  [ /\\textquotesingle/gu, '\'' ],
  [ /\\ldots/gu, '…' ],
  [ /~/gu, ' ' ],
];

/**
 * Clean up a raw BibTeX field value into plain text.
 *
 * This unwraps brace-protected segments, resolves the most common LaTeX escapes,
 * and collapses whitespace.
 *
 * @param value A raw BibTeX field value, without its surrounding delimiters.
 * @returns The cleaned plain text value.
 */
export function cleanValue(value: string): string {
  let cleaned = value;
  for (const [ pattern, replacement ] of LATEX_COMMANDS) {
    cleaned = cleaned.replaceAll(pattern, replacement);
  }
  cleaned = cleaned.replaceAll(/[{}]/gu, '');
  return cleaned.replaceAll(/\s+/gu, ' ').trim();
}

/**
 * Read a delimited value starting at the given offset.
 *
 * Supports `{ ... }` and `" ... "` delimited values as well as bare values.
 *
 * @param text The full BibTeX document.
 * @param start The offset of the first character of the value.
 * @returns The raw value and the offset just after it.
 */
function readValue(text: string, start: number): { value: string; end: number } {
  let index = start;
  while (index < text.length && /\s/u.test(text[index])) {
    index++;
  }

  if (text[index] === '{') {
    let depth = 0;
    for (let cursor = index; cursor < text.length; cursor++) {
      if (text[cursor] === '{') {
        depth++;
      } else if (text[cursor] === '}') {
        depth--;
        if (depth === 0) {
          return { value: text.slice(index + 1, cursor), end: cursor + 1 };
        }
      }
    }
    return { value: text.slice(index + 1), end: text.length };
  }

  if (text[index] === '"') {
    const closing = text.indexOf('"', index + 1);
    if (closing === -1) {
      return { value: text.slice(index + 1), end: text.length };
    }
    return { value: text.slice(index + 1, closing), end: closing + 1 };
  }

  const match = /[,}]/u.exec(text.slice(index));
  const end = match ? index + match.index : text.length;
  return { value: text.slice(index, end), end };
}

/**
 * Parse a BibTeX document into entries.
 *
 * The parser is intentionally forgiving: unknown constructs and `@comment`/`@string`
 * blocks are skipped rather than reported as errors.
 *
 * @param text The contents of a `.bib` file.
 * @returns All entries in document order.
 */
export function parseBibtex(text: string): IBibtexEntry[] {
  const entries: IBibtexEntry[] = [];
  const entryPattern = /@(\w+)\s*\{\s*([^,\s]+)\s*,/gu;

  let match = entryPattern.exec(text);
  while (match !== null) {
    const entryType = match[1].toLowerCase();
    if (entryType === 'comment' || entryType === 'string' || entryType === 'preamble') {
      match = entryPattern.exec(text);
      continue;
    }

    const fields: Record<string, string> = {};
    let cursor = match.index + match[0].length;
    let depth = 1;

    while (cursor < text.length && depth > 0) {
      const fieldPattern = /\s*([\w-]+)\s*=/uy;
      fieldPattern.lastIndex = cursor;
      const fieldMatch = fieldPattern.exec(text);

      if (fieldMatch) {
        const { value, end } = readValue(text, fieldPattern.lastIndex);
        fields[fieldMatch[1].toLowerCase()] = cleanValue(value);
        cursor = end;
      } else {
        const character = text[cursor];
        if (character === '{') {
          depth++;
        } else if (character === '}') {
          depth--;
        }
        cursor++;
      }
    }

    entries.push({ key: match[2], entryType, fields });
    entryPattern.lastIndex = cursor;
    match = entryPattern.exec(text);
  }

  return entries;
}

/**
 * Split a BibTeX author field into individual author names.
 *
 * Names in `Last, First` order are flipped into `First Last` order.
 *
 * @param authorField The raw value of an `author` or `editor` field.
 * @returns The individual author names, in order.
 */
export function parseAuthors(authorField: string | undefined): string[] {
  if (!authorField) {
    return [];
  }
  return authorField
    .split(/\s+and\s+/u)
    .map((name): string => {
      const trimmed = name.trim();
      const comma = trimmed.indexOf(',');
      if (comma === -1) {
        return trimmed;
      }
      const last = trimmed.slice(0, comma).trim();
      const first = trimmed.slice(comma + 1).trim();
      return first ? `${first} ${last}` : last;
    })
    .filter((name): boolean => name.length > 0);
}
