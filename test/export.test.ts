import {
  escapeHtml,
  formatAuthors,
  formatGroupsAsHtml,
  formatGroupsAsText,
  formatMatchAsHtml,
  formatMatchAsText,
} from '../src/lib/export';
import { groupByFirstAuthor } from '../src/lib/grouping';
import type { IMatch } from '../src/lib/matching';
import type { IPublication } from '../src/lib/publication';

function match(overrides: Partial<IPublication> = {}): IMatch {
  return {
    publication: {
      key: 'key',
      title: 'A title',
      authors: [ 'Jane Doe', 'Richard Roe' ],
      year: '2020',
      venue: 'Proceedings of Things',
      kind: 'Conference',
      doi: '10.1000/x',
      url: 'https://example.org/paper.pdf',
      ...overrides,
    },
    status: 'missing',
    score: 0,
    reason: 'none',
  };
}

describe('formatAuthors', () => {
  it('joins with commas and a final and', () => {
    expect(formatAuthors([ 'A', 'B', 'C' ])).toBe('A, B and C');
    expect(formatAuthors([ 'A', 'B' ])).toBe('A and B');
    expect(formatAuthors([ 'A' ])).toBe('A');
    expect(formatAuthors([])).toBe('');
  });
});

describe('escapeHtml', () => {
  it('escapes markup', () => {
    expect(escapeHtml('<a href="x">R&D</a>')).toBe('&lt;a href=&quot;x&quot;&gt;R&amp;D&lt;/a&gt;');
  });
});

describe('formatMatchAsText', () => {
  it('lists the title, authors, venue and every link', () => {
    expect(formatMatchAsText(match())).toBe([
      'A title (2020)',
      '  Jane Doe and Richard Roe',
      '  Conference: Proceedings of Things',
      '  DOI: https://doi.org/10.1000/x',
      '  Preprint: https://example.org/paper.pdf',
    ].join('\n'));
  });

  it('omits links that are not known', () => {
    expect(formatMatchAsText(match({ doi: '', url: '' }))).toBe([
      'A title (2020)',
      '  Jane Doe and Richard Roe',
      '  Conference: Proceedings of Things',
    ].join('\n'));
  });

  it('does not repeat the DOI as the published link', () => {
    expect(formatMatchAsText(match({ url: '' }))).not.toContain('Published:');
  });

  it('shows a published link that differs from the DOI', () => {
    expect(formatMatchAsText(match({ url: 'https://link.springer.com/chapter/1' })))
      .toContain('Published: https://link.springer.com/chapter/1');
  });
});

describe('formatGroupsAsText', () => {
  it('numbers publications and indents their details', () => {
    const groups = groupByFirstAuthor([ match(), match({ title: 'Another title', year: '2021' }) ]);

    expect(formatGroupsAsText(groups)).toBe([
      'Jane Doe (2)',
      '------------',
      '1. Another title (2021)',
      '   Jane Doe and Richard Roe',
      '   Conference: Proceedings of Things',
      '   DOI: https://doi.org/10.1000/x',
      '   Preprint: https://example.org/paper.pdf',
      '',
      '2. A title (2020)',
      '   Jane Doe and Richard Roe',
      '   Conference: Proceedings of Things',
      '   DOI: https://doi.org/10.1000/x',
      '   Preprint: https://example.org/paper.pdf',
    ].join('\n'));
  });

  it('includes a heading with a pluralized count', () => {
    expect(formatGroupsAsText(groupByFirstAuthor([ match() ]), undefined, 'Missing'))
      .toContain('Missing (1 publication)');
    expect(formatGroupsAsText(groupByFirstAuthor([ match(), match({ title: 'B' }) ]), undefined, 'Missing'))
      .toContain('Missing (2 publications)');
  });

  it('uses a custom link resolver', () => {
    const text = formatGroupsAsText(
      groupByFirstAuthor([ match() ]),
      (): { doi: string; preprint: string; published: string } =>
        ({ doi: 'https://doi.org/10.1000/found', preprint: '', published: '' }),
    );

    expect(text).toContain('DOI: https://doi.org/10.1000/found');
    expect(text).not.toContain('Preprint:');
  });
});

describe('formatMatchAsHtml', () => {
  it('renders links as anchors', () => {
    const html = formatMatchAsHtml(match());

    expect(html).toContain('<b>A title</b>');
    expect(html).toContain('<a href="https://doi.org/10.1000/x">DOI</a>');
    expect(html).toContain('<a href="https://example.org/paper.pdf">Preprint</a>');
  });

  it('escapes the title', () => {
    expect(formatMatchAsHtml(match({ title: 'A & B' }))).toContain('<b>A &amp; B</b>');
  });
});

describe('formatGroupsAsHtml', () => {
  it('renders one ordered list per author', () => {
    const html = formatGroupsAsHtml(
      groupByFirstAuthor([ match(), match({ authors: [ 'Richard Roe' ]}) ]),
      undefined,
      'Missing',
    );

    expect(html).toContain('<p><b>Missing</b> (2 publications)</p>');
    expect(html).toContain('<p><b>Jane Doe</b> (1)</p>');
    expect(html).toContain('<p><b>Richard Roe</b> (1)</p>');
    expect([ ...html.matchAll(/<ol>/gu) ]).toHaveLength(2);
  });
});
