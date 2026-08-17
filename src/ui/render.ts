import type { ICheckResult } from '../lib/checker';
import type { LinkResolver } from '../lib/export';
import { formatGroupsAsHtml, formatGroupsAsText, formatMatchAsHtml, formatMatchAsText } from '../lib/export';
import type { IAuthorGroup } from '../lib/grouping';
import type { IMatch } from '../lib/matching';
import { copyRichText } from './clipboard';
import { element } from './dom';

/**
 * Everything the renderer needs beyond the check result itself.
 */
export interface IRenderContext {
  /**
   * Resolves the links of a publication, including anything discovered while checking.
   */
  resolveLink: LinkResolver;
  /**
   * The heading to put above copied output.
   */
  heading: string;
}

/**
 * Give a button short-lived feedback after a copy.
 *
 * @param button The button that was pressed.
 * @param success Whether the copy succeeded.
 */
function flash(button: HTMLButtonElement, success: boolean): void {
  const original = button.textContent ?? '';
  button.textContent = success ? 'Copied!' : 'Copy failed';
  button.classList.add(success ? 'is-copied' : 'is-failed');
  setTimeout((): void => {
    button.textContent = original;
    button.classList.remove('is-copied', 'is-failed');
  }, 1500);
}

/**
 * Create a button that copies rich and plain text to the clipboard.
 *
 * @param label The button label.
 * @param className Additional classes for the button.
 * @param getContent Produces the rich and plain text flavours when pressed.
 * @returns The button.
 */
function copyButton(
  label: string,
  className: string,
  getContent: () => { html: string; text: string },
): HTMLButtonElement {
  const button = element('button', { className, text: label, attributes: { type: 'button' }});
  button.addEventListener('click', (): void => {
    const { html, text } = getContent();
    copyRichText(html, text)
      .then((success): void => flash(button, success))
      .catch((): void => flash(button, false));
  });
  return button;
}

/**
 * Render the clickable links of a publication.
 *
 * @param match The result to render links for.
 * @param context The render context.
 * @returns The link container, which is empty when no link is known.
 */
function renderLinks(match: IMatch, context: IRenderContext): HTMLElement {
  const links = context.resolveLink(match.publication);
  const container = element('div', { className: 'links' });

  const entries: [ string, string, string ][] = [
    [ 'doi', 'DOI', links.doi ],
    [ 'preprint', 'Preprint', links.preprint === links.pdf ? '' : links.preprint ],
    [ 'published', 'Published', links.published === links.doi ? '' : links.published ],
    [ 'pdf', 'PDF', links.pdf ],
  ];

  for (const [ kind, label, href ] of entries) {
    if (href) {
      container.append(element('a', {
        className: `link link--${kind}`,
        text: label,
        attributes: { href, target: '_blank', rel: 'noreferrer noopener' },
      }));
    }
  }

  if (!links.pdf) {
    container.append(element('span', { className: 'link link--todo', text: 'PDF: TODO' }));
  }

  return container;
}

/**
 * Render a single publication.
 *
 * @param match The result to render.
 * @param context The render context.
 * @returns The publication element.
 */
function renderMatch(match: IMatch, context: IRenderContext): HTMLElement {
  const { publication } = match;
  const item = element('li', { className: 'publication' });

  const header = element('div', { className: 'publication__header' });
  header.append(element('span', { className: 'publication__title', text: publication.title }));
  header.append(copyButton('Copy', 'button button--ghost button--small', (): { html: string; text: string } => ({
    html: formatMatchAsHtml(match, context.resolveLink),
    text: formatMatchAsText(match, context.resolveLink),
  })));
  item.append(header);

  const meta = element('div', { className: 'publication__meta' });
  if (publication.year) {
    meta.append(element('span', { className: 'badge', text: publication.year }));
  }
  if (publication.kind) {
    meta.append(element('span', { className: 'badge badge--kind', text: publication.kind }));
  }
  meta.append(element('span', { className: 'publication__authors', text: publication.authors.join(', ') }));
  item.append(meta);

  if (publication.venue) {
    item.append(element('div', { className: 'publication__venue', text: publication.venue }));
  }

  item.append(renderLinks(match, context));

  if (match.unlinked) {
    const notice = element('div', { className: 'notice notice--warning' });
    notice.append(element('span', { text: 'Already in biblio, but not linked to you: ' }));
    notice.append(element('a', {
      text: match.unlinked.title,
      attributes: { href: match.unlinked.url, target: '_blank', rel: 'noreferrer noopener' },
    }));
    item.append(notice);
  }

  if (match.publicationStatus === 'unknown') {
    item.append(element('div', {
      className: 'notice notice--warning',
      text: 'Could not check whether a publisher version exists, so this may still be a preprint.',
    }));
  }

  if (match.status === 'review' && match.candidate) {
    const notice = element('div', { className: 'notice' });
    notice.append(element('span', { text: `Closest biblio record (${Math.round(match.score * 100)}% similar): ` }));
    notice.append(element('a', {
      text: match.candidate.title,
      attributes: { href: match.candidate.url, target: '_blank', rel: 'noreferrer noopener' },
    }));
    item.append(notice);
  }

  return item;
}

/**
 * Render one first-author group.
 *
 * @param group The group to render.
 * @param context The render context.
 * @returns The group element.
 */
function renderGroup(group: IAuthorGroup, context: IRenderContext): HTMLElement {
  const section = element('section', { className: 'group' });

  const header = element('div', { className: 'group__header' });
  header.append(element('h3', { className: 'group__author', text: group.author }));
  header.append(element('span', {
    className: 'group__count',
    text: `${group.matches.length} publication${group.matches.length === 1 ? '' : 's'}`,
  }));
  header.append(copyButton(
    'Copy group',
    'button button--ghost button--small',
    (): { html: string; text: string } => ({
      html: formatGroupsAsHtml([ group ], context.resolveLink),
      text: formatGroupsAsText([ group ], context.resolveLink),
    }),
  ));
  section.append(header);

  const list = element('ol', { className: 'publications' });
  for (const match of group.matches) {
    list.append(renderMatch(match, context));
  }
  section.append(list);

  return section;
}

/**
 * Render a list of groups, with a copy-everything button on top.
 *
 * @param groups The groups to render.
 * @param context The render context.
 * @param heading The heading to use in copied output.
 * @returns The container element.
 */
function renderGroups(groups: IAuthorGroup[], context: IRenderContext, heading: string): HTMLElement {
  const container = element('div', { className: 'groups' });

  const toolbar = element('div', { className: 'toolbar' });
  toolbar.append(copyButton('Copy all', 'button button--primary', (): { html: string; text: string } => ({
    html: formatGroupsAsHtml(groups, context.resolveLink, heading),
    text: formatGroupsAsText(groups, context.resolveLink, heading),
  })));
  container.append(toolbar);

  for (const group of groups) {
    container.append(renderGroup(group, context));
  }

  return container;
}

/**
 * Render a summary tile.
 *
 * @param value The number to show.
 * @param label What the number counts.
 * @param modifier A modifier class for colouring.
 * @returns The tile element.
 */
function renderStat(value: number, label: string, modifier: string): HTMLElement {
  return element('div', {
    className: `stat stat--${modifier}`,
    children: [
      element('span', { className: 'stat__value', text: String(value) }),
      element('span', { className: 'stat__label', text: label }),
    ],
  });
}

/**
 * Count the publications across a list of groups.
 *
 * @param groups The groups to count.
 * @returns The total number of publications.
 */
function countIn(groups: IAuthorGroup[]): number {
  return groups.reduce((sum, group): number => sum + group.matches.length, 0);
}

/**
 * Render a collapsed section holding a secondary list of publications.
 *
 * @param groups The groups to render.
 * @param context The render context.
 * @param summary The label on the button that expands the section.
 * @param intro An explanation shown once expanded.
 * @param heading The heading to use in copied output.
 * @returns The collapsed section.
 */
function renderCollapsedGroups(
  groups: IAuthorGroup[],
  context: IRenderContext,
  summary: string,
  intro: string,
  heading: string,
): HTMLElement {
  const details = element('details', { className: 'secondary' });
  details.append(element('summary', { text: summary }));
  details.append(element('p', { className: 'section-intro', text: intro }));
  details.append(renderGroups(groups, context, heading));
  return details;
}

/**
 * Render the outcome of a check into a container.
 *
 * @param container The element to render into, which is emptied first.
 * @param result The outcome of the check.
 * @param context The render context.
 */
export function renderResult(container: HTMLElement, result: ICheckResult, context: IRenderContext): void {
  container.replaceChildren();

  const missingCount = countIn(result.missingGroups);
  const preprintCount = countIn(result.preprintGroups);
  const reviewCount = countIn(result.reviewGroups);

  const stats = element('div', { className: 'stats' });
  stats.append(renderStat(missingCount, 'published, missing from biblio', 'missing'));
  stats.append(renderStat(result.presentCount, 'already in biblio', 'present'));
  stats.append(renderStat(preprintCount, 'preprint only', 'preprint'));
  stats.append(renderStat(reviewCount, 'need a closer look', 'review'));
  container.append(stats);

  if (missingCount === 0) {
    container.append(element('p', {
      className: 'empty',
      text: preprintCount > 0 ?
        'Nothing to add right now: everything that reached a publisher is already in biblio.' :
        'Nothing to add: every publication in your bibliography is already in biblio.',
    }));
  } else {
    container.append(element('h2', { text: 'Missing from biblio' }));
    container.append(element('p', {
      className: 'section-intro',
      text: 'Published at a conference or journal, grouped by first author, newest first. ' +
        'Use the copy buttons to paste a ready-made list into an email.',
    }));
    container.append(renderGroups(result.missingGroups, context, context.heading));
  }

  if (preprintCount > 0) {
    container.append(renderCollapsedGroups(
      result.preprintGroups,
      context,
      `${preprintCount} publication${preprintCount === 1 ? '' : 's'} with only a preprint`,
      'No publisher version of these could be found in OpenAlex or Crossref, so they are probably not ready ' +
        'for biblio yet. They will move up once their proceedings or issue appears.',
      'Not published yet, so not in biblio either',
    ));
  }

  if (reviewCount > 0) {
    container.append(renderCollapsedGroups(
      result.reviewGroups,
      context,
      `${reviewCount} publication${reviewCount === 1 ? '' : 's'} that may or may not be in biblio`,
      'These resemble an existing biblio record, but not closely enough to be sure. Check them manually.',
      'Possibly missing from biblio',
    ));
  }
}
