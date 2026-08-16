import { parseBibtex } from '../src/lib/bibtex';
import { resolveLinks, toPublication, toPublications } from '../src/lib/publication';

describe('toPublication', () => {
  it('maps the common fields', () => {
    const publication = toPublication(parseBibtex(`@inproceedings{k,
  author    = {Doe, Jane and Roe, Richard},
  title     = {A title},
  booktitle = {Proceedings of Things},
  year      = {2020},
  doi       = {https://doi.org/10.1000/x},
  url       = {https://example.org/paper.pdf},
  _type     = {Conference},
}`)[0]);

    expect(publication).toEqual({
      key: 'k',
      title: 'A title',
      authors: [ 'Jane Doe', 'Richard Roe' ],
      year: '2020',
      venue: 'Proceedings of Things',
      kind: 'Conference',
      doi: '10.1000/x',
      url: 'https://example.org/paper.pdf',
    });
  });

  it('falls back to the journal as venue', () => {
    expect(toPublication(parseBibtex('@article{k, journal = {A Journal}}')[0]).venue).toBe('A Journal');
  });

  it('derives a kind from the entry type', () => {
    expect(toPublication(parseBibtex('@article{k, title = {T}}')[0]).kind).toBe('Article');
  });

  it('drops entries without a title', () => {
    expect(toPublications(parseBibtex('@article{k, year = {2020}}'))).toEqual([]);
  });
});

describe('resolveLinks', () => {
  const base = toPublication(parseBibtex('@article{k, title = {T}}')[0]);

  it('turns a DOI into a resolvable URL that doubles as the published link', () => {
    expect(resolveLinks({ ...base, doi: '10.1000/x' })).toEqual({
      doi: 'https://doi.org/10.1000/x',
      preprint: '',
      published: 'https://doi.org/10.1000/x',
    });
  });

  it('treats a self-hosted URL as a preprint', () => {
    expect(resolveLinks({ ...base, url: 'https://rubensworks.github.io/paper/' })).toEqual({
      doi: '',
      preprint: 'https://rubensworks.github.io/paper/',
      published: '',
    });
  });

  it('treats a publisher URL as the published version', () => {
    expect(resolveLinks({ ...base, url: 'https://link.springer.com/chapter/1' })).toEqual({
      doi: '',
      preprint: '',
      published: 'https://link.springer.com/chapter/1',
    });
  });

  it('keeps a preprint and a published link side by side', () => {
    const links = resolveLinks({ ...base, doi: '10.1000/x', url: 'https://arxiv.org/abs/1' });

    expect(links.preprint).toBe('https://arxiv.org/abs/1');
    expect(links.published).toBe('https://doi.org/10.1000/x');
  });

  it('resolves a doi.org URL into the published link', () => {
    expect(resolveLinks({ ...base, url: 'https://doi.org/10.1000/x' }).published).toBe('https://doi.org/10.1000/x');
  });

  it('uses a DOI discovered elsewhere', () => {
    expect(resolveLinks(base, 'https://doi.org/10.1000/found').doi).toBe('https://doi.org/10.1000/found');
  });

  it('prefers the DOI of the bibliography over a discovered one', () => {
    expect(resolveLinks({ ...base, doi: '10.1000/own' }, '10.1000/found').doi).toBe('https://doi.org/10.1000/own');
  });

  it('survives a malformed URL', () => {
    expect(resolveLinks({ ...base, url: 'not a url' }).preprint).toBe('not a url');
  });

  it('reports no links at all', () => {
    expect(resolveLinks(base)).toEqual({ doi: '', preprint: '', published: '' });
  });
});
