import { buildBiblioUrl, fetchAllBiblioRecords, searchBiblioByTitle, searchBiblioPage } from '../src/lib/biblio';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return <Response> <unknown> {
    ok,
    status,
    json: async(): Promise<unknown> => body,
  };
}

describe('buildBiblioUrl', () => {
  it('encodes the query and paging parameters', () => {
    expect(buildBiblioUrl('ugent_id:1', 20, 100)).toBe(
      'https://biblio.ugent.be/publication?q=ugent_id%3A1&format=json&limit=100&start=20',
    );
  });
});

describe('searchBiblioPage', () => {
  it('maps hits onto records', async() => {
    const fetcher = jest.fn().mockResolvedValue(jsonResponse({
      total: 1,
      hits: [{ _id: 'ID1', title: 'A title', year: '2020', doi: [ '10.1000/X' ], handle: 'http://hdl.handle.net/1' }],
    }));

    const page = await searchBiblioPage('q', 0, 100, <typeof fetch> <unknown> fetcher);

    expect(page.total).toBe(1);
    expect(page.records).toEqual([{
      id: 'ID1',
      title: 'A title',
      year: '2020',
      dois: [ '10.1000/x' ],
      url: 'https://biblio.ugent.be/publication/ID1',
    }]);
  });

  it('accepts a single DOI string', async() => {
    const fetcher = jest.fn().mockResolvedValue(jsonResponse({ total: 1, hits: [{ _id: 'A', doi: '10.1000/x' }]}));

    const page = await searchBiblioPage('q', 0, 100, <typeof fetch> <unknown> fetcher);

    expect(page.records[0].dois).toEqual([ '10.1000/x' ]);
  });

  it('tolerates an empty response body', async() => {
    const fetcher = jest.fn().mockResolvedValue(jsonResponse({}));

    await expect(searchBiblioPage('q', 0, 100, <typeof fetch> <unknown> fetcher))
      .resolves.toEqual({ total: 0, records: []});
  });

  it('throws on an error response', async() => {
    const fetcher = jest.fn().mockResolvedValue(jsonResponse({}, false, 503));

    await expect(searchBiblioPage('q', 0, 100, <typeof fetch> <unknown> fetcher))
      .rejects.toThrow('Biblio search failed with HTTP 503');
  });
});

describe('fetchAllBiblioRecords', () => {
  it('follows pagination until every record is fetched', async() => {
    const hits = Array.from({ length: 100 }, (_, index): unknown => ({ _id: `A${index}`, title: `T${index}` }));
    const fetcher = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ total: 150, hits }))
      .mockResolvedValueOnce(jsonResponse({ total: 150, hits: hits.slice(0, 50) }));
    const progress = jest.fn();

    const records = await fetchAllBiblioRecords('q', <typeof fetch> <unknown> fetcher, progress);

    expect(records).toHaveLength(150);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenLastCalledWith(150, 150);
  });

  it('stops when a page comes back empty', async() => {
    const fetcher = jest.fn().mockResolvedValue(jsonResponse({ total: 10, hits: []}));

    await expect(fetchAllBiblioRecords('q', <typeof fetch> <unknown> fetcher)).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('searchBiblioByTitle', () => {
  it('searches for the quoted title', async() => {
    const fetcher = jest.fn().mockResolvedValue(jsonResponse({ total: 0, hits: []}));

    await searchBiblioByTitle('A "quoted" title', <typeof fetch> <unknown> fetcher);

    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('q=%22A+quoted+title%22'));
  });

  it('does not search for an empty title', async() => {
    const fetcher = jest.fn();

    await expect(searchBiblioByTitle('   ', <typeof fetch> <unknown> fetcher)).resolves.toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
