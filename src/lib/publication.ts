import type { IBibtexEntry } from './bibtex';
import { parseAuthors } from './bibtex';
import { normalizeDoi } from './similarity';

/**
 * A publication as described by the source bibliography.
 */
export interface IPublication {
  /**
   * The BibTeX citation key, used as a stable identifier.
   */
  key: string;
  /**
   * The publication title.
   */
  title: string;
  /**
   * All authors, in the order they appear on the publication.
   */
  authors: string[];
  /**
   * The publication year, or an empty string when unknown.
   */
  year: string;
  /**
   * The conference proceedings or journal this publication appeared in.
   */
  venue: string;
  /**
   * A human-readable kind, such as `Conference`, `Journal` or `Inproceedings`.
   */
  kind: string;
  /**
   * The bare DOI, or an empty string when the bibliography does not list one.
   */
  doi: string;
  /**
   * The URL listed in the bibliography, if any.
   */
  url: string;
}

/**
 * Hosts that serve final, publisher-side versions of a publication.
 */
const PUBLISHER_HOSTS = new Set([
  'dl.acm.org',
  'doi.org',
  'dx.doi.org',
  'ieeexplore.ieee.org',
  'link.springer.com',
  'onlinelibrary.wiley.com',
  'peerj.com',
  'www.sciencedirect.com',
  'sciencedirect.com',
  'www.semantic-web-journal.net',
  'semantic-web-journal.net',
  'ceur-ws.org',
  'www.ceur-ws.org',
  'journals.sagepub.com',
  'biblio.ugent.be',
  'lib.ugent.be',
  'openreview.net',
  'www.jmlr.org',
  'academic.oup.com',
]);

/**
 * The links of a publication that are useful when registering it in biblio.
 */
export interface IPublicationLinks {
  /**
   * A resolvable DOI URL, or an empty string.
   */
  doi: string;
  /**
   * A link to an author-hosted or repository-hosted version, or an empty string.
   */
  preprint: string;
  /**
   * A link to the publisher-hosted version, or an empty string.
   */
  published: string;
}

/**
 * Extract the host of a URL without throwing on malformed input.
 *
 * @param url The URL to inspect.
 * @returns The lowercased host, or an empty string.
 */
function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Determine the DOI, preprint and published links of a publication.
 *
 * The bibliography only carries a single `url` field, which points either at a
 * self-archived copy or at the publisher. It is classified by its host, and the
 * DOI always doubles as the published link when no better one is known.
 *
 * @param publication The publication to derive links for.
 * @param discoveredDoi An optional DOI found elsewhere, such as via Crossref.
 * @returns The links of the publication.
 */
export function resolveLinks(publication: IPublication, discoveredDoi = ''): IPublicationLinks {
  const doi = publication.doi || normalizeDoi(discoveredDoi);
  const doiUrl = doi ? `https://doi.org/${doi}` : '';

  let preprint = '';
  let published = '';
  if (publication.url) {
    const host = hostOf(publication.url);
    if (host === 'doi.org' || host === 'dx.doi.org') {
      published = doiUrl || publication.url;
    } else if (PUBLISHER_HOSTS.has(host)) {
      published = publication.url;
    } else {
      preprint = publication.url;
    }
  }

  if (!published) {
    published = doiUrl;
  }

  return { doi: doiUrl, preprint, published };
}

/**
 * Convert a BibTeX entry into a publication.
 *
 * @param entry The BibTeX entry to convert.
 * @returns The corresponding publication.
 */
export function toPublication(entry: IBibtexEntry): IPublication {
  const { fields } = entry;
  const kindField = fields._type;
  const kind = kindField ?? entry.entryType.charAt(0).toUpperCase() + entry.entryType.slice(1);

  return {
    key: entry.key,
    title: fields.title ?? '',
    authors: parseAuthors(fields.author),
    year: fields.year ?? '',
    venue: fields.booktitle ?? fields.journal ?? fields.school ?? fields.publisher ?? '',
    kind,
    doi: normalizeDoi(fields.doi),
    url: fields.url ?? '',
  };
}

/**
 * Convert all BibTeX entries of a document into publications.
 *
 * Entries without a title are dropped, since they cannot be matched.
 *
 * @param entries The BibTeX entries to convert.
 * @returns The corresponding publications.
 */
export function toPublications(entries: IBibtexEntry[]): IPublication[] {
  return entries
    .map((entry): IPublication => toPublication(entry))
    .filter((publication): boolean => publication.title.length > 0);
}
