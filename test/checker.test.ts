import { check } from '../src/lib/checker';

const BIBTEX = `@inproceedings{present_2020,
  author    = {Doe, Jane},
  title     = {A title that is already there},
  booktitle = {Proceedings of Things},
  year      = {2020},
}

@inproceedings{missing_2024,
  author    = {Roe, Richard and Doe, Jane},
  title     = {Client-Driven Offline-First RDF 1.2 using OR-Sets},
  booktitle = {Proceedings of Other Things},
  year      = {2024},
}`;

const OPTIONS = {
  bibtexUrl: 'https://example.org/references.bib',
  biblioQuery: 'ugent_id:1',
  deepCheck: false,
  lookupDois: false,
};

function fetcherFor(handlers: Record<string, unknown>): typeof fetch {
  return <typeof fetch> <unknown> jest.fn(async(url: string): Promise<unknown> => {
    if (url.endsWith('.bib')) {
      return { ok: true, status: 200, text: async(): Promise<string> => BIBTEX };
    }
    const key = url.includes('crossref') ? 'crossref' : 'biblio';
    return { ok: true, status: 200, json: async(): Promise<unknown> => handlers[key] ?? {}};
  });
}

describe('check', () => {
  const biblio = {
    total: 1,
    hits: [{ _id: 'ID1', title: 'A title that is already there', year: '2020' }],
  };

  it('separates missing from present publications', async() => {
    const result = await check(OPTIONS, undefined, fetcherFor({ biblio }));

    expect(result.presentCount).toBe(1);
    expect(result.missingGroups).toHaveLength(1);
    expect(result.missingGroups[0].author).toBe('Richard Roe');
    expect(result.missingGroups[0].matches[0].publication.key).toBe('missing_2024');
    expect(result.reviewGroups).toEqual([]);
  });

  it('reports progress', async() => {
    const progress = jest.fn();

    await check(OPTIONS, progress, fetcherFor({ biblio }));

    expect(progress).toHaveBeenCalledWith('Downloading bibliography…');
    expect(progress).toHaveBeenCalledWith('Found 2 publications, querying biblio.ugent.be…');
  });

  it('flags a missing publication that exists in biblio without being linked', async() => {
    const fetcher = <typeof fetch> <unknown> jest.fn(async(url: string): Promise<unknown> => {
      if (url.endsWith('.bib')) {
        return { ok: true, status: 200, text: async(): Promise<string> => BIBTEX };
      }
      const isTitleSearch = url.includes(encodeURIComponent('"'));
      return {
        ok: true,
        status: 200,
        json: async(): Promise<unknown> => (isTitleSearch ?
            { total: 1, hits: [{ _id: 'ID2', title: 'Client-Driven Offline-First RDF 1.2 Using OR-Sets' }]} :
          biblio),
      };
    });

    const result = await check({ ...OPTIONS, deepCheck: true }, undefined, fetcher);

    expect(result.missingGroups[0].matches[0].unlinked?.id).toBe('ID2');
  });

  it('records DOIs discovered on Crossref', async() => {
    const result = await check({ ...OPTIONS, lookupDois: true }, undefined, fetcherFor({
      biblio,
      crossref: {
        message: { items: [{ DOI: '10.1000/found', title: [ 'Client-Driven Offline-First RDF 1.2 using OR-Sets' ]}]},
      },
    }));

    expect(result.discoveredDois).toEqual({ missing_2024: '10.1000/found' });
  });

  it('throws a readable error when the bibliography cannot be downloaded', async() => {
    const fetcher = <typeof fetch> <unknown> jest.fn(async(): Promise<unknown> => ({ ok: false, status: 404 }));

    await expect(check(OPTIONS, undefined, fetcher)).rejects.toThrow('Could not download the bibliography: HTTP 404');
  });
});
