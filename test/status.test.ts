import type { IPublication } from '../src/lib/publication';
import type { IWorkSource } from '../src/lib/status';
import { hasLocalEvidence, resolveStatus } from '../src/lib/status';
import type { IWorkRecord } from '../src/lib/work';

function publication(overrides: Partial<IPublication> = {}): IPublication {
  return {
    key: 'key',
    title: 'A title',
    authors: [ 'Jane Doe' ],
    year: '2020',
    venue: 'Proceedings of Things',
    kind: 'Conference',
    doi: '',
    url: '',
    ...overrides,
  };
}

function source(name: string, record: IWorkRecord | undefined): IWorkSource {
  return { name, lookup: async(): Promise<IWorkRecord | undefined> => record };
}

function failingSource(name: string): IWorkSource {
  return {
    name,
    lookup: async(): Promise<IWorkRecord | undefined> => {
      throw new Error(`${name} is down`);
    },
  };
}

const PUBLISHED: IWorkRecord = { doi: '10.1000/x', published: true, venue: 'A Journal' };
const PREPRINT: IWorkRecord = { doi: '10.48550/arxiv.1', published: false, venue: 'arXiv' };

describe('hasLocalEvidence', () => {
  it('accepts a DOI from the bibliography', () => {
    expect(hasLocalEvidence(publication({ doi: '10.1000/x' }))).toBe(true);
  });

  it('rejects an arXiv DOI', () => {
    expect(hasLocalEvidence(publication({ doi: '10.48550/arxiv.2005.02239' }))).toBe(false);
  });

  it('accepts a publisher URL', () => {
    expect(hasLocalEvidence(publication({ url: 'https://link.springer.com/chapter/1' }))).toBe(true);
  });

  it('rejects a self-hosted URL', () => {
    expect(hasLocalEvidence(publication({ url: 'https://rubensworks.github.io/paper/' }))).toBe(false);
  });

  it('rejects a publication without any link', () => {
    expect(hasLocalEvidence(publication())).toBe(false);
  });
});

describe('resolveStatus', () => {
  it('trusts the bibliography without consulting any source', async() => {
    const lookup = jest.fn();

    await expect(resolveStatus(publication({ doi: '10.1000/x' }), [{ name: 'OpenAlex', lookup }]))
      .resolves.toEqual({
        status: 'published',
        doi: '10.1000/x',
        venue: 'Proceedings of Things',
        source: 'the bibliography',
      });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('reports a published work found by the first source', async() => {
    await expect(resolveStatus(publication(), [ source('OpenAlex', PUBLISHED), source('Crossref', PREPRINT) ]))
      .resolves.toEqual({ status: 'published', doi: '10.1000/x', venue: 'A Journal', source: 'OpenAlex' });
  });

  it('reports a preprint-only work', async() => {
    await expect(resolveStatus(publication(), [ source('OpenAlex', PREPRINT) ]))
      .resolves.toMatchObject({ status: 'preprint', source: 'OpenAlex' });
  });

  it('falls through to the next source when the first has no match', async() => {
    await expect(resolveStatus(publication(), [ source('OpenAlex', undefined), source('Crossref', PUBLISHED) ]))
      .resolves.toMatchObject({ status: 'published', source: 'Crossref' });
  });

  it('reports preprint when every source answered but none had a match', async() => {
    await expect(resolveStatus(publication(), [ source('OpenAlex', undefined), source('Crossref', undefined) ]))
      .resolves.toEqual({ status: 'preprint', doi: '', venue: '', source: '' });
  });

  it('falls through to the next source when the first is unreachable', async() => {
    const onSourceError = jest.fn();

    const sources = [ failingSource('OpenAlex'), source('Crossref', PUBLISHED) ];

    await expect(resolveStatus(publication(), sources, undefined, onSourceError))
      .resolves.toMatchObject({ status: 'published', source: 'Crossref' });
    expect(onSourceError).toHaveBeenCalledWith('OpenAlex');
  });

  it('stays unknown when every source is unreachable, rather than guessing preprint', async() => {
    const onSourceError = jest.fn();

    const sources = [ failingSource('OpenAlex'), failingSource('Crossref') ];

    await expect(resolveStatus(publication(), sources, undefined, onSourceError))
      .resolves.toEqual({ status: 'unknown', doi: '', venue: '', source: '' });
    expect(onSourceError).toHaveBeenCalledTimes(2);
  });

  it('stays unknown when there are no sources at all', async() => {
    await expect(resolveStatus(publication(), [])).resolves.toMatchObject({ status: 'unknown' });
  });

  it('passes the surname of the first author to the sources', async() => {
    const lookup = jest.fn().mockResolvedValue(undefined);

    await resolveStatus(publication({ authors: [ 'Jitse De Smet', 'Ruben Taelman' ]}), [{ name: 'X', lookup }]);

    expect(lookup).toHaveBeenCalledWith({ title: 'A title', author: 'Smet' }, expect.anything());
  });
});
