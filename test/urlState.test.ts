import type { ICheckOptions } from '../src/lib/checker';
import { fromFragment, toFragment } from '../src/lib/urlState';

const DEFAULTS: ICheckOptions = {
  bibtexUrl: 'https://example.org/references.bib',
  biblioQuery: 'ugent_id:1',
  deepCheck: true,
  checkPublishers: true,
  findPdfs: true,
  openAlexApiKey: '',
};

describe('toFragment', () => {
  it('is empty for the default view', () => {
    expect(toFragment(DEFAULTS, DEFAULTS)).toBe('');
  });

  it('writes only what differs from the defaults', () => {
    expect(toFragment({ ...DEFAULTS, biblioQuery: 'ugent_id:2' }, DEFAULTS)).toBe('q=ugent_id%3A2');
  });

  it('writes every changed setting', () => {
    const fragment = toFragment({
      ...DEFAULTS,
      bibtexUrl: 'https://example.org/other.bib',
      biblioQuery: 'ugent_id:2',
      deepCheck: false,
      checkPublishers: false,
      findPdfs: false,
    }, DEFAULTS);

    expect(new URLSearchParams(fragment).get('bib')).toBe('https://example.org/other.bib');
    expect(new URLSearchParams(fragment).get('q')).toBe('ugent_id:2');
    expect(new URLSearchParams(fragment).get('deep')).toBe('0');
    expect(new URLSearchParams(fragment).get('publishers')).toBe('0');
    expect(new URLSearchParams(fragment).get('pdfs')).toBe('0');
  });

  it('writes a flag that was turned on against a default of off', () => {
    expect(toFragment({ ...DEFAULTS, deepCheck: true }, { ...DEFAULTS, deepCheck: false })).toBe('deep=1');
  });

  it('never writes the OpenAlex API key', () => {
    const fragment = toFragment({ ...DEFAULTS, openAlexApiKey: 'secret-key' }, DEFAULTS);

    expect(fragment).toBe('');
    expect(fragment).not.toContain('secret-key');
  });

  it('keeps the key out even when other settings changed', () => {
    const fragment = toFragment({ ...DEFAULTS, openAlexApiKey: 'secret-key', deepCheck: false }, DEFAULTS);

    expect(fragment).not.toContain('secret-key');
    expect(fragment).not.toContain('key');
  });
});

describe('fromFragment', () => {
  it('reads nothing out of an empty fragment', () => {
    expect(fromFragment('')).toEqual({});
    expect(fromFragment('#')).toEqual({});
  });

  it('tolerates a leading hash', () => {
    expect(fromFragment('#q=ugent_id%3A2')).toEqual({ biblioQuery: 'ugent_id:2' });
    expect(fromFragment('q=ugent_id%3A2')).toEqual({ biblioQuery: 'ugent_id:2' });
  });

  it('reads every setting', () => {
    expect(fromFragment('#bib=https%3A%2F%2Fexample.org%2Fo.bib&q=ugent_id%3A2&deep=0&publishers=0&pdfs=0'))
      .toEqual({
        bibtexUrl: 'https://example.org/o.bib',
        biblioQuery: 'ugent_id:2',
        deepCheck: false,
        checkPublishers: false,
        findPdfs: false,
      });
  });

  it('accepts the usual spellings of a flag', () => {
    expect(fromFragment('#deep=true')).toEqual({ deepCheck: true });
    expect(fromFragment('#deep=YES')).toEqual({ deepCheck: true });
    expect(fromFragment('#deep=off')).toEqual({ deepCheck: false });
    expect(fromFragment('#deep=0')).toEqual({ deepCheck: false });
  });

  it('ignores a flag it cannot read, rather than guessing', () => {
    expect(fromFragment('#deep=maybe')).toEqual({});
  });

  it('ignores empty and unknown parameters', () => {
    expect(fromFragment('#q=&bib=%20&nonsense=1')).toEqual({});
  });

  it('never reads an API key out of a link', () => {
    expect(fromFragment('#openAlexApiKey=secret&key=secret&api_key=secret')).toEqual({});
  });

  it('survives a fragment that is not a query string at all', () => {
    expect(fromFragment('#some-anchor')).toEqual({});
  });

  it('round-trips the settings it carries', () => {
    const options: ICheckOptions = {
      ...DEFAULTS,
      bibtexUrl: 'https://example.org/other.bib',
      biblioQuery: 'ugent_id:802001410273',
      deepCheck: false,
      checkPublishers: true,
      findPdfs: false,
      openAlexApiKey: 'secret-key',
    };

    expect({ ...DEFAULTS, ...fromFragment(toFragment(options, DEFAULTS)) })
      .toEqual({ ...options, openAlexApiKey: '' });
  });
});
