# Deployment

The app is a static bundle, so any static host works. This document contains the two GitHub Actions
workflows that build it and publish it to GitHub Pages.

> **Why are these here instead of in `.github/workflows/`?**
> The token that opened the pull request introducing them has `repo` scope but not `workflow` scope,
> which GitHub requires to create or update anything under `.github/workflows/`.
> Copy the two files below into place and commit them:
>
> ```bash
> mkdir -p .github/workflows
> # Paste the two blocks below into .github/workflows/ci.yml and .github/workflows/deploy.yml
> git add .github/workflows && git commit -m "Add CI and deployment workflows"
> ```
>
> Then enable Pages under **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## `.github/workflows/ci.yml`

Runs the linter, the tests, and a production build on every push and pull request.

```yaml
name: CI

on:
  push:
    branches:
      - master
      - main
  pull_request:

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint

  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test

  build:
    name: Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
```

## `.github/workflows/deploy.yml`

Builds and publishes to GitHub Pages on every push to the default branch.

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches:
      - master
      - main
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    name: Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    name: Deploy
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

## Deploying elsewhere

`npm run build` writes a self-contained bundle to `dist/`, with a relative `base`, so it also works
from a subdirectory of any other static host.
