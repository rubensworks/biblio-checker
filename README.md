# Biblio Checker

[![Build status](https://github.com/rubensworks/biblio-checker/workflows/CI/badge.svg)](https://github.com/rubensworks/biblio-checker/actions?query=workflow%3ACI)

Lists which publications from a BibTeX bibliography are **not** in the
[UGent Academic Bibliography](https://biblio.ugent.be/) yet, grouped by first author,
so you know exactly what still needs to be registered and who to chase for it.

Everything runs in the browser: no backend, no API key, nothing is stored anywhere but your own browser.

![Screenshot of Biblio Checker](docs/screenshot.png)

## Usage

Open the app, and it immediately checks the configured bibliography.
The defaults point at [rubensworks.net](https://www.rubensworks.net/)'s `references.bib` and at Ruben Taelman's
biblio records, but both can be changed under **Settings** and are remembered by your browser.

Results are split into three buckets:

| Bucket | Meaning |
| --- | --- |
| **Missing from biblio** | No biblio record resembles this publication. These are the ones to add. |
| **Already in biblio** | Matched on DOI, on an identical title, or on a title that is close enough. |
| **Need a closer look** | Resembles an existing record, but not closely enough to decide automatically. |

Every missing publication shows its **DOI**, **preprint link** and **published link** where these are known.

### Copying into an email

Every copy button puts both a rich text and a plain text flavour on the clipboard, so pasting into a mail client
keeps the links clickable, while plain text editors get a readable fallback.

* **Copy all** — the full list, with a heading and all groups.
* **Copy group** — one author's publications, for a mail to that specific co-author.
* **Copy** — a single publication.

## How the comparison works

1. The BibTeX file is downloaded and parsed in the browser.
2. All biblio records of the configured author are fetched from the
   [biblio.ugent.be JSON API](https://biblio.ugent.be/publication?q=&format=json)
   (the regular search interface with `format=json`, which sends `Access-Control-Allow-Origin: *`).
3. Each publication is matched against those records:
   * a shared DOI or an identical normalized title is conclusive;
   * otherwise a similarity score combining character bigrams and word overlap decides,
     dampened when the publication years are more than one year apart.
4. Optionally, two enrichment steps run over whatever is still unmatched:
   * **Search biblio by title as well** searches the whole bibliography for the title, which finds records that
     already exist but are not linked to you — those only need to be claimed, not added.
   * **Look up missing DOIs on Crossref** fills in a DOI when the bibliography has none.
     Crossref results are only accepted when their title closely matches, since Crossref always answers with
     its best guesses.

### Finding your biblio query

The **Biblio query** setting is a raw [biblio.ugent.be](https://biblio.ugent.be/publication) search query.
The reliable one is `ugent_id:<your UGent id>`. To find your id, search for one of your publications and look at
the JSON of the response:

```bash
curl 'https://biblio.ugent.be/publication?q=%22Your+Name%22&format=json&limit=1' | jq '.hits[0].author'
```

## Development

```bash
npm install
npm run dev     # Development server
npm run build   # Typecheck and bundle into dist/
npm run lint    # ESLint, using @rubensworks/eslint-config
npm test        # Jest
```

Pushes to `master` are built and published to GitHub Pages by
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## License

This code is copyrighted by [Ruben Taelman](https://www.rubensworks.net/)
and released under the [MIT license](http://opensource.org/licenses/MIT).
