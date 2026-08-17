import type { IPublication } from './publication';
import { resolveLinks } from './publication';
import type { IWorkRecord, PublicationStatus, WorkLookup } from './work';

/**
 * The DOI prefix arXiv registers its preprints under.
 */
const ARXIV_DOI_PREFIX = '10.48550/';

/**
 * An external bibliographic database that can be consulted.
 */
export interface IWorkSource {
  /**
   * The name of the database, used in progress and error messages.
   */
  name: string;
  /**
   * Looks a publication up in the database.
   */
  lookup: WorkLookup;
}

/**
 * What is known about where a publication was published.
 */
export interface IStatusResult {
  /**
   * Whether the publication has a version at a publisher.
   */
  status: PublicationStatus;
  /**
   * A DOI discovered while resolving the status, or an empty string.
   */
  doi: string;
  /**
   * The venue the publication appeared in, or an empty string.
   */
  venue: string;
  /**
   * A freely available PDF discovered while resolving the status, or an empty string.
   */
  pdfUrl: string;
  /**
   * Where the answer came from, such as `OpenAlex` or `the bibliography`.
   */
  source: string;
}

/**
 * The name used when the answer comes from the bibliography itself.
 */
const LOCAL_SOURCE = 'the bibliography';

/**
 * Determine whether the bibliography itself already shows that a publication is published.
 *
 * A DOI counts, unless it was registered by arXiv, and so does a URL that points at a
 * publisher rather than at a self-archived copy.
 *
 * @param publication The publication to inspect.
 * @returns Whether the bibliography shows a published version.
 */
export function hasLocalEvidence(publication: IPublication): boolean {
  if (publication.doi) {
    return !publication.doi.startsWith(ARXIV_DOI_PREFIX);
  }
  return resolveLinks(publication).published !== '';
}

/**
 * Find out whether a publication has a version at a publisher.
 *
 * The bibliography is trusted first, since a DOI or a publisher link settles the question
 * without a request. Otherwise the sources are consulted in order, and the first one with a
 * confident match decides. When every source is unreachable the status stays unknown, so that
 * a failing database never silently reclassifies publications.
 *
 * @param publication The publication to resolve the status of.
 * @param sources The databases to consult, in order of preference.
 * @param fetcher The fetch implementation to use.
 * @param onSourceError Called with the name of a source that could not be reached.
 * @returns What is known about where the publication was published.
 */
export async function resolveStatus(
  publication: IPublication,
  sources: IWorkSource[],
  fetcher: typeof fetch = fetch,
  onSourceError?: (name: string) => void,
): Promise<IStatusResult> {
  if (hasLocalEvidence(publication)) {
    return {
      status: 'published',
      doi: publication.doi,
      venue: publication.venue,
      pdfUrl: '',
      source: LOCAL_SOURCE,
    };
  }

  const surname = publication.authors[0]?.split(' ').at(-1) ?? '';
  let consulted = false;

  for (const source of sources) {
    let record: IWorkRecord | undefined;
    try {
      record = await source.lookup({ title: publication.title, author: surname }, fetcher);
      consulted = true;
    } catch {
      onSourceError?.(source.name);
      continue;
    }
    if (record) {
      return {
        status: record.published ? 'published' : 'preprint',
        doi: record.doi,
        venue: record.venue,
        pdfUrl: record.pdfUrl,
        source: source.name,
      };
    }
  }

  return consulted ?
      { status: 'preprint', doi: '', venue: '', pdfUrl: '', source: '' } :
      { status: 'unknown', doi: '', venue: '', pdfUrl: '', source: '' };
}
