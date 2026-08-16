import type { IBiblioRecord } from './biblio';
import { fetchAllBiblioRecords, searchBiblioByTitle } from './biblio';
import { parseBibtex } from './bibtex';
import { lookupCrossrefWork } from './crossref';
import type { IAuthorGroup } from './grouping';
import { groupByFirstAuthor } from './grouping';
import type { IMatch } from './matching';
import { matchPublications } from './matching';
import { openAlexLookup } from './openalex';
import type { IPublication } from './publication';
import { toPublications } from './publication';
import { retrying } from './retry';
import { titleSimilarity } from './similarity';
import type { IWorkSource } from './status';
import { resolveStatus } from './status';

/**
 * Build the list of databases consulted to find out whether a publication reached a publisher.
 *
 * OpenAlex is asked first because it indexes conference proceedings that never get a DOI,
 * with Crossref as a second opinion.
 *
 * @param openAlexApiKey An optional OpenAlex API key.
 * @returns The databases, in the order they should be consulted.
 */
export function createWorkSources(openAlexApiKey = ''): IWorkSource[] {
  return [
    { name: 'OpenAlex', lookup: openAlexLookup(openAlexApiKey) },
    { name: 'Crossref', lookup: lookupCrossrefWork },
  ];
}

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
   * Whether OpenAlex and Crossref should be consulted to find out which of the publications
   * that are missing from biblio actually reached a publisher, and to fill in their DOIs.
   *
   * Publications that are already in biblio are never looked up.
   */
  checkPublishers: boolean;
  /**
   * An OpenAlex API key, which raises the daily budget from the keyless one shared by
   * everyone on the same IP address to a personal one. Optional.
   */
  openAlexApiKey: string;
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

  // Only publications that are really not in biblio are worth an external lookup: whether
  // something already registered reached a publisher makes no difference to what has to be
  // added, so asking about it would just spend somebody else's rate limit. This runs after
  // the deep check on purpose, so that records found under another author are excluded too.
  const missing = matches.filter((match): boolean => match.status === 'missing' && !match.unlinked);

  if (options.checkPublishers && missing.length > 0) {
    onProgress(`Checking where ${missing.length} publications were published…`);
    const patientFetcher = retrying(fetcher);
    const sources = createWorkSources(options.openAlexApiKey);
    await mapWithConcurrency(missing, async(match): Promise<void> => {
      const result = await resolveStatus(
        match.publication,
        sources,
        patientFetcher,
        (name): void => void unreachable.add(name),
      );
      match.publicationStatus = result.status;
      if (result.doi) {
        discoveredDois[match.publication.key] = result.doi;
      }
    }, LOOKUP_CONCURRENCY);
  }

  const allMissing = matches.filter((match): boolean => match.status === 'missing');
  const preprintOnly = (match: IMatch): boolean => match.publicationStatus === 'preprint';

  return {
    matches,
    missingGroups: groupByFirstAuthor(allMissing.filter((match): boolean => !preprintOnly(match))),
    preprintGroups: groupByFirstAuthor(allMissing.filter(preprintOnly)),
    reviewGroups: groupByFirstAuthor(matches.filter((match): boolean => match.status === 'review')),
    presentCount: matches.filter((match): boolean => match.status === 'present').length,
    records,
    discoveredDois,
    unreachableSources: [ ...unreachable ].sort((left, right): number => left.localeCompare(right)),
  };
}
