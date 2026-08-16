import type { IMatch } from './matching';

/**
 * A set of publications that share their first author.
 */
export interface IAuthorGroup {
  /**
   * The first author of every publication in this group.
   */
  author: string;
  /**
   * The publications, newest first.
   */
  matches: IMatch[];
}

/**
 * The name used for publications without any author.
 */
const UNKNOWN_AUTHOR = 'Unknown author';

/**
 * Compare two publication years, newest first, falling back to the title.
 *
 * @param left The first result.
 * @param right The second result.
 * @returns A comparator result.
 */
function byRecency(left: IMatch, right: IMatch): number {
  const difference = Number(right.publication.year || '0') - Number(left.publication.year || '0');
  return difference === 0 ? left.publication.title.localeCompare(right.publication.title) : difference;
}

/**
 * Group results by the first author of each publication.
 *
 * Groups are ordered by size, so the authors you need to chase the most end up on
 * top, and publications inside a group are ordered newest first.
 *
 * @param matches The results to group.
 * @returns The groups.
 */
export function groupByFirstAuthor(matches: IMatch[]): IAuthorGroup[] {
  const groups = new Map<string, IMatch[]>();

  for (const match of matches) {
    const author = match.publication.authors[0] ?? UNKNOWN_AUTHOR;
    const existing = groups.get(author);
    if (existing) {
      existing.push(match);
    } else {
      groups.set(author, [ match ]);
    }
  }

  return [ ...groups.entries() ]
    .map(([ author, groupMatches ]): IAuthorGroup => ({ author, matches: [ ...groupMatches ].sort(byRecency) }))
    .sort((left, right): number =>
      right.matches.length - left.matches.length || left.author.localeCompare(right.author));
}
