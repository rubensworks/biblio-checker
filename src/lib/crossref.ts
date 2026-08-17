import { normalizeDoi, titleSimilarity } from './similarity';
import type { IWorkQuery, IWorkRecord } from './work';
import { MIN_TITLE_SIMILARITY } from './work';

/**
 * The fields requested from the API, to keep responses small.
 */
const SELECTED_FIELDS = 'DOI,title,type,container-title';

/**
 * Crossref work types that mean the work is available at a publisher.
 *
 * Notably absent is `posted-content`, which is what Crossref registers preprints as.
 */
const PUBLISHED_TYPES = new Set([
  'book',
  'book-chapter',
  'book-part',
  'book-section',
  'book-track',
  'dissertation',
  'edited-book',
  'journal-article',
  'journal-issue',
  'monograph',
  'proceedings',
  'proceedings-article',
  'reference-book',
  'reference-entry',
  'report',
  'standard',
]);

/* eslint-disable ts/naming-convention -- Crossref serves these field names verbatim */

/**
 * The shape of a Crossref work, as far as this app relies on it.
 */
interface ICrossrefWork {
  DOI?: string;
  title?: string[];
  type?: string;
  'container-title'?: string[];
}

/* eslint-enable ts/naming-convention */

/**
 * The shape of a Crossref response.
 */
interface ICrossrefResponse {
  message?: { items?: ICrossrefWork[] };
}

/**
 * Look a publication up in Crossref.
 *
 * Only results whose title closely matches the queried title are accepted, since Crossref
 * always answers with its best guesses.
 *
 * @param query What to look up.
 * @param query.title The publication title.
 * @param query.author A surname to narrow the query with, if available.
 * @param fetcher The fetch implementation to use.
 * @returns What Crossref knows about the publication, or undefined when it has no match.
 */
export async function lookupCrossrefWork(
  { title, author }: IWorkQuery,
  fetcher: typeof fetch = fetch,
): Promise<IWorkRecord | undefined> {
  const parameters = new URLSearchParams({ rows: '5', select: SELECTED_FIELDS });
  parameters.set('query.bibliographic', title);
  if (author) {
    parameters.set('query.author', author);
  }

  const response = await fetcher(`https://api.crossref.org/works?${parameters.toString()}`);
  if (!response.ok) {
    throw new Error(`Crossref lookup failed with HTTP ${response.status}`);
  }

  const body = <ICrossrefResponse> await response.json();
  for (const work of body.message?.items ?? []) {
    if (titleSimilarity(title, work.title?.[0] ?? '') >= MIN_TITLE_SIMILARITY) {
      return {
        doi: normalizeDoi(work.DOI),
        published: PUBLISHED_TYPES.has(work.type ?? ''),
        venue: work['container-title']?.[0] ?? '',
        pdfUrl: '',
      };
    }
  }
  return undefined;
}
