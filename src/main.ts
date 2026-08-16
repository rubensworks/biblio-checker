import type { ICheckOptions } from './lib/checker';
import { check } from './lib/checker';
import type { IPublicationLinks } from './lib/publication';
import { resolveLinks } from './lib/publication';
import { requireElement } from './ui/dom';
import { renderResult } from './ui/render';

/**
 * The defaults the app starts with, which can be overridden in the settings.
 */
const DEFAULTS: ICheckOptions = {
  bibtexUrl: 'https://raw.githubusercontent.com/rubensworks/rubensworks.net/refs/heads/master/_bibliography/references.bib',
  biblioQuery: 'ugent_id:802001410273',
  deepCheck: true,
  lookupDois: true,
};

/**
 * The key that settings are stored under in local storage.
 */
const STORAGE_KEY = 'biblio-checker.settings';

const form = requireElement<HTMLFormElement>('settings');
const bibtexUrlInput = requireElement<HTMLInputElement>('bibtex-url');
const biblioQueryInput = requireElement<HTMLInputElement>('biblio-query');
const deepCheckInput = requireElement<HTMLInputElement>('deep-check');
const lookupDoisInput = requireElement<HTMLInputElement>('lookup-dois');
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
    lookupDois: lookupDoisInput.checked,
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
  lookupDoisInput.checked = options.lookupDois;
}

/**
 * Load the stored settings, falling back to the defaults.
 *
 * @returns The settings to start with.
 */
function loadOptions(): ICheckOptions {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? { ...DEFAULTS, ...<Partial<ICheckOptions>> JSON.parse(stored) } : DEFAULTS;
  } catch {
    return DEFAULTS;
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
    setStatus(`Checked ${result.matches.length} publications against ${result.records.length} biblio records.`);
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

applyOptions(loadOptions());
startCheck();
