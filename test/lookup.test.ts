import { lookupCrossrefWork } from '../src/lib/crossref';
import { openAlexLookup } from '../src/lib/openalex';
import { sanitizeQueryTitle } from '../src/lib/work';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return <Response> <unknown> { ok, status, json: async(): Promise<unknown> => body };
}

function asFetch(mock: unknown): typeof fetch {
  return <typeof fetch> mock;
}

function openAlexResponse(results: unknown[]): Response {
  return jsonResponse({ results });
}

const TITLE = 'Client-Driven Offline-First RDF 1.2 using OR-Sets';

describe('sanitizeQueryTitle', () => {
  it('drops characters a search filter would read as syntax', () => {
    expect(sanitizeQueryTitle('A title: with, commas | pipes & "quotes"')).toBe('A title with commas pipes quotes');
  });

  it('collapses the whitespace it leaves behind', () => {
    expect(sanitizeQueryTitle('  a  ,  b  ')).toBe('a b');
  });
});

describe('openAlexLookup', () => {
  it('reports a conference paper as published', async() => {
    const fetcher = jest.fn().mockResolvedValue(openAlexResponse([{
      doi: 'https://doi.org/10.1007/978-3-032-29372-5_37',
      display_name: 'Client-Driven Offline-First RDF 1.2 Using OR-Sets',
      type: 'book-chapter',
      primary_location: { source: { display_name: 'Lecture Notes in Computer Science', type: 'book series' }},
    }]));

    await expect(openAlexLookup()({ title: TITLE, author: 'De Smet' }, asFetch(fetcher))).resolves.toEqual({
      doi: '10.1007/978-3-032-29372-5_37',
      published: true,
      venue: 'Lecture Notes in Computer Science',
      pdfUrl: '',
    });
  });

  it('reports a work typed as a preprint as unpublished', async() => {
    const fetcher = jest.fn().mockResolvedValue(openAlexResponse([{
      doi: 'https://doi.org/10.48550/arxiv.2005.02239',
      display_name: 'Guided Link-Traversal-Based Query Processing',
      type: 'preprint',
      primary_location: { source: { display_name: 'arXiv (Cornell University)', type: 'repository' }},
    }]));

    const query = { title: 'Guided Link-Traversal-Based Query Processing', author: '' };
    const record = await openAlexLookup()(query, asFetch(fetcher));

    expect(record?.published).toBe(false);
    expect(record?.doi).toBe('10.48550/arxiv.2005.02239');
  });

  it('reports a work that only lives in a repository as unpublished', async() => {
    const fetcher = jest.fn().mockResolvedValue(openAlexResponse([{
      display_name: TITLE,
      type: 'article',
      primary_location: { source: { display_name: 'arXiv (Cornell University)', type: 'repository' }},
      locations: [{ source: { display_name: 'arXiv (Cornell University)', type: 'repository' }}],
    }]));

    await expect(openAlexLookup()({ title: TITLE, author: '' }, asFetch(fetcher)))
      .resolves.toEqual({ doi: '', published: false, venue: 'arXiv (Cornell University)', pdfUrl: '' });
  });

  it('looks past a repository primary location to a publisher location', async() => {
    const fetcher = jest.fn().mockResolvedValue(openAlexResponse([{
      display_name: TITLE,
      type: 'article',
      primary_location: { source: { display_name: 'arXiv (Cornell University)', type: 'repository' }},
      locations: [
        { source: { display_name: 'arXiv (Cornell University)', type: 'repository' }},
        { source: { display_name: 'Semantic Web Journal', type: 'journal' }},
      ],
    }]));

    await expect(openAlexLookup()({ title: TITLE, author: '' }, asFetch(fetcher)))
      .resolves.toEqual({ doi: '', published: true, venue: 'Semantic Web Journal', pdfUrl: '' });
  });

  it('reports a work without any location as unpublished', async() => {
    const fetcher = jest.fn().mockResolvedValue(openAlexResponse([{ display_name: TITLE, type: 'article' }]));

    const record = await openAlexLookup()({ title: TITLE, author: '' }, asFetch(fetcher));

    expect(record).toEqual({ doi: '', published: false, venue: '', pdfUrl: '' });
  });

  it('skips results whose title does not match', async() => {
    const fetcher = jest.fn().mockResolvedValue(openAlexResponse([
      {
        display_name: 'Something else entirely',
        type: 'article',
        primary_location: { source: { display_name: 'A Journal', type: 'journal' }},
      },
      {
        display_name: 'Client-Driven Offline-First RDF 1.2 Using OR-Sets',
        type: 'article',
        primary_location: { source: { display_name: 'The right one', type: 'conference' }},
      },
    ]));

    await expect(openAlexLookup()({ title: TITLE, author: '' }, asFetch(fetcher)))
      .resolves.toMatchObject({ venue: 'The right one' });
  });

  it('resolves to nothing when no result matches', async() => {
    const fetcher = jest.fn().mockResolvedValue(openAlexResponse([{ display_name: 'Unrelated work' }]));

    await expect(openAlexLookup()({ title: TITLE, author: '' }, asFetch(fetcher))).resolves.toBeUndefined();
  });

  it('resolves to nothing for an empty title', async() => {
    const fetcher = jest.fn();

    await expect(openAlexLookup()({ title: ' , ', author: '' }, asFetch(fetcher)))
      .resolves.toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('queries the title through a search filter', async() => {
    const fetcher = jest.fn().mockResolvedValue(openAlexResponse([]));

    await openAlexLookup()({ title: 'A title: with a subtitle', author: '' }, asFetch(fetcher));

    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('title.search%3AA+title+with+a+subtitle'));
  });

  it('sends an API key when it was given one', async() => {
    const fetcher = jest.fn().mockResolvedValue(openAlexResponse([]));

    await openAlexLookup('secret-key')({ title: TITLE, author: '' }, asFetch(fetcher));

    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('api_key=secret-key'));
  });

  it('sends no key parameter when it was not given one', async() => {
    const fetcher = jest.fn().mockResolvedValue(openAlexResponse([]));

    await openAlexLookup()({ title: TITLE, author: '' }, asFetch(fetcher));

    expect(fetcher).toHaveBeenCalledWith(expect.not.stringContaining('api_key'));
  });

  it('throws when the API is unavailable, so the caller can tell it apart from a miss', async() => {
    const fetcher = jest.fn().mockResolvedValue(jsonResponse({}, false, 429));

    await expect(openAlexLookup()({ title: TITLE, author: '' }, asFetch(fetcher)))
      .rejects.toThrow('OpenAlex lookup failed with HTTP 429');
  });

  it('asks for the work itself when the bibliography lists a DOI', async() => {
    const fetcher = jest.fn().mockResolvedValue(openAlexResponse([]));

    await openAlexLookup()({ title: TITLE, author: '', doi: '10.1007/978-3-032-29372-5_37' }, asFetch(fetcher));

    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('filter=doi%3A10.1007%2F978-3-032-29372-5_37'));
    expect(fetcher).toHaveBeenCalledWith(expect.not.stringContaining('title.search'));
  });

  it('accepts what a DOI returns, however its title was written down', async() => {
    const fetcher = jest.fn().mockResolvedValue(openAlexResponse([{
      doi: 'https://doi.org/10.1007/978-3-032-29372-5_37',
      display_name: 'A title recorded entirely differently',
      type: 'article',
      best_oa_location: { source: { display_name: 'A Journal', type: 'journal' }, pdf_url: 'https://oa.org/x.pdf' },
      primary_location: { source: { display_name: 'A Journal', type: 'journal' }},
    }]));

    await expect(openAlexLookup()({ title: TITLE, author: '', doi: '10.1007/978-3-032-29372-5_37' }, asFetch(fetcher)))
      .resolves.toEqual({
        doi: '10.1007/978-3-032-29372-5_37',
        published: true,
        venue: 'A Journal',
        pdfUrl: 'https://oa.org/x.pdf',
      });
  });

  it('looks a DOI up even when there is no title to search for', async() => {
    const fetcher = jest.fn().mockResolvedValue(openAlexResponse([]));

    await openAlexLookup()({ title: '', author: '', doi: '10.1000/x' }, asFetch(fetcher));

    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('filter=doi%3A10.1000%2Fx'));
  });

  it('resolves to nothing when the DOI is unknown to OpenAlex', async() => {
    const fetcher = jest.fn().mockResolvedValue(openAlexResponse([]));

    await expect(openAlexLookup()({ title: TITLE, author: '', doi: '10.1000/unknown' }, asFetch(fetcher)))
      .resolves.toBeUndefined();
  });
});

describe('lookupCrossrefWork', () => {
  function crossrefResponse(items: unknown[]): Response {
    return jsonResponse({ message: { items }});
  }

  it('reports a published type as published', async() => {
    const fetcher = jest.fn().mockResolvedValue(crossrefResponse([{
      DOI: '10.1007/978-3-032-29372-5_37',
      title: [ 'Client-Driven Offline-First RDF 1.2 Using OR-Sets' ],
      type: 'book-chapter',
      'container-title': [ 'Lecture Notes in Computer Science' ],
    }]));

    await expect(lookupCrossrefWork({ title: TITLE, author: 'De Smet' }, asFetch(fetcher))).resolves.toEqual({
      doi: '10.1007/978-3-032-29372-5_37',
      published: true,
      venue: 'Lecture Notes in Computer Science',
      pdfUrl: '',
    });
  });

  it('reports the open access PDF location', async() => {
    const fetcher = jest.fn().mockResolvedValue(openAlexResponse([{
      display_name: TITLE,
      type: 'article',
      best_oa_location: { source: { display_name: 'A Journal', type: 'journal' }, pdf_url: 'https://oa.org/x.pdf' },
      primary_location: { source: { display_name: 'A Journal', type: 'journal' }},
    }]));

    await expect(openAlexLookup()({ title: TITLE, author: '' }, asFetch(fetcher)))
      .resolves.toMatchObject({ pdfUrl: 'https://oa.org/x.pdf' });
  });

  it('falls back to any location that carries a PDF', async() => {
    const fetcher = jest.fn().mockResolvedValue(openAlexResponse([{
      display_name: TITLE,
      type: 'article',
      locations: [
        { source: { display_name: 'A repo', type: 'repository' }},
        { source: { display_name: 'A Journal', type: 'journal' }, pdf_url: 'https://oa.org/y.pdf' },
      ],
    }]));

    await expect(openAlexLookup()({ title: TITLE, author: '' }, asFetch(fetcher)))
      .resolves.toMatchObject({ pdfUrl: 'https://oa.org/y.pdf' });
  });

  it('reports posted content as unpublished', async() => {
    const fetcher = jest.fn().mockResolvedValue(crossrefResponse([
      { DOI: '10.48550/arxiv.1', title: [ TITLE ], type: 'posted-content' },
    ]));

    await expect(lookupCrossrefWork({ title: TITLE, author: '' }, asFetch(fetcher)))
      .resolves.toMatchObject({ published: false });
  });

  it('rejects results that only look related', async() => {
    const fetcher = jest.fn().mockResolvedValue(crossrefResponse([
      {
        DOI: '10.1000/x',
        title: [ 'Improving Linked Data Development Experience with LDkit' ],
        type: 'journal-article',
      },
    ]));

    const query = { title: 'RDF Test Suite: Improving Developer Experience', author: '' };

    await expect(lookupCrossrefWork(query, asFetch(fetcher))).resolves.toBeUndefined();
  });

  it('narrows the query with the author surname', async() => {
    const fetcher = jest.fn().mockResolvedValue(crossrefResponse([]));

    await lookupCrossrefWork({ title: TITLE, author: 'De Smet' }, asFetch(fetcher));

    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('query.author=De+Smet'));
  });

  it('throws when the API is unavailable', async() => {
    const fetcher = jest.fn().mockResolvedValue(jsonResponse({}, false, 500));

    await expect(lookupCrossrefWork({ title: TITLE, author: '' }, asFetch(fetcher)))
      .rejects.toThrow('Crossref lookup failed with HTTP 500');
  });

  it('asks for the work itself when the bibliography lists a DOI', async() => {
    const fetcher = jest.fn().mockResolvedValue(crossrefResponse([]));

    await lookupCrossrefWork({ title: TITLE, author: 'De Smet', doi: '10.1000/x' }, asFetch(fetcher));

    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('filter=doi%3A10.1000%2Fx'));
    expect(fetcher).toHaveBeenCalledWith(expect.not.stringContaining('query.'));
  });

  it('accepts what a DOI returns, however its title was written down', async() => {
    const fetcher = jest.fn().mockResolvedValue(crossrefResponse([
      { DOI: '10.1000/x', title: [ 'A title recorded entirely differently' ], type: 'journal-article' },
    ]));

    await expect(lookupCrossrefWork({ title: TITLE, author: '', doi: '10.1000/x' }, asFetch(fetcher)))
      .resolves.toMatchObject({ doi: '10.1000/x', published: true });
  });

  it('resolves to nothing when the DOI is unknown to Crossref', async() => {
    const fetcher = jest.fn().mockResolvedValue(crossrefResponse([]));

    await expect(lookupCrossrefWork({ title: TITLE, author: '', doi: '10.1000/unknown' }, asFetch(fetcher)))
      .resolves.toBeUndefined();
  });
});
