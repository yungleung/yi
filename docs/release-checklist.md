# Release checklist

Run this before publishing a release or making the repository public.

## Build and tests on a clean copy

```bash
git clone . /tmp/yi-publish && cd /tmp/yi-publish
npm ci
npx tsc --noEmit
npm run check
npm run tauri dev        # the app starts, the demo document loads
```

## Nothing private is in the tree

```bash
git grep -n "/Users/urshanabi" -- . ':!docs/release-checklist.md' ':!docs/superpowers'
git grep -nE "api[_-]?key|token|secret|password" src src-tauri | grep -v node_modules
git status --short                                 # clean
```

The first grep must print nothing: the only places this repository names a home
directory are the two documents that talk about doing so — this checklist and the
P0 plan that wrote it — and both are excluded above.

The notes under `test/fixtures/workspace/` are deliberate: they are the maintainer's
own writing, published under CC BY 4.0, and their README says so.

## The paperwork matches

- `LICENSE` is MIT and `README.md` says so.
- `README.md` links resolve, and its commands run as written.
- `CONTRIBUTING.md` and `docs/ai-context.md` name the commands that actually exist
  in `package.json`.
- `test/fixtures/workspace/README.md` records provenance and licence.
- The version in `package.json` and `src-tauri/tauri.conf.json` agree.

## CI is green on the branch being published

`tsc`, `npm run check`. The DOM probes are local-only by design (`docs/testing.md`);
run them yourself before a release, against a freshly started app.

## Then

Tag the release. If a phase changed the commands above — or the counts — update
this file, `docs/ai-context.md` and `test/README.md` in the same commit: they are
the three places that state what the suite is.
