import type { IBiblioRecord } from '../src/lib/biblio';
import { groupByFirstAuthor } from '../src/lib/grouping';
import { matchPublication, matchPublications } from '../src/lib/matching';
import type { IPublication } from '../src/lib/publication';

function publication(overrides: Partial<IPublication> = {}): IPublication {
  return {
    key: 'key',
    title: 'A title',
    authors: [ 'Jane Doe' ],
    year: '2020',
    venue: 'Proceedings of Things',
    kind: 'Conference',
    doi: '',
    url: '',
    ...overrides,
  };
}

function record(overrides: Partial<IBiblioRecord> = {}): IBiblioRecord {
  return {
    id: 'ID1',
    title: 'A title',
    year: '2020',
    dois: [],
    url: 'https://biblio.ugent.be/publication/ID1',
    ...overrides,
  };
}

describe('matchPublication', () => {
  it('reports missing when there are no records', () => {
    const result = matchPublication(publication(), []);

    expect(result.status).toBe('missing');
    expect(result.reason).toBe('none');
    expect(result.candidate).toBeUndefined();
  });

  it('matches on an identical normalized title', () => {
    const result = matchPublication(publication({ title: 'A Title!' }), [ record() ]);

    expect(result.status).toBe('present');
    expect(result.reason).toBe('title');
    expect(result.score).toBe(1);
  });

  it('matches on a shared DOI even when titles differ', () => {
    const result = matchPublication(
      publication({ title: 'Completely different', doi: '10.1000/x' }),
      [ record({ dois: [ '10.1000/x' ]}) ],
    );

    expect(result.status).toBe('present');
    expect(result.reason).toBe('doi');
  });

  it('matches a shortened title fuzzily', () => {
    const result = matchPublication(
      publication({ title: 'Components.js: A Semantic Dependency Injection Framework', year: '2023' }),
      [ record({ title: 'Components.js : semantic dependency injection', year: '2023' }) ],
    );

    expect(result.status).toBe('present');
    expect(result.reason).toBe('fuzzy');
  });

  it('flags a borderline title for review', () => {
    const result = matchPublication(
      publication({ title: 'Guided Link-Traversal-Based Query Processing', year: '2023' }),
      [ record({ title: 'How does the link queue evolve during traversal-based query processing', year: '2023' }) ],
    );

    expect(result.status).toBe('review');
    expect(result.candidate).toBeDefined();
  });

  it('reports missing for an unrelated record', () => {
    const result = matchPublication(
      publication({ title: 'Bridges between GraphQL and RDF' }),
      [ record({ title: 'Genomic sequence data sharing for clinical practice' }) ],
    );

    expect(result.status).toBe('missing');
  });

  it('tolerates a one-year difference', () => {
    const result = matchPublication(
      publication({ title: 'Components.js: A Semantic Dependency Injection Framework', year: '2022' }),
      [ record({ title: 'Components.js : semantic dependency injection', year: '2023' }) ],
    );

    expect(result.status).toBe('present');
  });

  it('does not let a DOI mismatch override an identical title', () => {
    const result = matchPublication(
      publication({ doi: '10.1000/other' }),
      [ record({ dois: [ '10.1000/x' ]}) ],
    );

    expect(result.status).toBe('present');
    expect(result.reason).toBe('title');
  });
});

describe('matchPublications', () => {
  it('keeps input order', () => {
    const results = matchPublications(
      [ publication({ key: 'a', title: 'A title' }), publication({ key: 'b', title: 'Something else entirely' }) ],
      [ record() ],
    );

    expect(results.map((result): string => result.publication.key)).toEqual([ 'a', 'b' ]);
    expect(results[0].status).toBe('present');
    expect(results[1].status).toBe('missing');
  });
});

describe('groupByFirstAuthor', () => {
  it('groups on the first author only', () => {
    const groups = groupByFirstAuthor(matchPublications([
      publication({ key: 'a', authors: [ 'Jane Doe', 'Richard Roe' ]}),
      publication({ key: 'b', authors: [ 'Richard Roe', 'Jane Doe' ]}),
      publication({ key: 'c', authors: [ 'Jane Doe' ]}),
    ], []));

    expect(groups).toHaveLength(2);
    expect(groups[0].author).toBe('Jane Doe');
    expect(groups[0].matches).toHaveLength(2);
    expect(groups[1].author).toBe('Richard Roe');
  });

  it('orders publications newest first', () => {
    const groups = groupByFirstAuthor(matchPublications([
      publication({ key: 'old', year: '2019' }),
      publication({ key: 'new', year: '2024' }),
    ], []));

    expect(groups[0].matches.map((match): string => match.publication.key)).toEqual([ 'new', 'old' ]);
  });

  it('falls back to a placeholder author', () => {
    const groups = groupByFirstAuthor(matchPublications([ publication({ authors: []}) ], []));

    expect(groups[0].author).toBe('Unknown author');
  });

  it('returns nothing for no results', () => {
    expect(groupByFirstAuthor([])).toEqual([]);
  });
});
