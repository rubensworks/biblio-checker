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
}

@inproceedings{review_2023,
  author    = {Doe, Jane},
  title     = {Guided Link-Traversal-Based Query Processing},
  booktitle = {Proceedings of Borderline Things},
  year      = {2023},
}`;

const OPTIONS: ICheckOptions = {
  bibtexUrl: 'https://example.org/references.bib',
  biblioQuery: 'ugent_id:1',
  deepCheck: false,
  checkPublishers: false,
  findPdfs: false,
  openAlexApiKey: '',
};

const BIBLIO = {
  total: 2,
  hits: [
    { _id: 'ID1', title: 'A title that is already there', year: '2020' },
    {
      _id: 'ID3',
      title: 'How does the link queue evolve during traversal-based query processing',
      year: '2023',
    },
  ],
};

/**
 * Collect the URLs a mock fetcher was called with.
 *
 * @param fetcher The mock fetcher that was passed to the check.
 * @returns Every requested URL.
 */
function urlsOf(fetcher: typeof fetch): string[] {
  return (<jest.Mock> <unknown> fetcher).mock.calls.map((call): string => <string> call[0]);
}

/**
 * Collect the titles that were looked up in an external database.
 *
 * @param fetcher The mock fetcher that was passed to the check.
 * @returns The decoded query of every OpenAlex and Crossref request.
 */
function lookedUpTitles(fetcher: typeof fetch): string[] {
  return urlsOf(fetcher)
    .filter((url): boolean => url.includes('openalex') || url.includes('crossref'))
    .map((url): string => {
      const parameters = new URL(url).searchParams;
      return parameters.get('filter')?.replace('title.search:', '') ??
        parameters.get('query.bibliographic') ?? '';
    });
}

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
  it('separates missing, present and uncertain publications', async() => {
    const result = await check(OPTIONS, undefined, fetcherFor());

    expect(result.presentCount).toBe(1);
    expect(result.missingGroups).toHaveLength(2);
    expect(result.reviewGroups).toHaveLength(1);
    expect(result.reviewGroups[0].matches[0].publication.key).toBe('review_2023');
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

  it('only looks up publications that are really missing from biblio', async() => {
    const fetcher = fetcherFor();

    const result = await check({ ...OPTIONS, checkPublishers: true }, undefined, fetcher);

    expect(result.presentCount).toBe(1);
    expect(result.reviewGroups).toHaveLength(1);
    expect(lookedUpTitles(fetcher).sort()).toEqual([
      'Client-Driven Offline-First RDF 1.2 using OR-Sets',
      'Something that only exists as a preprint',
      'Something that only exists as a preprint',
    ]);
  });

  it('never looks up a publication that is already in biblio', async() => {
    const fetcher = fetcherFor();

    await check({ ...OPTIONS, checkPublishers: true }, undefined, fetcher);

    expect(lookedUpTitles(fetcher)).not.toContain('A title that is already there');
  });

  it('never looks up a publication whose biblio match is only uncertain', async() => {
    const fetcher = fetcherFor();

    await check({ ...OPTIONS, checkPublishers: true }, undefined, fetcher);

    expect(lookedUpTitles(fetcher)).not.toContain('Guided Link-Traversal-Based Query Processing');
  });

  it('never looks up a publication the deep check found under another author', async() => {
    const fetcher = <typeof fetch> <unknown> jest.fn(async(url: string): Promise<unknown> => {
      if (url.endsWith('.bib')) {
        return { ok: true, status: 200, text: async(): Promise<string> => BIBTEX };
      }
      if (url.includes('openalex') || url.includes('crossref')) {
        return { ok: true, status: 200, json: async(): Promise<unknown> => ({ results: [], message: { items: []}}) };
      }
      const isTitleSearch = url.includes(encodeURIComponent('"'));
      const body = isTitleSearch && url.includes('OR-Sets') ?
          { total: 1, hits: [{ _id: 'ID2', title: 'Client-Driven Offline-First RDF 1.2 Using OR-Sets' }]} :
        BIBLIO;
      return { ok: true, status: 200, json: async(): Promise<unknown> => body };
    });

    await check({ ...OPTIONS, deepCheck: true, checkPublishers: true }, undefined, fetcher);

    expect(lookedUpTitles(fetcher)).not.toContain('Client-Driven Offline-First RDF 1.2 using OR-Sets');
  });

  it('sends an OpenAlex API key when one is configured', async() => {
    const fetcher = fetcherFor();

    await check({ ...OPTIONS, checkPublishers: true, openAlexApiKey: 'secret-key' }, undefined, fetcher);

    const openAlex = urlsOf(fetcher).filter((url): boolean => url.includes('openalex'));
    expect(openAlex).not.toEqual([]);
    expect(openAlex.every((url): boolean => url.includes('api_key=secret-key'))).toBe(true);
  });

  it('never sends the OpenAlex key to any other database', async() => {
    const fetcher = fetcherFor();

    await check({ ...OPTIONS, checkPublishers: true, openAlexApiKey: 'secret-key' }, undefined, fetcher);

    const others = urlsOf(fetcher).filter((url): boolean => !url.includes('openalex'));
    expect(others.some((url): boolean => url.includes('secret-key'))).toBe(false);
  });

  it('queries OpenAlex without a key when none is configured', async() => {
    const fetcher = fetcherFor();

    await check({ ...OPTIONS, checkPublishers: true }, undefined, fetcher);

    expect(urlsOf(fetcher).some((url): boolean => url.includes('api_key'))).toBe(false);
  });

  it('reports no unreachable sources on a clean run', async() => {
    const result = await check({ ...OPTIONS, checkPublishers: true }, undefined, fetcherFor());

    expect(result.unreachableSources).toEqual([]);
  });

  it('reports progress', async() => {
    const progress = jest.fn();

    await check(OPTIONS, progress, fetcherFor());

    expect(progress).toHaveBeenCalledWith('Downloading bibliography…');
    expect(progress).toHaveBeenCalledWith('Found 4 publications, querying biblio.ugent.be…');
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
