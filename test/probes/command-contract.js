/**
 * The running app exposes the same typed command catalogue and dispatcher that
 * every trigger uses, and malformed external input is stopped before dispatch.
 *
 * @covers src/commands/contracts.ts, src/commands/runtime.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const failed = [];
  const check = (name, pass, detail = null) => {
    checks.push({ name, pass, detail });
    if (!pass) failed.push(name);
  };
  const contracts = await t.app('/src/commands/contracts.ts');
  const runtime = await t.app('/src/commands/runtime.ts');

  check(
    'the app has the typed command catalogue',
    'format:bold' in contracts.commandContracts &&
      contracts.commandContracts['table:deleteRow'].effect === 'document.write'
  );
  check(
    'a native-menu-like folder payload parses',
    JSON.stringify(
      contracts.parseCommandInput('file:newMarkdown', { folder: '/notes/history' })
    ) === JSON.stringify({ folder: '/notes/history' })
  );

  let invalid = null;
  try {
    contracts.parseCommandInput('table:insert', { rows: 0, columns: 1 });
  } catch (error) {
    invalid = error.name;
  }
  check(
    'an invalid command payload is refused before execution',
    invalid === 'CommandInputError',
    invalid
  );
  check(
    'the dispatcher is the runtime command entry',
    typeof runtime.commandDispatcher.dispatch === 'function' &&
      typeof runtime.runCommand === 'function'
  );

  return { checks, failed };
})()
