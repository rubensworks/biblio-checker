import type { IBiblioRecord } from './biblio';
import { fetchAllBiblioRecords, searchBiblioByTitle } from './biblio';
import { parseBibtex } from './bibtex';
import { lookupDoi } from './crossref';
import type { IAuthorGroup } from './grouping';
import { groupByFirstAuthor } from './grouping';
import type { IMatch } from './matching';
import { matchPublications } from './matching';
import type { IPublication } from './publication';
import { toPublications } from './publication';
import { titleSimilarity } from './similarity';

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
   * Whether missing DOIs should be looked up on Crossref.
   */
  lookupDois: boolean;
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
   * The missing publications, grouped by first author.
   */
  missingGroups: IAuthorGroup[];
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
   * DOIs discovered on Crossref, keyed by BibTeX citation key.
   */
  discoveredDois: Record<string, string>;
}

/**
 * The maximum number of enrichment requests that may be in flight at once.
 */
const CONCURRENCY = 4;

/**
 * Progress reporting for a check.
 */
export type ProgressReporter = (message: string) => void;

/**
 * Run an async task over every item, with a bounded number of parallel tasks.
 *
 * @param items The items to process.
 * @param task The task to run per item.
 */
async function mapWithConcurrency<T>(items: T[], task: (item: T) => Promise<void>): Promise<void> {
  const queue = [ ...items ];
  const workers = Array.from(
    { length: Math.min(CONCURRENCY, queue.length) },
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
  if (options.lookupDois) {
    const withoutDoi = open.filter((match): boolean => !match.publication.doi);
    if (withoutDoi.length > 0) {
      onProgress(`Looking up ${withoutDoi.length} DOIs on Crossref…`);
      await mapWithConcurrency(withoutDoi, async(match): Promise<void> => {
        const surname = match.publication.authors[0]?.split(' ').at(-1) ?? '';
        const doi = await lookupDoi(match.publication.title, surname, fetcher).catch((): string => '');
        if (doi) {
          discoveredDois[match.publication.key] = doi;
        }
      });
    }
  }

  return {
    matches,
    missingGroups: groupByFirstAuthor(matches.filter((match): boolean => match.status === 'missing')),
    reviewGroups: groupByFirstAuthor(matches.filter((match): boolean => match.status === 'review')),
    presentCount: matches.filter((match): boolean => match.status === 'present').length,
    records,
    discoveredDois,
  };
}
