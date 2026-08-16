import { normalizeDoi, titleSimilarity } from './similarity';

/**
 * The minimum title similarity before a Crossref result is trusted.
 *
 * Crossref always returns its best guesses, even for titles it knows nothing
 * about, so results have to be verified rather than taken at face value.
 */
const CROSSREF_MIN_SIMILARITY = 0.9;

/**
 * The shape of a Crossref work, as far as this app relies on it.
 */
interface ICrossrefWork {
  // Crossref uses an uppercase field name
  // eslint-disable-next-line ts/naming-convention
  DOI?: string;
  title?: string[];
}

/**
 * The shape of a Crossref response.
 */
interface ICrossrefResponse {
  message?: { items?: ICrossrefWork[] };
}

/**
 * Look up the DOI of a publication on Crossref.
 *
 * Only results whose title closely matches the queried title are accepted.
 *
 * @param title The publication title.
 * @param author A surname to narrow the query with, if available.
 * @param fetcher The fetch implementation to use.
 * @returns The bare DOI, or an empty string if none could be confirmed.
 */
export async function lookupDoi(title: string, author = '', fetcher: typeof fetch = fetch): Promise<string> {
  const parameters = new URLSearchParams({ rows: '5', select: 'DOI,title' });
  parameters.set('query.bibliographic', title);
  if (author) {
    parameters.set('query.author', author);
  }

  const response = await fetcher(`https://api.crossref.org/works?${parameters.toString()}`);
  if (!response.ok) {
    return '';
  }

  const body = <ICrossrefResponse> await response.json();
  for (const work of body.message?.items ?? []) {
    const candidate = work.title?.[0] ?? '';
    if (candidate && titleSimilarity(title, candidate) >= CROSSREF_MIN_SIMILARITY) {
      return normalizeDoi(work.DOI);
    }
  }
  return '';
}
