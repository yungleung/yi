# Release checklist

Run this before publishing a release or making the repository public. Releases are built only by a
tag; the workflow refuses a tag unless it is `v` plus one exact version shared by `package.json`,
`src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`.

## Updater signing key

The updater private key lives outside this repository:

```text
~/.tauri/yi-updater.key
```

The matching public key is:

```text
~/.tauri/yi-updater.key.pub
```

Back up the private key somewhere secure and separate from the only working copy. If it is lost,
existing installations cannot verify future updates. Never commit it, paste it into an issue, or
include it in release notes.

The repository's GitHub Actions secrets must contain:

| Secret | Value |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | The complete contents of `~/.tauri/yi-updater.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The key password, when the key has one; omit it for the passwordless first-release key |

Configure them under **Repository settings → Secrets and variables → Actions → New repository
secret**.

The first release uses ad-hoc macOS signing (`APPLE_SIGNING_IDENTITY=-`). This keeps Apple Silicon
builds from being treated as damaged, but macOS may still require **Open Anyway** on first launch.
Replace the signing identity and add Apple notarization secrets before calling the macOS build
notarized.

## Build and tests on a clean copy

```bash
git clone . /tmp/yi-publish && cd /tmp/yi-publish
npm ci
npx tsc --noEmit
npm run check
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri dev        # the app starts, the demo document loads
```

## Nothing private is in the tree

```bash
git grep -n "/Users/urshanabi" -- . ':!docs/release-checklist.md' ':!docs/superpowers'
git grep -nE "api[_-]?key|token|secret|password" src src-tauri | grep -v node_modules
git status --short                                 # clean
```

The first grep must print nothing: the only places this repository names a home
directory are the documents that talk about doing so, and both are excluded above.

The notes under `test/fixtures/workspace/` are deliberate: they are the maintainer's
own writing, published under CC BY 4.0, and their README says so.

## The paperwork matches

- `LICENSE` is MIT and `README.md` says so.
- `README.md` links resolve, and its commands run as written.
- `CONTRIBUTING.md` and `docs/ai-context.md` name the commands that actually exist
  in `package.json`.
- `test/fixtures/workspace/README.md` records provenance and licence.
- The version in `package.json`, `src-tauri/Cargo.toml` and
  `src-tauri/tauri.conf.json` agree with the tag.

## CI is green on the branch being published

`tsc`, `npm run check`. The DOM probes are local-only by design (`docs/testing.md`);
run them yourself before a release, against a freshly started app.

## Publish

After the verified branch is merged into `main` and the signing secret exists:

```bash
git push origin main
git tag v0.1.0
git push origin v0.1.0
```

The `release` workflow validates the tag, builds macOS Apple Silicon, macOS Intel, Linux x64 and
Windows x64, uploads the platform artifacts and updater signatures, creates a draft GitHub Release,
then publishes it only after every platform has succeeded:

```text
https://github.com/yungleung/yi/actions/workflows/release.yml
```

Watch every matrix job finish. If one fails, the draft stays unpublished so users do not receive an
incomplete `latest.json`.

## Verify the published update feed

After publication:

```bash
curl --fail --location \
  https://github.com/yungleung/yi/releases/latest/download/latest.json
```

Check that the JSON names version `0.1.0`, includes the expected signed platform entries, and
contains URLs for the same release. Then use **Yi → Help → Check for Updates** in an installed build.

## Then

If a change alters the commands above — or the counts — update this file,
`docs/ai-context.md` and `test/README.md` in the same commit: they are the three places that state
what the suite is.
