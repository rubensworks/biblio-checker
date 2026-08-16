/**
 * Whether a publication has a version at a publisher.
 */
export type PublicationStatus =
  /**
   * A publisher record was found, so the publication is formally published.
   */
  'published' |
  /**
   * Nothing but a preprint could be found for this publication.
   */
  'preprint' |
  /**
   * No source could be consulted, so nothing is known either way.
   */
  'unknown';

/**
 * What an external bibliographic database knows about a publication.
 */
export interface IWorkRecord {
  /**
   * The bare DOI of the work, or an empty string.
   */
  doi: string;
  /**
   * Whether the work is available at a publisher, rather than only as a preprint.
   */
  published: boolean;
  /**
   * The journal, conference or series the work appeared in, or an empty string.
   */
  venue: string;
}

/**
 * What to look a publication up by.
 */
export interface IWorkQuery {
  /**
   * The publication title.
   */
  title: string;
  /**
   * A surname to narrow the query with, which sources may ignore.
   */
  author: string;
}

/**
 * Looks a publication up in an external bibliographic database.
 *
 * Resolves to undefined when the database has no record that matches confidently.
 */
export type WorkLookup = (query: IWorkQuery, fetcher?: typeof fetch) => Promise<IWorkRecord | undefined>;

/**
 * The minimum title similarity before an external result is trusted.
 *
 * Bibliographic databases always answer with their best guesses, even for titles they
 * know nothing about, so results have to be verified rather than taken at face value.
 */
export const MIN_TITLE_SIMILARITY = 0.9;

/**
 * Strip the characters that would be read as syntax by a search filter.
 *
 * @param title The title to sanitize.
 * @returns The sanitized title.
 */
export function sanitizeQueryTitle(title: string): string {
  return title.replaceAll(/[,|:&?+"\\]/gu, ' ').replaceAll(/\s+/gu, ' ').trim();
}
