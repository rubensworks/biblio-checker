import type { ICheckOptions } from './lib/checker';
import { check } from './lib/checker';
import type { IPublicationLinks } from './lib/publication';
import { resolveLinks } from './lib/publication';
import { fromFragment, toFragment } from './lib/urlState';
import { requireElement } from './ui/dom';
import { renderResult } from './ui/render';

/**
 * The defaults the app starts with, which can be overridden in the settings.
 */
const DEFAULTS: ICheckOptions = {
  bibtexUrl: 'https://raw.githubusercontent.com/rubensworks/rubensworks.net/refs/heads/master/_bibliography/references.bib',
  biblioQuery: 'ugent_id:802001410273',
  deepCheck: true,
  checkPublishers: true,
  openAlexApiKey: '',
};

/**
 * The key that settings are stored under in local storage.
 */
const STORAGE_KEY = 'biblio-checker.settings';

const form = requireElement<HTMLFormElement>('settings');
const bibtexUrlInput = requireElement<HTMLInputElement>('bibtex-url');
const biblioQueryInput = requireElement<HTMLInputElement>('biblio-query');
const deepCheckInput = requireElement<HTMLInputElement>('deep-check');
const checkPublishersInput = requireElement<HTMLInputElement>('check-publishers');
const openAlexKeyInput = requireElement<HTMLInputElement>('openalex-key');
const submitButton = requireElement<HTMLButtonElement>('check');
const statusElement = requireElement<HTMLParagraphElement>('status');
const resultsElement = requireElement<HTMLElement>('results');

/**
 * Read the current settings from the form.
 *
 * @returns The settings.
 */
function readOptions(): ICheckOptions {
  return {
    bibtexUrl: bibtexUrlInput.value.trim() || DEFAULTS.bibtexUrl,
    biblioQuery: biblioQueryInput.value.trim() || DEFAULTS.biblioQuery,
    deepCheck: deepCheckInput.checked,
    checkPublishers: checkPublishersInput.checked,
    openAlexApiKey: openAlexKeyInput.value.trim(),
  };
}

/**
 * Write settings into the form.
 *
 * @param options The settings to apply.
 */
function applyOptions(options: ICheckOptions): void {
  bibtexUrlInput.value = options.bibtexUrl;
  biblioQueryInput.value = options.biblioQuery;
  deepCheckInput.checked = options.deepCheck;
  checkPublishersInput.checked = options.checkPublishers;
  openAlexKeyInput.value = options.openAlexApiKey;
}

/**
 * Read the settings kept in this browser.
 *
 * @returns Whatever was stored, which is empty when nothing was.
 */
function readStoredOptions(): Partial<ICheckOptions> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? <Partial<ICheckOptions>> JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

/**
 * Work out which settings to start with.
 *
 * The URL fragment wins over what this browser remembers, so that opening a bookmark or a
 * shared link shows that view rather than the last one used here. The API key is the
 * exception: it only ever comes from local storage, since it is kept out of links.
 *
 * @returns The settings to start with.
 */
function loadOptions(): ICheckOptions {
  return { ...DEFAULTS, ...readStoredOptions(), ...fromFragment(globalThis.location.hash) };
}

/**
 * Put the current settings in the URL fragment, so the view can be bookmarked.
 *
 * The entry is replaced rather than pushed, so that repeated checks do not fill up the
 * back button with near-identical URLs.
 *
 * @param options The settings to reflect in the URL.
 */
function storeOptionsInUrl(options: ICheckOptions): void {
  const fragment = toFragment(options, DEFAULTS);
  const url = `${globalThis.location.pathname}${globalThis.location.search}${fragment ? `#${fragment}` : ''}`;
  if (url !== `${globalThis.location.pathname}${globalThis.location.search}${globalThis.location.hash}`) {
    globalThis.history.replaceState(null, '', url);
  }
}

/**
 * Persist the current settings.
 *
 * @param options The settings to store.
 */
function storeOptions(options: ICheckOptions): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
  } catch {
    // Storage being unavailable should never break the check
  }
}

/**
 * Show a status message.
 *
 * @param message The message to show.
 * @param modifier A modifier class, such as `error`.
 */
function setStatus(message: string, modifier = ''): void {
  statusElement.textContent = message;
  statusElement.className = `status${modifier ? ` status--${modifier}` : ''}`;
}

/**
 * Run a check and render its outcome.
 */
async function runCheck(): Promise<void> {
  const options = readOptions();
  storeOptions(options);
  storeOptionsInUrl(options);

  submitButton.disabled = true;
  resultsElement.replaceChildren();
  setStatus('Starting…', 'busy');

  try {
    const result = await check(options, (message): void => setStatus(message, 'busy'));
    renderResult(resultsElement, result, {
      resolveLink: (publication): IPublicationLinks =>
        resolveLinks(publication, result.discoveredDois[publication.key]),
      heading: 'Publications still missing from the UGent Academic Bibliography',
    });
    const needsKey = result.unreachableSources.includes('OpenAlex') && !options.openAlexApiKey;
    const unreachable = result.unreachableSources.length > 0 ?
      ` ${result.unreachableSources.join(' and ')} could not be reached, so some publications may be ` +
      `classified from the bibliography alone.${needsKey ?
        ' A free OpenAlex API key, set under Settings, raises the daily budget tenfold.' :
        ''}` :
      '';
    setStatus(
      `Checked ${result.matches.length} publications against ${result.records.length} biblio records.${unreachable}`,
      result.unreachableSources.length > 0 ? 'warning' : '',
    );
  } catch (error: unknown) {
    setStatus(error instanceof Error ? error.message : String(error), 'error');
  } finally {
    submitButton.disabled = false;
  }
}

/**
 * Start a check, reporting anything that escapes it in the status line.
 */
function startCheck(): void {
  runCheck().catch((error: unknown): void => {
    setStatus(error instanceof Error ? error.message : String(error), 'error');
  });
}

form.addEventListener('submit', (event): void => {
  event.preventDefault();
  startCheck();
});

// Someone navigating to a different bookmark of this page, or editing the URL by hand,
// should get that view rather than the one already on screen
globalThis.addEventListener('hashchange', (): void => {
  applyOptions(loadOptions());
  startCheck();
});

applyOptions(loadOptions());
startCheck();
