import type { IAuthorGroup } from './grouping';
import type { IMatch } from './matching';
import type { IPublication, IPublicationLinks } from './publication';
import { resolveLinks } from './publication';

/**
 * Resolves the links of a publication, so exports can reuse whatever the app
 * already discovered, such as DOIs looked up on Crossref.
 */
export type LinkResolver = (publication: IPublication) => IPublicationLinks;

/**
 * The default resolver, which only uses what the bibliography itself provides.
 *
 * @param publication The publication to resolve links for.
 * @returns The links of the publication.
 */
export const defaultLinkResolver: LinkResolver = (publication): IPublicationLinks => resolveLinks(publication);

/**
 * Escape text for safe inclusion in HTML.
 *
 * @param value The text to escape.
 * @returns The escaped text.
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Format the authors of a publication as a readable list.
 *
 * @param authors The author names, in order.
 * @returns The formatted list.
 */
export function formatAuthors(authors: string[]): string {
  if (authors.length === 0) {
    return '';
  }
  if (authors.length === 1) {
    return authors[0];
  }
  return `${authors.slice(0, -1).join(', ')} and ${authors.at(-1)}`;
}

/**
 * Format a single publication as an indented plain text block.
 *
 * @param match The result to format.
 * @param resolveLink Resolves the links of the publication.
 * @returns The plain text block, without a trailing newline.
 */
export function formatMatchAsText(match: IMatch, resolveLink: LinkResolver = defaultLinkResolver): string {
  const { publication } = match;
  const links = resolveLink(publication);
  const lines = [ `${publication.title}${publication.year ? ` (${publication.year})` : ''}` ];

  const authors = formatAuthors(publication.authors);
  if (authors) {
    lines.push(`  ${authors}`);
  }
  if (publication.venue) {
    lines.push(`  ${publication.kind ? `${publication.kind}: ` : ''}${publication.venue}`);
  }
  if (links.doi) {
    lines.push(`  DOI: ${links.doi}`);
  }
  if (links.preprint) {
    lines.push(`  Preprint: ${links.preprint}`);
  }
  if (links.published && links.published !== links.doi) {
    lines.push(`  Published: ${links.published}`);
  }

  return lines.join('\n');
}

/**
 * Format author groups as plain text, ready to paste into an email.
 *
 * @param groups The groups to format.
 * @param resolveLink Resolves the links of a publication.
 * @param heading An optional heading to put above the groups.
 * @returns The plain text document.
 */
export function formatGroupsAsText(
  groups: IAuthorGroup[],
  resolveLink: LinkResolver = defaultLinkResolver,
  heading = '',
): string {
  const total = groups.reduce((sum, group): number => sum + group.matches.length, 0);
  const blocks: string[] = [];

  if (heading) {
    blocks.push(`${heading} (${total} publication${total === 1 ? '' : 's'})`);
  }

  for (const group of groups) {
    const items = group.matches
      .map((match, index): string => {
        const number = `${index + 1}.`;
        const indent = ' '.repeat(number.length + 1);
        const [ first, ...rest ] = formatMatchAsText(match, resolveLink).split('\n');
        return [ `${number} ${first}`, ...rest.map((line): string => `${indent}${line.trim()}`) ].join('\n');
      })
      .join('\n\n');
    blocks.push(`${group.author} (${group.matches.length})\n${'-'.repeat(group.author.length + 4)}\n${items}`);
  }

  return blocks.join('\n\n');
}

/**
 * Format a single publication as an HTML list item.
 *
 * @param match The result to format.
 * @param resolveLink Resolves the links of the publication.
 * @returns The HTML list item.
 */
export function formatMatchAsHtml(match: IMatch, resolveLink: LinkResolver = defaultLinkResolver): string {
  const { publication } = match;
  const links = resolveLink(publication);
  const parts: string[] = [ `<b>${escapeHtml(publication.title)}</b>` ];

  if (publication.year) {
    parts.push(` (${escapeHtml(publication.year)})`);
  }

  const authors = formatAuthors(publication.authors);
  if (authors) {
    parts.push(`<br>${escapeHtml(authors)}`);
  }
  if (publication.venue) {
    parts.push(`<br><i>${escapeHtml(publication.venue)}</i>`);
  }

  const linkParts: string[] = [];
  if (links.doi) {
    linkParts.push(`<a href="${escapeHtml(links.doi)}">DOI</a>`);
  }
  if (links.preprint) {
    linkParts.push(`<a href="${escapeHtml(links.preprint)}">Preprint</a>`);
  }
  if (links.published && links.published !== links.doi) {
    linkParts.push(`<a href="${escapeHtml(links.published)}">Published</a>`);
  }
  if (linkParts.length > 0) {
    parts.push(`<br>${linkParts.join(' &middot; ')}`);
  }

  return `<li>${parts.join('')}</li>`;
}

/**
 * Format author groups as HTML, ready to paste into a rich text email.
 *
 * @param groups The groups to format.
 * @param resolveLink Resolves the links of a publication.
 * @param heading An optional heading to put above the groups.
 * @returns The HTML document fragment.
 */
export function formatGroupsAsHtml(
  groups: IAuthorGroup[],
  resolveLink: LinkResolver = defaultLinkResolver,
  heading = '',
): string {
  const total = groups.reduce((sum, group): number => sum + group.matches.length, 0);
  const blocks: string[] = [];

  if (heading) {
    blocks.push(`<p><b>${escapeHtml(heading)}</b> (${total} publication${total === 1 ? '' : 's'})</p>`);
  }

  for (const group of groups) {
    const items = group.matches.map((match): string => formatMatchAsHtml(match, resolveLink)).join('');
    blocks.push(`<p><b>${escapeHtml(group.author)}</b> (${group.matches.length})</p><ol>${items}</ol>`);
  }

  return blocks.join('');
}
