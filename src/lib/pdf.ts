/**
 * Matches the `href` of an anchor, in any of the three quoting styles HTML allows.
 */
const ANCHOR_HREF = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+))/giu;

/**
 * Matches an arXiv abstract page, capturing the identifier.
 */
const ARXIV_ABSTRACT = /^\/abs\/(.+)$/u;

/**
 * The hosts that serve arXiv.
 */
const ARXIV_HOSTS = new Set([ 'arxiv.org', 'www.arxiv.org' ]);

/**
 * Determine whether a URL points straight at a PDF.
 *
 * Only the path is considered, so that a query string or fragment does not hide the
 * extension.
 *
 * @param url The URL to inspect.
 * @returns Whether the URL is a PDF.
 */
export function isPdfUrl(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return url.toLowerCase().endsWith('.pdf');
  }
}

/**
 * Derive a PDF URL from a page URL without making a request.
 *
 * This covers the two cases that need no lookup: a URL that already is a PDF, and an arXiv
 * abstract page, whose PDF always lives at the matching `/pdf/` path.
 *
 * @param url The URL to derive from.
 * @returns The PDF URL, or an empty string when none follows from the URL alone.
 */
export function pdfFromUrl(url: string): string {
  if (!url) {
    return '';
  }
  if (isPdfUrl(url)) {
    return url;
  }

  try {
    const parsed = new URL(url);
    if (!ARXIV_HOSTS.has(parsed.host.toLowerCase())) {
      return '';
    }
    // ArXiv serves its PDFs from /pdf/ without a .pdf extension, and its abstract pages
    // map onto that path one to one
    if (parsed.pathname.startsWith('/pdf/')) {
      return url;
    }
    const arxiv = ARXIV_ABSTRACT.exec(parsed.pathname);
    if (arxiv) {
      return `https://arxiv.org/pdf/${arxiv[1]}`;
    }
  } catch {
    return '';
  }

  return '';
}

/**
 * Find a PDF linked from a landing page.
 *
 * Only PDFs on the same host as the page itself are accepted. An author's landing page
 * links its own PDF relatively, while a cross-origin PDF on such a page is far more likely
 * to be a cited paper than the paper being described.
 *
 * @param pageUrl The URL of the landing page.
 * @param fetcher The fetch implementation to use.
 * @returns The absolute PDF URL, or an empty string when the page links none.
 */
export async function findPdfOnPage(pageUrl: string, fetcher: typeof fetch = fetch): Promise<string> {
  const response = await fetcher(pageUrl);
  if (!response.ok) {
    return '';
  }
  if (!(response.headers?.get('content-type') ?? 'text/html').includes('html')) {
    return '';
  }

  const html = await response.text();
  const page = new URL(pageUrl);

  ANCHOR_HREF.lastIndex = 0;
  let match = ANCHOR_HREF.exec(html);
  while (match !== null) {
    const href = match[1] ?? match[2] ?? match[3] ?? '';
    if (href) {
      try {
        const resolved = new URL(href, pageUrl);
        if (resolved.host === page.host && isPdfUrl(resolved.href)) {
          return resolved.href;
        }
      } catch {
        // A href that is not a URL is simply not a PDF
      }
    }
    match = ANCHOR_HREF.exec(html);
  }

  return '';
}

/**
 * Find the PDF of a preprint.
 *
 * The cheap answers come first: a URL that already is a PDF, an arXiv abstract page, and
 * anything a bibliographic database already reported. Only when none of those apply is the
 * landing page fetched and searched.
 *
 * @param preprintUrl The preprint URL from the bibliography, which may be a landing page.
 * @param knownPdfUrl A PDF URL discovered elsewhere, such as an open access location.
 * @param fetcher The fetch implementation to use.
 * @returns The PDF URL, or an empty string when none could be found.
 */
export async function findPdf(
  preprintUrl: string,
  knownPdfUrl = '',
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const direct = pdfFromUrl(preprintUrl);
  if (direct) {
    return direct;
  }
  if (knownPdfUrl) {
    return knownPdfUrl;
  }
  if (!preprintUrl) {
    return '';
  }
  return findPdfOnPage(preprintUrl, fetcher).catch((): string => '');
}
