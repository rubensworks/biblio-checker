import { normalizeDoi } from './similarity';

/**
 * The base URL of the UGent Academic Bibliography search API.
 *
 * The API is the regular search interface with `format=json` appended, and it
 * responds with `Access-Control-Allow-Origin: *`, so it can be called directly
 * from a static page.
 */
export const BIBLIO_BASE_URL = 'https://biblio.ugent.be/publication';

/**
 * The maximum number of records the API returns per request.
 */
const PAGE_SIZE = 100;

/**
 * A publication record as stored in the UGent Academic Bibliography.
 */
export interface IBiblioRecord {
  /**
   * The internal biblio identifier.
   */
  id: string;
  /**
   * The record title.
   */
  title: string;
  /**
   * The publication year, or an empty string when unknown.
   */
  year: string;
  /**
   * All bare DOIs registered on the record.
   */
  dois: string[];
  /**
   * The public URL of the record.
   */
  url: string;
}

/**
 * The shape of a single hit in an API response, as far as this app relies on it.
 */
interface IBiblioHit {
  // The API names its identifier field `_id`
  // eslint-disable-next-line ts/naming-convention
  _id?: string;
  title?: string;
  year?: string;
  doi?: string[] | string;
  handle?: string;
}

/**
 * The shape of an API response.
 */
interface IBiblioResponse {
  total?: number;
  hits?: IBiblioHit[];
}

/**
 * Convert an API hit into a biblio record.
 *
 * @param hit A single hit of an API response.
 * @returns The corresponding record.
 */
function toRecord(hit: IBiblioHit): IBiblioRecord {
  const rawDois = Array.isArray(hit.doi) ? hit.doi : [ hit.doi ?? '' ];
  const id = hit._id ?? '';
  return {
    id,
    title: hit.title ?? '',
    year: hit.year ?? '',
    dois: rawDois.map((doi): string => normalizeDoi(doi)).filter(Boolean),
    url: id ? `https://biblio.ugent.be/publication/${id}` : '',
  };
}

/**
 * Build the URL of a single API request.
 *
 * @param query The biblio search query.
 * @param start The offset of the first record to return.
 * @param limit The maximum number of records to return.
 * @returns The request URL.
 */
export function buildBiblioUrl(query: string, start: number, limit: number): string {
  const parameters = new URLSearchParams({
    q: query,
    format: 'json',
    limit: String(limit),
    start: String(start),
  });
  return `${BIBLIO_BASE_URL}?${parameters.toString()}`;
}

/**
 * Perform a single search request against the bibliography.
 *
 * @param query The biblio search query, such as `ugent_id:802001410273`.
 * @param start The offset of the first record to return.
 * @param limit The maximum number of records to return.
 * @param fetcher The fetch implementation to use.
 * @returns The total number of matches and the records of this page.
 */
export async function searchBiblioPage(
  query: string,
  start: number,
  limit: number,
  fetcher: typeof fetch = fetch,
): Promise<{ total: number; records: IBiblioRecord[] }> {
  const response = await fetcher(buildBiblioUrl(query, start, limit));
  if (!response.ok) {
    throw new Error(`Biblio search failed with HTTP ${response.status} for query '${query}'`);
  }
  const body = <IBiblioResponse> await response.json();
  return {
    total: body.total ?? 0,
    records: (body.hits ?? []).map((hit): IBiblioRecord => toRecord(hit)),
  };
}

/**
 * Fetch every bibliography record matching a query.
 *
 * @param query The biblio search query, such as `ugent_id:802001410273`.
 * @param fetcher The fetch implementation to use.
 * @param onProgress Called with the number of records fetched so far and the total.
 * @returns All matching records.
 */
export async function fetchAllBiblioRecords(
  query: string,
  fetcher: typeof fetch = fetch,
  onProgress?: (fetched: number, total: number) => void,
): Promise<IBiblioRecord[]> {
  const records: IBiblioRecord[] = [];
  let total = Number.POSITIVE_INFINITY;

  while (records.length < total) {
    const page = await searchBiblioPage(query, records.length, PAGE_SIZE, fetcher);
    total = page.total;
    if (page.records.length === 0) {
      break;
    }
    records.push(...page.records);
    onProgress?.(records.length, total);
  }

  return records;
}

/**
 * Search the whole bibliography for a title, regardless of who is linked to it.
 *
 * This catches publications that are already registered, but that are not
 * attributed to the author being checked.
 *
 * @param title The title to search for.
 * @param fetcher The fetch implementation to use.
 * @returns The best matching records.
 */
export async function searchBiblioByTitle(title: string, fetcher: typeof fetch = fetch): Promise<IBiblioRecord[]> {
  const sanitized = title.replaceAll(/["\\]/gu, ' ').replaceAll(/\s+/gu, ' ').trim();
  if (!sanitized) {
    return [];
  }
  const page = await searchBiblioPage(`"${sanitized}"`, 0, 5, fetcher);
  return page.records;
}
