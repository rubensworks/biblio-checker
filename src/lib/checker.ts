import type { IBiblioRecord } from './biblio';
import { fetchAllBiblioRecords, searchBiblioByTitle } from './biblio';
import { parseBibtex } from './bibtex';
import { lookupCrossrefWork } from './crossref';
import type { IAuthorGroup } from './grouping';
import { groupByFirstAuthor } from './grouping';
import type { IMatch } from './matching';
import { matchPublications } from './matching';
import { lookupOpenAlexWork } from './openalex';
import type { IPublication } from './publication';
import { toPublications } from './publication';
import { retrying } from './retry';
import { titleSimilarity } from './similarity';
import type { IWorkSource } from './status';
import { resolveStatus } from './status';

/**
 * The databases consulted to find out whether a publication reached a publisher.
 *
 * OpenAlex is asked first because it indexes conference proceedings that never get a DOI,
 * with Crossref as a second opinion.
 */
export const WORK_SOURCES: IWorkSource[] = [
  { name: 'OpenAlex', lookup: lookupOpenAlexWork },
  { name: 'Crossref', lookup: lookupCrossrefWork },
];

/**
 * How the check should be performed.
 */
export interface ICheckOptions {
  /**
   * The URL of the BibTeX file to check.
   */
  bibtexUrl: string;
  /**
   * The biblio search query selecting the author's records, such as
   * `ugent_id:802001410273`.
   */
  biblioQuery: string;
  /**
   * Whether missing publications should also be searched for by title across the
   * whole bibliography, which finds records that exist but are not linked to the author.
   */
  deepCheck: boolean;
  /**
   * Whether OpenAlex and Crossref should be consulted to find out which missing publications
   * actually reached a publisher, and to fill in DOIs.
   */
  checkPublishers: boolean;
}

/**
 * The outcome of a check.
 */
export interface ICheckResult {
  /**
   * Every publication of the bibliography, with its comparison result.
   */
  matches: IMatch[];
  /**
   * The missing publications that reached a publisher, grouped by first author.
   */
  missingGroups: IAuthorGroup[];
  /**
   * The missing publications that only exist as a preprint, grouped by first author.
   */
  preprintGroups: IAuthorGroup[];
  /**
   * The publications whose match is too close to call, grouped by first author.
   */
  reviewGroups: IAuthorGroup[];
  /**
   * The number of publications that are already in the bibliography.
   */
  presentCount: number;
  /**
   * All bibliography records that were compared against.
   */
  records: IBiblioRecord[];
  /**
   * DOIs discovered while checking, keyed by BibTeX citation key.
   */
  discoveredDois: Record<string, string>;
  /**
   * The names of the databases that could not be reached, if any.
   */
  unreachableSources: string[];
}

/**
 * The maximum number of biblio requests that may be in flight at once.
 */
const CONCURRENCY = 4;

/**
 * The maximum number of requests to external databases that may be in flight at once.
 *
 * Kept low on purpose: OpenAlex and Crossref both throttle bursts, and a throttled
 * lookup costs more than a slow one.
 */
const LOOKUP_CONCURRENCY = 2;

/**
 * Progress reporting for a check.
 */
export type ProgressReporter = (message: string) => void;

/**
 * Run an async task over every item, with a bounded number of parallel tasks.
 *
 * @param items The items to process.
 * @param task The task to run per item.
 * @param concurrency The maximum number of tasks to run at once.
 */
async function mapWithConcurrency<T>(
  items: T[],
  task: (item: T) => Promise<void>,
  concurrency = CONCURRENCY,
): Promise<void> {
  const queue = [ ...items ];
  const workers = Array.from(
    { length: Math.min(concurrency, queue.length) },
    async(): Promise<void> => {
      let next = queue.shift();
      while (next !== undefined) {
        await task(next);
        next = queue.shift();
      }
    },
  );
  await Promise.all(workers);
}

/**
 * Download and parse a BibTeX bibliography.
 *
 * @param url The URL of the BibTeX file.
 * @param fetcher The fetch implementation to use.
 * @returns The publications in the bibliography.
 */
export async function fetchPublications(url: string, fetcher: typeof fetch = fetch): Promise<IPublication[]> {
  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`Could not download the bibliography: HTTP ${response.status}`);
  }
  return toPublications(parseBibtex(await response.text()));
}

/**
 * Check which publications of a bibliography are missing from the UGent Academic Bibliography.
 *
 * @param options How the check should be performed.
 * @param onProgress Called with human-readable progress messages.
 * @param fetcher The fetch implementation to use.
 * @returns The outcome of the check.
 */
export async function check(
  options: ICheckOptions,
  onProgress: ProgressReporter = (): void => {
    // Progress is optional
  },
  fetcher: typeof fetch = fetch,
): Promise<ICheckResult> {
  onProgress('Downloading bibliography…');
  const publications = await fetchPublications(options.bibtexUrl, fetcher);
  onProgress(`Found ${publications.length} publications, querying biblio.ugent.be…`);

  const records = await fetchAllBiblioRecords(options.biblioQuery, fetcher, (fetched, total): void => {
    onProgress(`Fetched ${fetched} of ${total} biblio records…`);
  });
  onProgress(`Comparing against ${records.length} biblio records…`);

  const matches = matchPublications(publications, records);
  const open = matches.filter((match): boolean => match.status !== 'present');

  if (options.deepCheck && open.length > 0) {
    onProgress(`Searching biblio by title for ${open.length} publications…`);
    await mapWithConcurrency(open, async(match): Promise<void> => {
      const candidates = await searchBiblioByTitle(match.publication.title, fetcher).catch((): IBiblioRecord[] => []);
      const hit = candidates.find((record): boolean => titleSimilarity(match.publication.title, record.title) >= 0.75);
      if (hit) {
        match.unlinked = hit;
      }
    });
  }

  const discoveredDois: Record<string, string> = {};
  const unreachable = new Set<string>();

  if (options.checkPublishers && open.length > 0) {
    onProgress(`Checking where ${open.length} publications were published…`);
    const patientFetcher = retrying(fetcher);
    await mapWithConcurrency(open, async(match): Promise<void> => {
      const result = await resolveStatus(
        match.publication,
        WORK_SOURCES,
        patientFetcher,
        (name): void => void unreachable.add(name),
      );
      match.publicationStatus = result.status;
      if (result.doi) {
        discoveredDois[match.publication.key] = result.doi;
      }
    }, LOOKUP_CONCURRENCY);
  }

  const missing = matches.filter((match): boolean => match.status === 'missing');
  const preprintOnly = (match: IMatch): boolean => match.publicationStatus === 'preprint';

  return {
    matches,
    missingGroups: groupByFirstAuthor(missing.filter((match): boolean => !preprintOnly(match))),
    preprintGroups: groupByFirstAuthor(missing.filter(preprintOnly)),
    reviewGroups: groupByFirstAuthor(matches.filter((match): boolean => match.status === 'review')),
    presentCount: matches.filter((match): boolean => match.status === 'present').length,
    records,
    discoveredDois,
    unreachableSources: [ ...unreachable ].sort((left, right): number => left.localeCompare(right)),
  };
}
