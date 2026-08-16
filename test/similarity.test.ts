import { normalizeDoi, normalizeTitle, titleSimilarity } from '../src/lib/similarity';

describe('normalizeTitle', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeTitle('Components.js: A Framework!')).toBe('components js a framework');
  });

  it('strips diacritics', () => {
    expect(normalizeTitle('Café Über')).toBe('cafe uber');
  });

  it('collapses non-breaking spaces', () => {
    expect(normalizeTitle('a\u00A0b')).toBe('a b');
  });

  it('equates the colon and space-colon-space subtitle styles', () => {
    expect(normalizeTitle('Traqula: providing a foundation'))
      .toBe(normalizeTitle('Traqula : providing a foundation'));
  });
});

describe('normalizeDoi', () => {
  it('strips a resolver prefix', () => {
    expect(normalizeDoi('https://doi.org/10.1007/978-3-319-58694-6_1')).toBe('10.1007/978-3-319-58694-6_1');
  });

  it('lowercases', () => {
    expect(normalizeDoi('10.7717/PeerJ-CS.387')).toBe('10.7717/peerj-cs.387');
  });

  it('returns an empty string for non-DOIs', () => {
    expect(normalizeDoi('https://example.org/paper.pdf')).toBe('');
    expect(normalizeDoi(undefined)).toBe('');
    expect(normalizeDoi('')).toBe('');
  });
});

describe('titleSimilarity', () => {
  it('scores identical titles as 1', () => {
    expect(titleSimilarity('A title', 'a title!')).toBe(1);
  });

  it('scores a shortened subtitle high', () => {
    expect(titleSimilarity(
      'Components.js: A Semantic Dependency Injection Framework',
      'Components.js : semantic dependency injection',
    )).toBeGreaterThan(0.75);
  });

  it('scores same-topic but different papers low', () => {
    expect(titleSimilarity(
      'Guided Link-Traversal-Based Query Processing',
      'How does the link queue evolve during traversal-based query processing',
    )).toBeLessThan(0.75);
  });

  it('scores unrelated titles near zero', () => {
    expect(titleSimilarity('Bridges between GraphQL and RDF', 'Genomic sequence data sharing')).toBeLessThan(0.3);
  });
});
