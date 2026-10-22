/**
 * Finding and running W3C's EPUB validator for the Node checks.
 *
 * The jar is optional: a clean checkout must remain testable without Java or the downloaded tool.
 * `YI_EPUBCHECK` names a jar anywhere; otherwise the newest cached version is used.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const have = (program, argument) =>
  spawnSync(program, [argument], { encoding: 'utf8' }).error === undefined;

export function epubcheckJar() {
  const named = process.env.YI_EPUBCHECK;
  if (named !== undefined && named !== '') {
    return existsSync(named) ? named : null;
  }
  const cache = join(homedir(), '.cache/yi-tools/epubcheck');
  if (!existsSync(cache)) {
    return null;
  }
  for (const version of readdirSync(cache).sort().reverse()) {
    const jar = join(cache, version, 'epubcheck.jar');
    if (existsSync(jar)) {
      return jar;
    }
  }
  return null;
}

export function runEpubcheck(path) {
  const jar = epubcheckJar();
  if (jar === null || !have('java', '-version')) {
    return {
      available: false,
      ok: false,
      reason: jar === null ? 'no epubcheck jar' : 'no java'
    };
  }
  const checked = spawnSync('java', ['-jar', jar, path], {
    encoding: 'utf8',
    timeout: 300_000
  });
  const verdict = `${checked.stdout ?? ''}${checked.stderr ?? ''}`;
  const complaints = verdict.split('\n').filter((line) => /^(ERROR|FATAL)\(/.test(line));
  const counts = verdict.split('\n').find((line) => line.startsWith('Messages:')) ?? '';
  return {
    available: true,
    ok: checked.status === 0 && complaints.length === 0,
    complaints,
    counts,
    verdict
  };
}
