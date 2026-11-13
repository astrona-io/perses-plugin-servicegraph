# Contributing

Thanks for helping. Bug reports, fixes and small focused features are welcome. For anything larger,
open an issue first so we can agree on the approach.

## Setup

- Node 22 or later
- [`percli`](https://github.com/perses/perses/releases/tag/v0.54.0) v0.54.0
- [`cue`](https://cuelang.org/docs/introduction/installation/) on `PATH` (v0.17.1 tested)

```bash
npm ci
```

## Build and check

```bash
npm run lint          # ESLint
npm run type-check    # tsc
npm run build         # module-federation bundle in dist/
percli plugin build   # validates the CUE schema and writes ServiceGraph-<version>.tar.gz
```

CI runs lint, type-check and build on every pull request. Please run them locally first.

`percli plugin build` uses `cue` to vendor `github.com/perses/shared/cue` into `cue.mod/pkg/`
(git-ignored) and into the archive. The dependency is declared in `cue.mod/module.cue`; keep its
version in step with the Perses version the plugin targets.

## Try it in Perses

`npm run dev` serves the plugin for `percli plugin start` against a running Perses. To test the
packaged archive instead, put `ServiceGraph-<version>.tar.gz` in a directory listed in
`plugin.archive_paths` (see the README) and restart Perses.

The CUE schema is in `schemas/panels/service-graph-chart/`. After changing it, check that Perses accepts a
valid dashboard and rejects a bad one, for example with `percli lint` or Perses'
`POST /api/validate/dashboards`.

## Local test data

Without a tracing stack you can still try the panel: generate counters and histograms named like the
Tempo output (`traces_service_graph_request_total`, `..._request_failed_total`,
`..._request_server_seconds_bucket`, with `client`, `server`, `connection_type` and the namespace
labels), backfill them into a throwaway Prometheus with `promtool tsdb create-blocks-from openmetrics`,
and point a local Perses at it. Use neutral names (the screenshots use a namespace called `shop`).

## Tests

The project has no test suite beyond lint, type-check and the schema validation in
`percli plugin build`. If you want to add tests, raise it in an issue first.

## Releasing

1. Set the version in `package.json` and `package-lock.json` (`npm version <X.Y.Z> --no-git-tag-version`),
   move the `Unreleased` entries in `CHANGELOG.md` under it, and merge that to `main`.
2. Push a signed or annotated tag `v<X.Y.Z>` on that commit. A prerelease tag (`v<X.Y.Z>-rc.1`) works
   the same way and is published as a GitHub prerelease.
3. The `release` workflow checks that the tag matches `package.json`, builds `ServiceGraph-<version>.tar.gz`
   with `percli plugin build`, attaches it and its `.sha256` to the GitHub release, and pushes
   `ghcr.io/astrona-io/perses-plugin-servicegraph:<tag>` for linux/amd64 and linux/arm64, with build provenance
   attestations for both.
4. Write the release notes on the GitHub release: the workflow leaves them empty.

## Pull requests

- Keep each pull request to one change, and describe what you checked.
- Add a line to `CHANGELOG.md` under an `Unreleased` heading.
- Sign off your commits (`git commit -s`) to certify the
  [Developer Certificate of Origin](https://developercertificate.org/).

By contributing you agree that your contribution is licensed under Apache-2.0, as the project is.
