/**
 * Refuses a release tag unless it is v plus one exact SemVer shared by the
 * frontend, Rust package and Tauri configuration manifests.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function cargoPackageVersion(source) {
  const start = source.indexOf('[package]');
  if (start < 0) {
    return null;
  }
  const body = source.slice(start + '[package]'.length);
  const end = body.search(/^\[/m);
  const section = end < 0 ? body : body.slice(0, end);
  const version = /^version\s*=\s*"([^"]+)"/m.exec(section)?.[1];
  return version ?? null;
}

/** Validates one release tag against a repository root and returns its version. */
export function validateVersion(tag, root = process.cwd()) {
  if (!tag.startsWith('v')) {
    throw new Error(`release tag must start with v: ${tag}`);
  }
  const version = tag.slice(1);
  if (!SEMVER.test(version)) {
    throw new Error(`release tag is not v plus SemVer: ${tag}`);
  }

  const versions = {
    'package.json': readJson(join(root, 'package.json')).version,
    'src-tauri/Cargo.toml': cargoPackageVersion(
      readFileSync(join(root, 'src-tauri/Cargo.toml'), 'utf8')
    ),
    'src-tauri/tauri.conf.json': readJson(join(root, 'src-tauri/tauri.conf.json')).version
  };
  const mismatched = Object.entries(versions).filter(([, value]) => value !== version);
  if (mismatched.length > 0) {
    const details = mismatched.map(([path, value]) => `${path}=${value ?? 'missing'}`).join(', ');
    throw new Error(`release tag ${tag} does not match ${details}`);
  }
  return version;
}

const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invoked === import.meta.url) {
  const tag = process.argv[2] ?? '';
  try {
    validateVersion(tag);
    console.log(`release version: ${tag} matches all manifests`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
