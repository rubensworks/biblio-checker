/**
 * Normalize a title so that cosmetic differences between sources do not matter.
 *
 * Diacritics are stripped, non-alphanumeric characters become spaces, and
 * whitespace is collapsed. This makes `Components.js: A Semantic DI Framework`
 * and `Components.js : a semantic DI framework` compare equal on their words.
 *
 * @param value The title to normalize.
 * @returns The normalized title.
 */
export function normalizeTitle(value: string): string {
  return value
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036F]/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, ' ')
    .trim();
}

/**
 * Normalize a DOI to a bare, comparable form.
 *
 * Both `https://doi.org/10.1000/x` and `doi:10.1000/X` normalize to `10.1000/x`.
 *
 * @param value A DOI in any common representation.
 * @returns The bare lowercased DOI, or an empty string if none could be found.
 */
export function normalizeDoi(value: string | undefined): string {
  if (!value) {
    return '';
  }
  const match = /10\.\d{4,9}\/\S+/u.exec(value.trim());
  return match ? match[0].toLowerCase().replace(/[.,;]$/u, '') : '';
}

/**
 * Split a normalized string into character bigrams.
 *
 * @param value A normalized string.
 * @returns The set of character bigrams.
 */
function bigrams(value: string): Set<string> {
  const result = new Set<string>();
  for (let i = 0; i < value.length - 1; i++) {
    result.add(value.slice(i, i + 2));
  }
  return result;
}

/**
 * Compute the size of the intersection of two sets.
 *
 * @param left The first set.
 * @param right The second set.
 * @returns The number of shared elements.
 */
function intersectionSize(left: Set<string>, right: Set<string>): number {
  let shared = 0;
  for (const element of left) {
    if (right.has(element)) {
      shared++;
    }
  }
  return shared;
}

/**
 * Compute the Sørensen–Dice coefficient over character bigrams.
 *
 * @param left The first normalized string.
 * @param right The second normalized string.
 * @returns A score between 0 and 1.
 */
export function bigramSimilarity(left: string, right: string): number {
  const leftGrams = bigrams(left);
  const rightGrams = bigrams(right);
  if (leftGrams.size === 0 || rightGrams.size === 0) {
    return left === right ? 1 : 0;
  }
  return (2 * intersectionSize(leftGrams, rightGrams)) / (leftGrams.size + rightGrams.size);
}

/**
 * Compute the Jaccard index over whitespace-separated words.
 *
 * @param left The first normalized string.
 * @param right The second normalized string.
 * @returns A score between 0 and 1.
 */
export function wordSimilarity(left: string, right: string): number {
  const leftWords = new Set(left.split(' ').filter(Boolean));
  const rightWords = new Set(right.split(' ').filter(Boolean));
  if (leftWords.size === 0 || rightWords.size === 0) {
    return 0;
  }
  const shared = intersectionSize(leftWords, rightWords);
  return shared / (leftWords.size + rightWords.size - shared);
}

/**
 * Score how likely it is that two titles refer to the same publication.
 *
 * Character bigrams catch small edits and reorderings, while word overlap keeps
 * titles that merely share a topic (`... link traversal ...`) from scoring high.
 * Both signals are weighted equally.
 *
 * @param left A title, not necessarily normalized.
 * @param right A title, not necessarily normalized.
 * @returns A score between 0 and 1, where 1 means the normalized titles are equal.
 */
export function titleSimilarity(left: string, right: string): number {
  const normalizedLeft = normalizeTitle(left);
  const normalizedRight = normalizeTitle(right);
  if (normalizedLeft === normalizedRight) {
    return 1;
  }
  return (bigramSimilarity(normalizedLeft, normalizedRight) + wordSimilarity(normalizedLeft, normalizedRight)) / 2;
}
