import { normalizeDoi, titleSimilarity } from './similarity';
import type { IWorkQuery, IWorkRecord } from './work';
import { MIN_TITLE_SIMILARITY, sanitizeQueryTitle } from './work';

/**
 * The OpenAlex work type reserved for preprints.
 */
const PREPRINT_TYPE = 'preprint';

/**
 * The OpenAlex source type used for preprint servers and institutional repositories.
 */
const REPOSITORY_SOURCE_TYPE = 'repository';

/**
 * The fields requested from the API, to keep responses small.
 */
const SELECTED_FIELDS = 'id,doi,display_name,type,primary_location,locations,publication_year';

/* eslint-disable ts/naming-convention -- OpenAlex serves snake_cased field names */

/**
 * The venue a version of a work lives at, as far as this app relies on it.
 */
interface IOpenAlexSource {
  display_name?: string;
  type?: string;
}

/**
 * Where a version of a work lives, as far as this app relies on it.
 */
interface IOpenAlexLocation {
  source?: IOpenAlexSource | null;
}

/**
 * The shape of an OpenAlex work, as far as this app relies on it.
 */
interface IOpenAlexWork {
  doi?: string | null;
  display_name?: string;
  type?: string;
  primary_location?: IOpenAlexLocation | null;
  locations?: IOpenAlexLocation[];
}

/* eslint-enable ts/naming-convention */

/**
 * The shape of an OpenAlex response.
 */
interface IOpenAlexResponse {
  results?: IOpenAlexWork[];
}

/**
 * Determine whether a location sits at a publisher rather than at a preprint server.
 *
 * @param location The location to inspect.
 * @returns Whether the location is a publisher location.
 */
function isPublisherLocation(location: IOpenAlexLocation | null | undefined): boolean {
  const type = location?.source?.type;
  return Boolean(type) && type !== REPOSITORY_SOURCE_TYPE;
}

/**
 * Determine whether a work is available at a publisher.
 *
 * A work counts as published when it is not typed as a preprint and at least one of its
 * locations sits at something other than a repository, which is how OpenAlex types
 * preprint servers such as arXiv as well as institutional archives.
 *
 * @param work The work to inspect.
 * @returns Whether the work is published.
 */
function isPublished(work: IOpenAlexWork): boolean {
  if (work.type === PREPRINT_TYPE) {
    return false;
  }
  return [ work.primary_location, ...work.locations ?? [] ].some(isPublisherLocation);
}

/**
 * Pick the venue of a work, preferring a publisher location over a preprint server.
 *
 * @param work The work to inspect.
 * @returns The venue name, or an empty string.
 */
function venueOf(work: IOpenAlexWork): string {
  const locations = [ work.primary_location, ...work.locations ?? [] ];
  const published = locations.find(isPublisherLocation);
  return published?.source?.display_name ?? work.primary_location?.source?.display_name ?? '';
}

/**
 * Look a publication up in OpenAlex.
 *
 * Only results whose title closely matches the queried title are accepted, since OpenAlex
 * always answers with its best guesses.
 *
 * The author is not used: OpenAlex is queried on title alone, so that a differently spelled
 * name can never hide a publication that is in fact published.
 *
 * @param query What to look up.
 * @param query.title The publication title.
 * @param fetcher The fetch implementation to use.
 * @returns What OpenAlex knows about the publication, or undefined when it has no match.
 */
export async function lookupOpenAlexWork(
  { title }: IWorkQuery,
  fetcher: typeof fetch = fetch,
): Promise<IWorkRecord | undefined> {
  const sanitized = sanitizeQueryTitle(title);
  if (!sanitized) {
    return undefined;
  }

  const parameters = new URLSearchParams({ filter: `title.search:${sanitized}`, select: SELECTED_FIELDS });
  parameters.set('per-page', '5');

  const response = await fetcher(`https://api.openalex.org/works?${parameters.toString()}`);
  if (!response.ok) {
    throw new Error(`OpenAlex lookup failed with HTTP ${response.status}`);
  }

  const body = <IOpenAlexResponse> await response.json();
  for (const work of body.results ?? []) {
    if (titleSimilarity(title, work.display_name ?? '') >= MIN_TITLE_SIMILARITY) {
      return { doi: normalizeDoi(work.doi ?? ''), published: isPublished(work), venue: venueOf(work) };
    }
  }
  return undefined;
}
