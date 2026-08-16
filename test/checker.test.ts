import type { ICheckOptions } from '../src/lib/checker';
import { check } from '../src/lib/checker';

const BIBTEX = `@inproceedings{present_2020,
  author    = {Doe, Jane},
  title     = {A title that is already there},
  booktitle = {Proceedings of Things},
  year      = {2020},
}

@inproceedings{published_2024,
  author    = {Roe, Richard and Doe, Jane},
  title     = {Client-Driven Offline-First RDF 1.2 using OR-Sets},
  booktitle = {Proceedings of Other Things},
  year      = {2024},
}

@inproceedings{preprint_2026,
  author    = {Doe, Jane},
  title     = {Something that only exists as a preprint},
  booktitle = {Proceedings of Future Things},
  year      = {2026},
  url       = {https://example.github.io/paper/},
}`;

const OPTIONS: ICheckOptions = {
  bibtexUrl: 'https://example.org/references.bib',
  biblioQuery: 'ugent_id:1',
  deepCheck: false,
  checkPublishers: false,
};

const BIBLIO = { total: 1, hits: [{ _id: 'ID1', title: 'A title that is already there', year: '2020' }]};

const OPENALEX_HIT = {
  results: [{
    doi: 'https://doi.org/10.1007/978-3-032-29372-5_37',
    display_name: 'Client-Driven Offline-First RDF 1.2 Using OR-Sets',
    type: 'book-chapter',
    primary_location: { source: { display_name: 'Lecture Notes in Computer Science', type: 'book series' }},
  }],
};

/**
 * Build a fetcher that answers the bibliography, biblio, OpenAlex and Crossref separately.
 *
 * OpenAlex only answers for the title it knows, so the preprint entry falls through to a miss.
 */
function fetcherFor(overrides: { openalex?: unknown; crossref?: unknown; failOpenAlex?: boolean } = {}): typeof fetch {
  return <typeof fetch> <unknown> jest.fn(async(url: string): Promise<unknown> => {
    if (url.endsWith('.bib')) {
      return { ok: true, status: 200, text: async(): Promise<string> => BIBTEX };
    }
    if (url.includes('openalex')) {
      if (overrides.failOpenAlex) {
        return { ok: false, status: 429 };
      }
      const known = url.includes('OR-Sets');
      const body = known ? overrides.openalex ?? OPENALEX_HIT : { results: []};
      return { ok: true, status: 200, json: async(): Promise<unknown> => body };
    }
    if (url.includes('crossref')) {
      const body = overrides.crossref ?? { message: { items: []}};
      return { ok: true, status: 200, json: async(): Promise<unknown> => body };
    }
    return { ok: true, status: 200, json: async(): Promise<unknown> => BIBLIO };
  });
}

describe('check', () => {
  it('separates missing from present publications', async() => {
    const result = await check(OPTIONS, undefined, fetcherFor());

    expect(result.presentCount).toBe(1);
    expect(result.missingGroups).toHaveLength(2);
    expect(result.reviewGroups).toEqual([]);
  });

  it('leaves everything in the main list when publishers are not checked', async() => {
    const result = await check(OPTIONS, undefined, fetcherFor());

    expect(result.preprintGroups).toEqual([]);
    expect(result.matches.every((match): boolean => match.publicationStatus === undefined)).toBe(true);
  });

  it('moves preprint-only publications out of the main list', async() => {
    const result = await check({ ...OPTIONS, checkPublishers: true }, undefined, fetcherFor());

    expect(result.missingGroups).toHaveLength(1);
    expect(result.missingGroups[0].author).toBe('Richard Roe');
    expect(result.missingGroups[0].matches[0].publication.key).toBe('published_2024');

    expect(result.preprintGroups).toHaveLength(1);
    expect(result.preprintGroups[0].matches[0].publication.key).toBe('preprint_2026');
  });

  it('records DOIs discovered while checking', async() => {
    const result = await check({ ...OPTIONS, checkPublishers: true }, undefined, fetcherFor());

    expect(result.discoveredDois).toEqual({ published_2024: '10.1007/978-3-032-29372-5_37' });
  });

  it('falls back to Crossref when OpenAlex is unreachable', async() => {
    const result = await check({ ...OPTIONS, checkPublishers: true }, undefined, fetcherFor({
      failOpenAlex: true,
      crossref: { message: { items: [
        {
          DOI: '10.1000/found',
          title: [ 'Client-Driven Offline-First RDF 1.2 Using OR-Sets' ],
          type: 'proceedings-article',
        },
      ]}},
    }));

    expect(result.unreachableSources).toEqual([ 'OpenAlex' ]);
    expect(result.missingGroups[0].matches[0].publication.key).toBe('published_2024');
    expect(result.discoveredDois).toEqual({ published_2024: '10.1000/found' });
  });

  it('reports no unreachable sources on a clean run', async() => {
    const result = await check({ ...OPTIONS, checkPublishers: true }, undefined, fetcherFor());

    expect(result.unreachableSources).toEqual([]);
  });

  it('reports progress', async() => {
    const progress = jest.fn();

    await check(OPTIONS, progress, fetcherFor());

    expect(progress).toHaveBeenCalledWith('Downloading bibliography…');
    expect(progress).toHaveBeenCalledWith('Found 3 publications, querying biblio.ugent.be…');
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
          BIBLIO),
      };
    });

    const result = await check({ ...OPTIONS, deepCheck: true }, undefined, fetcher);
    const flagged = result.matches.find((match): boolean => match.publication.key === 'published_2024');

    expect(flagged?.unlinked?.id).toBe('ID2');
  });

  it('throws a readable error when the bibliography cannot be downloaded', async() => {
    const fetcher = <typeof fetch> <unknown> jest.fn(async(): Promise<unknown> => ({ ok: false, status: 404 }));

    await expect(check(OPTIONS, undefined, fetcher)).rejects.toThrow('Could not download the bibliography: HTTP 404');
  });
});
