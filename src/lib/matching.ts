import type { IBiblioRecord } from './biblio';
import type { IPublication } from './publication';
import { normalizeTitle, titleSimilarity } from './similarity';

/**
 * Scores at or above this are treated as the same publication.
 */
export const MATCH_THRESHOLD = 0.75;

/**
 * Scores at or above this, but below {@link MATCH_THRESHOLD}, need a human decision.
 */
export const REVIEW_THRESHOLD = 0.55;

/**
 * Titles that are similar but published years apart are usually different papers,
 * so their score is dampened by this factor.
 */
const YEAR_MISMATCH_PENALTY = 0.9;

/**
 * How a publication relates to the UGent Academic Bibliography.
 */
export type MatchStatus = 'missing' | 'present' | 'review';

/**
 * Why a publication was considered present.
 */
export type MatchReason = 'doi' | 'title' | 'fuzzy' | 'none';

/**
 * The result of comparing one publication against the bibliography.
 */
export interface IMatch {
  /**
   * The publication that was compared.
   */
  publication: IPublication;
  /**
   * Whether the publication is missing, present, or needs a human decision.
   */
  status: MatchStatus;
  /**
   * The similarity score of the best candidate, between 0 and 1.
   */
  score: number;
  /**
   * The best matching bibliography record, if any was close enough to mention.
   */
  candidate?: IBiblioRecord;
  /**
   * What made this publication count as present.
   */
  reason: MatchReason;
  /**
   * A record found by title anywhere in the bibliography, not linked to the author.
   */
  unlinked?: IBiblioRecord;
}

/**
 * Compare two publication years, tolerating the usual one-year drift between
 * a conference date and its proceedings.
 *
 * @param left A year, possibly empty.
 * @param right A year, possibly empty.
 * @returns True when the years are close enough to be the same publication.
 */
function yearsAreClose(left: string, right: string): boolean {
  const leftYear = Number.parseInt(left, 10);
  const rightYear = Number.parseInt(right, 10);
  if (Number.isNaN(leftYear) || Number.isNaN(rightYear)) {
    return true;
  }
  return Math.abs(leftYear - rightYear) <= 1;
}

/**
 * Find the bibliography record that best matches a publication.
 *
 * @param publication The publication to match.
 * @param records The bibliography records to match against.
 * @returns The best record and its score, or undefined when there are no records.
 */
export function findBestCandidate(
  publication: IPublication,
  records: IBiblioRecord[],
): { record: IBiblioRecord; score: number } | undefined {
  let best: { record: IBiblioRecord; score: number } | undefined;

  for (const record of records) {
    const raw = titleSimilarity(publication.title, record.title);
    const score = yearsAreClose(publication.year, record.year) ? raw : raw * YEAR_MISMATCH_PENALTY;
    if (!best || score > best.score) {
      best = { record, score };
    }
  }

  return best;
}

/**
 * Compare a publication against the bibliography records of an author.
 *
 * A shared DOI or an identical normalized title is conclusive. Otherwise the
 * best fuzzy score decides between present, needs-review, and missing.
 *
 * @param publication The publication to compare.
 * @param records The bibliography records of the author.
 * @returns The comparison result.
 */
export function matchPublication(publication: IPublication, records: IBiblioRecord[]): IMatch {
  if (publication.doi) {
    const byDoi = records.find((record): boolean => record.dois.includes(publication.doi));
    if (byDoi) {
      return { publication, status: 'present', score: 1, candidate: byDoi, reason: 'doi' };
    }
  }

  const normalized = normalizeTitle(publication.title);
  const byTitle = records.find((record): boolean => normalizeTitle(record.title) === normalized);
  if (byTitle) {
    return { publication, status: 'present', score: 1, candidate: byTitle, reason: 'title' };
  }

  const best = findBestCandidate(publication, records);
  if (!best) {
    return { publication, status: 'missing', score: 0, reason: 'none' };
  }

  if (best.score >= MATCH_THRESHOLD) {
    return { publication, status: 'present', score: best.score, candidate: best.record, reason: 'fuzzy' };
  }
  if (best.score >= REVIEW_THRESHOLD) {
    return { publication, status: 'review', score: best.score, candidate: best.record, reason: 'none' };
  }
  return { publication, status: 'missing', score: best.score, reason: 'none' };
}

/**
 * Compare a whole bibliography against the bibliography records of an author.
 *
 * @param publications The publications to compare.
 * @param records The bibliography records of the author.
 * @returns One result per publication, in input order.
 */
export function matchPublications(publications: IPublication[], records: IBiblioRecord[]): IMatch[] {
  return publications.map((publication): IMatch => matchPublication(publication, records));
}
