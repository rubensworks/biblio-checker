import type { IPublication } from './publication';
import { resolveLinks } from './publication';
import type { IWorkQuery, IWorkRecord, PublicationStatus, WorkLookup } from './work';

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
 * What consulting the sources turned up.
 */
interface IConsultation {
  /**
   * The first confident answer, if any source had one.
   */
  record?: IWorkRecord;
  /**
   * Whether any source could be reached at all.
   */
  consulted: boolean;
  /**
   * The name of the source that answered, or an empty string.
   */
  source: string;
}

/**
 * Ask the sources in order, stopping at the first confident answer.
 *
 * @param query What to look up.
 * @param sources The databases to consult, in order of preference.
 * @param fetcher The fetch implementation to use.
 * @param onSourceError Called with the name of a source that could not be reached.
 * @returns What the sources turned up.
 */
async function consultSources(
  query: IWorkQuery,
  sources: IWorkSource[],
  fetcher: typeof fetch,
  onSourceError?: (name: string) => void,
): Promise<IConsultation> {
  let consulted = false;

  for (const source of sources) {
    let record: IWorkRecord | undefined;
    try {
      record = await source.lookup(query, fetcher);
      consulted = true;
    } catch {
      onSourceError?.(source.name);
      continue;
    }
    if (record) {
      return { record, consulted, source: source.name };
    }
  }

  return { consulted, source: '' };
}

/**
 * Find out whether a publication has a version at a publisher.
 *
 * The bibliography is trusted first, since a DOI or a publisher link settles the question
 * without a request. Otherwise the sources are consulted in order, and the first one with a
 * confident match decides. When every source is unreachable the status stays unknown, so that
 * a failing database never silently reclassifies publications.
 *
 * The sources are asked by title rather than by DOI here. The only DOI that can still be on
 * a publication at this point is one arXiv registered, and looking that up would answer
 * `preprint` for every paper that carries it, including those that did reach a publisher.
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
  const { record, consulted, source } = await consultSources(
    { title: publication.title, author: surname },
    sources,
    fetcher,
    onSourceError,
  );

  if (record) {
    return {
      status: record.published ? 'published' : 'preprint',
      doi: record.doi,
      venue: record.venue,
      pdfUrl: record.pdfUrl,
      source,
    };
  }

  return consulted ?
      { status: 'preprint', doi: '', venue: '', pdfUrl: '', source: '' } :
      { status: 'unknown', doi: '', venue: '', pdfUrl: '', source: '' };
}

/**
 * Ask the sources for a freely available PDF of a publication, by its DOI.
 *
 * This is what a DOI in the bibliography buys beyond the status: the databases are asked for
 * that exact work rather than for a title that resembles it, and the answer carries whatever
 * open access copy they know about. It exists because a DOI settles the status without a
 * request, which also means that no lookup ran to report a PDF.
 *
 * @param publication The publication to find a PDF for.
 * @param sources The databases to consult, in order of preference.
 * @param fetcher The fetch implementation to use.
 * @param onSourceError Called with the name of a source that could not be reached.
 * @returns The PDF URL, or an empty string when the bibliography lists no DOI or no source
 * knows an open access copy.
 */
export async function findPdfByDoi(
  publication: IPublication,
  sources: IWorkSource[],
  fetcher: typeof fetch = fetch,
  onSourceError?: (name: string) => void,
): Promise<string> {
  if (!publication.doi) {
    return '';
  }
  const { record } = await consultSources(
    { title: publication.title, author: '', doi: publication.doi },
    sources,
    fetcher,
    onSourceError,
  );
  return record?.pdfUrl ?? '';
}
