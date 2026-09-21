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
git grep -n "/Users/urshanabi"                     # only the fixtures' provenance note
git grep -nE "api[_-]?key|token|secret|password" src src-tauri | grep -v node_modules
git status --short                                 # clean
```

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

Tag the release, and update the thread in `docs/superpowers/plans/` that this
checklist belongs to.
