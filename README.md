# Biblio Checker

[![Build status](https://github.com/rubensworks/biblio-checker/workflows/CI/badge.svg)](https://github.com/rubensworks/biblio-checker/actions?query=workflow%3ACI)

Lists which publications from a BibTeX bibliography are **not** in the
[UGent Academic Bibliography](https://biblio.ugent.be/) yet, grouped by first author,
so you know exactly what still needs to be registered and who to chase for it.

Everything runs in the browser: no backend, and nothing is stored anywhere but your own browser. The settings
live in the URL fragment, so any view can be bookmarked.

![Screenshot of Biblio Checker](docs/screenshot.png)

<sub>OpenAlex was out of daily quota when this screenshot was taken, hence the warning: the publication statuses
shown come from Crossref alone.</sub>

## Usage

Open the app, and it immediately checks the configured bibliography.
The defaults point at [rubensworks.net](https://www.rubensworks.net/)'s `references.bib` and at Ruben Taelman's
biblio records, but both can be changed under **Settings** and are remembered by your browser.

Results are split into four buckets:

| Bucket | Meaning |
| --- | --- |
| **Missing from biblio** | Published at a conference or journal, and no biblio record resembles it. These are the ones to add, and they are the only ones in the main list. |
| **Already in biblio** | Matched on DOI, on an identical title, or on a title that is close enough. |
| **Preprint only** | No publisher version could be found, so it is not ready for biblio yet. Collapsed at the bottom of the page. |
| **Need a closer look** | Resembles an existing record, but not closely enough to decide automatically. Collapsed at the bottom of the page. |

Every missing publication shows its **DOI**, **preprint link**, **published link** and a direct **PDF link**
where these are known. When no PDF could be found, the entry is marked `PDF: TODO` — on screen and in the copied
text — so that a co-author reading your email knows exactly what to send you.

### Copying into an email

Every copy button puts both a rich text and a plain text flavour on the clipboard, so pasting into a mail client
keeps the links clickable, while plain text editors get a readable fallback.

* **Copy all** — the full list, with a heading and all groups.
* **Copy group** — one author's publications, for a mail to that specific co-author.
* **Copy** — a single publication.

### Bookmarking a view

The settings live in the URL fragment, so bookmarking the page keeps them:

```
https://rubensworks.github.io/biblio-checker/#bib=https%3A%2F%2Fexample.org%2Frefs.bib&q=ugent_id%3A802001410273&deep=0
```

| Parameter | Setting |
| --- | --- |
| `bib` | BibTeX URL |
| `q` | Biblio query |
| `deep` | Search biblio by title as well (`1` / `0`) |
| `publishers` | Check where publications appeared (`1` / `0`) |
| `pdfs` | Look for a direct PDF link (`1` / `0`) |

Only what differs from the defaults is written, so the default view keeps a clean URL and a bookmark follows any
later change of defaults. A fragment never leaves the browser — it is not sent to the server — and opening a link
applies the settings it carries over whatever this browser remembers, so a shared link shows the same view
everywhere. Editing the fragment by hand re-runs the check.

**The OpenAlex API key is deliberately not in the URL.** It is a credential, and URLs end up in bookmarks, synced
browser profiles and pasted messages. It stays in local storage on the machine it was typed on, which means a
link you share carries your view but not your key — whoever opens it uses their own key, or none.

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
   * **Check where publications appeared** finds out which ones actually reached a publisher, and fills in DOIs
     along the way. See below.

### What a DOI in the bibliography buys

A `doi` field names the work itself, so wherever the app would otherwise have to recognize a publication by its
title, it uses that DOI instead:

* a biblio record with the same DOI is the same publication, whatever either title says, both for your own
  records and for the ones the title search turns up under another author;
* the publication counts as published without a single request, unless arXiv registered the DOI;
* OpenAlex and Crossref are asked for that exact work rather than searched by title, which is cheaper and cannot
  return a near miss. That is also how the PDF of such a publication is found, since its DOI means no lookup ran
  that would otherwise have reported one;
* the DOI and its `https://doi.org/` link end up in the results and in everything copied from them.

The one place the DOI is deliberately ignored is the published-or-preprint question for an arXiv DOI: every arXiv
preprint has one, so looking it up would answer `preprint` for papers that did reach a publisher. Those are still
recognized by title.

## Deciding what counts as published

A publication only belongs in biblio once it exists at a publisher, so everything that is still just a preprint
is kept out of the main list and collapsed at the bottom of the page instead.

Only publications that are really missing from biblio are looked up. Whether something that is already
registered reached a publisher makes no difference to what still has to be added, so publications that matched a
biblio record, that only resemble one closely enough to need review, or that the title search found under
another author, are all skipped rather than spending somebody else's rate limit on them.

For the ones that remain, the bibliography is trusted first: a DOI that was not registered by arXiv, or a URL
pointing at a publisher rather than at a self-archived copy, settles the question without a request. Otherwise
two databases are asked in order, by title, and the first confident answer wins:

1. [**OpenAlex**](https://docs.openalex.org/), which also indexes proceedings that never get a DOI. A work counts
   as published unless it is typed as a `preprint` or every one of its locations is a `repository`, which is how
   OpenAlex types arXiv and institutional archives.
2. [**Crossref**](https://api.crossref.org/), as a second opinion, and only when OpenAlex had no answer. Its
   `posted-content` type means a preprint; `journal-article`, `proceedings-article`, `book-chapter` and friends
   mean published.

Both always answer with their best guesses, so results are only accepted when the returned title closely matches
the queried one. Both also throttle bursts, so a `429` is retried with a short backoff rather than treated as a
failure — unless the `Retry-After` says the daily quota is gone, in which case the source is given up on.

When **no** source could be reached, the publication keeps an unknown status and stays in the main list with a
warning, rather than being hidden on a guess. The status line names the databases that were unreachable.

## Finding the PDF

Biblio wants the PDF itself, but a bibliography usually points at a landing page instead. The PDF is resolved in
the cheapest order that works, and only for publications that are missing from biblio:

1. **The link already is a PDF.** Nothing to do.
2. **It is an arXiv abstract page.** `arxiv.org/abs/X` always has its PDF at `arxiv.org/pdf/X`, so no request is
   needed. (arXiv serves those without a `.pdf` extension, which is why the path is special-cased.)
3. **A database reported an open access PDF.** Free when the lookup above already happened. When the
   bibliography lists a DOI it did not, since the DOI settled the publisher question by itself, so the databases
   are asked for that DOI here instead.
4. **The landing page is fetched and searched** for a link to a PDF.

Only PDFs on the *same host as the landing page* are accepted. An author's page links its own PDF relatively,
while a cross-origin PDF on such a page is much more likely to be a cited paper than the paper being described.

Nothing is guessed: no `paper.pdf`-style URL is invented and probed. If none of the four steps finds a PDF, the
publication is marked `PDF: TODO` rather than given a link that might 404.

### OpenAlex API key

Optional, and only affects how many lookups you get per day.

OpenAlex charges usage rather than data: every account gets a free daily budget, and a `works` search costs
$0.001 of it. Without a key you draw from the **keyless budget of $0.10 a day**, which is shared by everyone on
your IP address — about 100 lookups, and the app spends one per publication that is missing from biblio. A free
key gives you **$1 a day of your own**, ten times as much, with no payment method involved.

To get one:

1. Create an account on [openalex.org](https://openalex.org/) — it takes about half a minute.
2. Copy the key from [openalex.org/settings/api](https://openalex.org/settings/api).
3. Paste it into **Settings → OpenAlex API key** in this app.

The key is stored in this browser's local storage together with the other settings, and is sent as an `api_key`
query parameter to `api.openalex.org` and to nothing else. There is no backend here, so it never reaches any
server of this app — but it does mean the key is only as private as the browser profile holding it, so use a
personal machine, and do not put a key in the repository. If one ever leaks, rotate it at
[Settings → API key](https://openalex.org/settings/api), which invalidates the old one immediately.

When OpenAlex refuses a lookup because the budget is gone, the check does not stall: the request is given up on
at once and Crossref answers instead, with the status line saying so.

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

## Deployment

`npm run build` writes a self-contained bundle to `dist/`, using a relative base so it works from any
subdirectory. See [`docs/deployment.md`](docs/deployment.md) for the GitHub Actions workflows that build it
and publish it to GitHub Pages on every push to the default branch.

## License

This code is copyrighted by [Ruben Taelman](https://www.rubensworks.net/)
and released under the [MIT license](http://opensource.org/licenses/MIT).
