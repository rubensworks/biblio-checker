import { cleanValue, parseAuthors, parseBibtex } from '../src/lib/bibtex';

describe('parseBibtex', () => {
  it('parses a minimal entry', () => {
    const entries = parseBibtex(`@inproceedings{key_2020,
  author = {Doe, Jane and Roe, Richard},
  title  = {A title},
  year   = {2020},
}`);

    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe('key_2020');
    expect(entries[0].entryType).toBe('inproceedings');
    expect(entries[0].fields.title).toBe('A title');
    expect(entries[0].fields.year).toBe('2020');
  });

  it('parses multiple entries', () => {
    const entries = parseBibtex(`@article{a, title = {First}}
@inproceedings{b, title = {Second}}`);

    expect(entries.map((entry): string => entry.key)).toEqual([ 'a', 'b' ]);
  });

  it('handles nested braces in values', () => {
    const entries = parseBibtex('@article{a, title = {A {Nested} title}, year = {2021}}');

    expect(entries[0].fields.title).toBe('A Nested title');
    expect(entries[0].fields.year).toBe('2021');
  });

  it('handles quoted values', () => {
    const entries = parseBibtex('@article{a, title = "Quoted title", year = "2021"}');

    expect(entries[0].fields.title).toBe('Quoted title');
    expect(entries[0].fields.year).toBe('2021');
  });

  it('handles multi-line values and collapses whitespace', () => {
    const entries = parseBibtex(`@article{a,
  abstract = {
    Line one
    line two
  },
}`);

    expect(entries[0].fields.abstract).toBe('Line one line two');
  });

  it('lowercases field names', () => {
    const entries = parseBibtex('@inbook{a, bookTitle = {Some book}}');

    expect(entries[0].fields.booktitle).toBe('Some book');
  });

  it('keeps underscore-prefixed custom fields', () => {
    const entries = parseBibtex('@article{a, _type = {Journal}}');

    expect(entries[0].fields._type).toBe('Journal');
  });

  it('skips comment, string and preamble blocks', () => {
    const entries = parseBibtex(`@comment{ignored}
@string{x = "y"}
@article{a, title = {Kept}}`);

    expect(entries.map((entry): string => entry.key)).toEqual([ 'a' ]);
  });

  it('returns nothing for input without entries', () => {
    expect(parseBibtex('')).toEqual([]);
    expect(parseBibtex('just some text')).toEqual([]);
  });

  it('parses every entry of a document with unusual spacing', () => {
    const entries = parseBibtex('@article {a, title={T1}}\n@article{ b , title={T2}}');

    expect(entries).toHaveLength(2);
  });
});

describe('cleanValue', () => {
  it('resolves escaped characters', () => {
    expect(cleanValue('R\\&D')).toBe('R&D');
    expect(cleanValue('100\\%')).toBe('100%');
  });

  it('resolves accents', () => {
    expect(cleanValue('Verborgh, R\\\'{u}ben')).toBe('Verborgh, Ruben');
  });

  it('turns non-breaking spaces into spaces', () => {
    expect(cleanValue('a~b')).toBe('a b');
  });
});

describe('parseAuthors', () => {
  it('splits on and', () => {
    expect(parseAuthors('Jane Doe and Richard Roe')).toEqual([ 'Jane Doe', 'Richard Roe' ]);
  });

  it('flips last-first names', () => {
    expect(parseAuthors('Doe, Jane and Roe, Richard')).toEqual([ 'Jane Doe', 'Richard Roe' ]);
  });

  it('keeps single-part names', () => {
    expect(parseAuthors('Plato')).toEqual([ 'Plato' ]);
    expect(parseAuthors('Plato,')).toEqual([ 'Plato' ]);
  });

  it('returns nothing without an author field', () => {
    expect(parseAuthors(undefined)).toEqual([]);
    expect(parseAuthors('')).toEqual([]);
  });
});
