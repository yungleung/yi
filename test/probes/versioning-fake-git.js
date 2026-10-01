/**
 * What the app asks git to do, watched by a git that only records.
 *
 * The app may run git for exactly three things — `init`, `add -- <path>` and
 * `commit -m <message> -- <path>` — and for nothing else (the spec's never-dos: no `fetch`, `pull`,
 * `gc`, `clean`, `reset`, `checkout`, `switch`, `amend`, no force). Proving that from the app's own
 * hand means watching the arguments, and watching the arguments means a git that records instead
 * of doing: `test/probes/fake-git.sh`, committed, since a probe can make files and folders through
 * the app but cannot set an executable bit on one.
 *
 * The app is pointed at it through its own seam (`versioning_use_git`), which the harness clears
 * before every probe and this one clears on its way out — so a run the bridge cuts off costs the
 * next probe nothing. The watcher is also why no `-C` or `-c` can hide: the recorder is handed the
 * whole argv, and the log is read back whole.
 *
 * @covers src-tauri/src/versioning.rs (run_git, init_repository_at, commit_at), src/api/versioning.ts
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const { pointAtGit, initWorkspaceRepository, commitPaths } = await t.app('/src/api/versioning.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const read = async (path) => {
    const bytes = await invoke('plugin:fs|read_text_file', { path });
    return new TextDecoder().decode(bytes instanceof ArrayBuffer ? bytes : Uint8Array.from(bytes));
  };
  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folder = `${home}/yi-probe-fake-git`;
  const note = `${folder}/note.md`;
  try {
    try {
      await files.deleteEntry(folder);
    } catch {
      // A log a run the bridge cut off left behind.
    }
    await files.createEntry(home, 'yi-probe-fake-git', false);
    await files.createEntry(folder, 'note.md', true);

    await pointAtGit(`${window.__probePaths.checkout}test/probes/fake-git.sh`);
    const gitDir = await initWorkspaceRepository(folder, false);
    await commitPaths(folder, [note], 'a version', { name: 'Yi', email: 'yi@localhost' });

    const lines = (await read(`${folder}/argv.log`)).trim().split('\n');
    check(
      'the app runs git for the three things it may run it for, with the path it means',
      lines.length === 3 &&
        lines[0].endsWith(' init') &&
        lines[1].includes(` add -- ${note}`) &&
        lines[2].includes(` commit -m a version -- ${note}`),
      lines
    );
    const never = ['fetch', 'pull', 'gc', 'clean', 'reset', 'checkout', 'switch', 'amend', 'force', 'hard'];
    check(
      'and no argument of any call is one of the never-dos',
      !lines.some((line) =>
        line
          .split(' ')
          .some((argument) => never.includes(argument.replace(/^-+/, '')))
      ),
      lines
    );
    check(
      'a repository asked for as a plain one is in the workspace itself',
      gitDir === `${folder}/.git`,
      gitDir
    );
  } finally {
    await pointAtGit(null);
    try {
      await files.deleteEntry(folder);
    } catch {
      // Already gone.
    }
  }
  return { checks, failed: checks.filter((item) => !item.pass).map((item) => item.name) };
})()
