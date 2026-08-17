import type { ICheckOptions } from './checker';

/**
 * The fragment parameter holding the BibTeX URL.
 */
const BIBTEX_URL = 'bib';

/**
 * The fragment parameter holding the biblio query.
 */
const BIBLIO_QUERY = 'q';

/**
 * The fragment parameter holding whether biblio is searched by title as well.
 */
const DEEP_CHECK = 'deep';

/**
 * The fragment parameter holding whether publishers are checked.
 */
const CHECK_PUBLISHERS = 'publishers';

/**
 * The fragment parameter holding whether PDFs are looked for.
 */
const FIND_PDFS = 'pdfs';

/**
 * Render a boolean the way it appears in a fragment.
 *
 * @param value The value to render.
 * @returns The rendered value.
 */
function writeFlag(value: boolean): string {
  return value ? '1' : '0';
}

/**
 * Read a boolean out of a fragment, tolerating the usual spellings.
 *
 * @param raw The raw parameter value, or null when it is absent.
 * @returns The boolean, or undefined when the value says nothing.
 */
function readFlag(raw: string | null): boolean | undefined {
  if (raw === null) {
    return undefined;
  }
  const normalized = raw.trim().toLowerCase();
  if ([ '1', 'true', 'yes', 'on' ].includes(normalized)) {
    return true;
  }
  if ([ '0', 'false', 'no', 'off' ].includes(normalized)) {
    return false;
  }
  return undefined;
}

/**
 * Render settings as a URL fragment, so that a view can be bookmarked and shared.
 *
 * Only what differs from the defaults is written, which keeps the link short and lets a
 * bookmark follow any later change of defaults.
 *
 * The OpenAlex API key is deliberately never written: a fragment is part of the URL, and
 * URLs end up in bookmarks, synced browser profiles and pasted messages. The key stays in
 * local storage on the machine it was typed on.
 *
 * @param options The settings to render.
 * @param defaults The settings to compare against.
 * @returns The fragment, without its leading `#`, which is empty for the default view.
 */
export function toFragment(options: ICheckOptions, defaults: ICheckOptions): string {
  const parameters = new URLSearchParams();

  if (options.bibtexUrl !== defaults.bibtexUrl) {
    parameters.set(BIBTEX_URL, options.bibtexUrl);
  }
  if (options.biblioQuery !== defaults.biblioQuery) {
    parameters.set(BIBLIO_QUERY, options.biblioQuery);
  }
  if (options.deepCheck !== defaults.deepCheck) {
    parameters.set(DEEP_CHECK, writeFlag(options.deepCheck));
  }
  if (options.checkPublishers !== defaults.checkPublishers) {
    parameters.set(CHECK_PUBLISHERS, writeFlag(options.checkPublishers));
  }
  if (options.findPdfs !== defaults.findPdfs) {
    parameters.set(FIND_PDFS, writeFlag(options.findPdfs));
  }

  return parameters.toString();
}

/**
 * Read whatever settings a URL fragment carries.
 *
 * Anything absent or unreadable is left out, so that the caller can layer the result over
 * stored settings and defaults. An API key is never read, for the same reason it is never
 * written: a key should not be able to travel in a link.
 *
 * @param fragment The fragment, with or without its leading `#`.
 * @returns The settings the fragment specifies.
 */
export function fromFragment(fragment: string): Partial<ICheckOptions> {
  const parameters = new URLSearchParams(fragment.startsWith('#') ? fragment.slice(1) : fragment);
  const options: Partial<ICheckOptions> = {};

  const bibtexUrl = parameters.get(BIBTEX_URL)?.trim();
  if (bibtexUrl) {
    options.bibtexUrl = bibtexUrl;
  }

  const biblioQuery = parameters.get(BIBLIO_QUERY)?.trim();
  if (biblioQuery) {
    options.biblioQuery = biblioQuery;
  }

  const deepCheck = readFlag(parameters.get(DEEP_CHECK));
  if (deepCheck !== undefined) {
    options.deepCheck = deepCheck;
  }

  const checkPublishers = readFlag(parameters.get(CHECK_PUBLISHERS));
  if (checkPublishers !== undefined) {
    options.checkPublishers = checkPublishers;
  }

  const findPdfs = readFlag(parameters.get(FIND_PDFS));
  if (findPdfs !== undefined) {
    options.findPdfs = findPdfs;
  }

  return options;
}
