/**
 * What the backend reports about a folder, asked the way the app asks.
 *
 * The probe makes a plain folder of its own and asserts what is true of it everywhere: no
 * repository, no cloud drive, and a backend that answers at all. Everything the machine decides —
 * where git was found, what a folder that *is* a repository looks like — is reported rather than
 * asserted, because it depends on the machine this runs on: the `.git` shapes are held by the Rust
 * tests beside the gatherer (`src-tauri/src/versioning.rs`), and the real-repository cases by
 * `versioning-save.js`, which can run git itself.
 *
 * A probe cannot make a `.git` of its own: the app refuses dot-named entries, and the file plugin
 * refuses hidden paths — which is the same rule that makes a clone safe to open.
 *
 * @covers src-tauri/src/versioning.rs, src/api/versioning.ts, src/services/versioning/rules.ts
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const { versioningFacts } = await t.app('/src/api/versioning.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folder = `${home}/yi-probe-versioning-facts`;
  try {
    try {
      await files.deleteEntry(folder);
    } catch {
      // A leftover from a probe that was cut off.
    }
    await files.createEntry(home, 'yi-probe-versioning-facts', false);
    await files.createEntry(folder, 'note.md', true);

    const plain = await versioningFacts(folder);
    check(
      'a folder of its own is no repository and no cloud folder',
      plain.repository.here === false &&
        plain.repository.above === false &&
        plain.cloud === 'none',
      plain
    );
    check(
      'and the facts carry the evidence for both answers',
      typeof plain.cloud_evidence === 'string' &&
        plain.cloud_evidence.length > 0 &&
        typeof plain.git_source === 'string',
      { cloud_evidence: plain.cloud_evidence, git_source: plain.git_source, git: plain.git }
    );
    // The one shape a probe *can* make: a folder that is not itself a repository but sits under one.
    const nested = await versioningFacts('/Users');
    check(
      'a folder above the workspace is reported as an outer repository or not, never guessed',
      typeof nested.repository.above === 'boolean',
      { above: nested.repository.above, toplevel: nested.repository.toplevel }
    );
  } finally {
    try {
      await files.deleteEntry(folder);
    } catch {
      // Already gone.
    }
  }

  return { checks, failed: checks.filter((item) => !item.pass).map((item) => item.name) };
})()
