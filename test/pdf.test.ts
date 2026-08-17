import { findPdf, findPdfOnPage, isPdfUrl, pdfFromUrl } from '../src/lib/pdf';

function htmlResponse(html: string, ok = true): Response {
  return <Response> <unknown> {
    ok,
    status: ok ? 200 : 404,
    headers: { get: (name: string): string | null => name === 'content-type' ? 'text/html; charset=utf-8' : null },
    text: async(): Promise<string> => html,
  };
}

function asFetch(mock: unknown): typeof fetch {
  return <typeof fetch> mock;
}

describe('isPdfUrl', () => {
  it('accepts a PDF path', () => {
    expect(isPdfUrl('https://example.org/paper.pdf')).toBe(true);
    expect(isPdfUrl('https://example.org/a/b/PAPER.PDF')).toBe(true);
  });

  it('ignores a query string and fragment', () => {
    expect(isPdfUrl('https://example.org/paper.pdf?download=1#page=2')).toBe(true);
    expect(isPdfUrl('https://example.org/paper?format=pdf')).toBe(false);
  });

  it('rejects a landing page', () => {
    expect(isPdfUrl('https://example.org/paper/')).toBe(false);
  });
});

describe('pdfFromUrl', () => {
  it('passes a PDF straight through', () => {
    expect(pdfFromUrl('https://example.org/paper.pdf')).toBe('https://example.org/paper.pdf');
  });

  it('rewrites an arXiv abstract page', () => {
    expect(pdfFromUrl('https://arxiv.org/abs/2005.02239')).toBe('https://arxiv.org/pdf/2005.02239');
    expect(pdfFromUrl('https://www.arxiv.org/abs/2005.02239v2')).toBe('https://arxiv.org/pdf/2005.02239v2');
  });

  it('leaves an arXiv PDF alone', () => {
    expect(pdfFromUrl('https://arxiv.org/pdf/2604.19205')).toBe('https://arxiv.org/pdf/2604.19205');
  });

  it('does not rewrite an abstract path on another host', () => {
    expect(pdfFromUrl('https://example.org/abs/1234')).toBe('');
  });

  it('gives nothing for a landing page or a non-URL', () => {
    expect(pdfFromUrl('https://example.org/paper/')).toBe('');
    expect(pdfFromUrl('not a url')).toBe('');
    expect(pdfFromUrl('')).toBe('');
  });
});

describe('findPdfOnPage', () => {
  it('finds a relative PDF link and makes it absolute', async() => {
    const fetcher = jest.fn().mockResolvedValue(htmlResponse('<a href="paper.pdf">Paper</a>'));

    await expect(findPdfOnPage('https://example.org/poster/', asFetch(fetcher)))
      .resolves.toBe('https://example.org/poster/paper.pdf');
  });

  it('handles single quotes and unquoted attributes', async() => {
    await expect(findPdfOnPage('https://example.org/', asFetch(
      jest.fn().mockResolvedValue(htmlResponse('<a class=\'x\' href=\'/a.pdf\'>a</a>')),
    ))).resolves.toBe('https://example.org/a.pdf');

    await expect(findPdfOnPage('https://example.org/', asFetch(
      jest.fn().mockResolvedValue(htmlResponse('<a href=/b.pdf>b</a>')),
    ))).resolves.toBe('https://example.org/b.pdf');
  });

  it('ignores a PDF on another host, which is far more likely to be a citation', async() => {
    const html = '<a href="https://ceur-ws.org/Vol-3632/ISWC2023_paper_495.pdf">Some cited paper</a>' +
      '<a href="paper.pdf">Our paper</a>';

    await expect(findPdfOnPage('https://poster.example.org/', asFetch(
      jest.fn().mockResolvedValue(htmlResponse(html)),
    ))).resolves.toBe('https://poster.example.org/paper.pdf');
  });

  it('gives nothing when only a foreign PDF is linked', async() => {
    await expect(findPdfOnPage('https://example.org/', asFetch(
      jest.fn().mockResolvedValue(htmlResponse('<a href="https://elsewhere.org/x.pdf">x</a>')),
    ))).resolves.toBe('');
  });

  it('gives nothing for a page without any PDF link', async() => {
    const html = '<a href="https://github.com/rubensworks/rdf-test-suite.js">Repo</a><a href="#ref-1">1</a>';

    await expect(findPdfOnPage('https://example.org/', asFetch(jest.fn().mockResolvedValue(htmlResponse(html)))))
      .resolves.toBe('');
  });

  it('gives nothing when the page cannot be fetched', async() => {
    await expect(findPdfOnPage('https://example.org/', asFetch(
      jest.fn().mockResolvedValue(htmlResponse('<a href="a.pdf">a</a>', false)),
    ))).resolves.toBe('');
  });

  it('does not try to parse a response that is not HTML', async() => {
    const response = <Response> <unknown> {
      ok: true,
      status: 200,
      headers: { get: (): string => 'application/pdf' },
      text: async(): Promise<string> => '%PDF-1.7',
    };

    await expect(findPdfOnPage('https://example.org/', asFetch(jest.fn().mockResolvedValue(response))))
      .resolves.toBe('');
  });
});

describe('findPdf', () => {
  it('needs no request when the preprint URL already is a PDF', async() => {
    const fetcher = jest.fn();

    await expect(findPdf('https://example.org/paper.pdf', '', asFetch(fetcher)))
      .resolves.toBe('https://example.org/paper.pdf');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('needs no request for an arXiv abstract page', async() => {
    const fetcher = jest.fn();

    await expect(findPdf('https://arxiv.org/abs/2005.02239', '', asFetch(fetcher)))
      .resolves.toBe('https://arxiv.org/pdf/2005.02239');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses a PDF discovered elsewhere before fetching anything', async() => {
    const fetcher = jest.fn();

    await expect(findPdf('https://example.org/landing/', 'https://oa.example.org/x.pdf', asFetch(fetcher)))
      .resolves.toBe('https://oa.example.org/x.pdf');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('falls back to searching the landing page', async() => {
    const fetcher = jest.fn().mockResolvedValue(htmlResponse('<a href="paper.pdf">Paper</a>'));

    await expect(findPdf('https://example.org/landing/', '', asFetch(fetcher)))
      .resolves.toBe('https://example.org/landing/paper.pdf');
  });

  it('gives nothing when there is no preprint URL at all', async() => {
    const fetcher = jest.fn();

    await expect(findPdf('', '', asFetch(fetcher))).resolves.toBe('');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('survives a landing page that cannot be reached', async() => {
    const fetcher = jest.fn().mockRejectedValue(new Error('CORS'));

    await expect(findPdf('https://example.org/landing/', '', asFetch(fetcher))).resolves.toBe('');
  });
});
