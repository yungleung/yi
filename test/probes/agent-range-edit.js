/**
 * A range edit tied to one document revision succeeds once; retrying from the
 * old revision is refused before it can overwrite newer text.
 *
 * @covers src/ui/markdown_host/commands.ts, src/ui/markdown/command_api.ts,
 *         src/commands/dispatch.ts
 */
(async () => {
  const t = window.__t;
  const runtime = await t.app('/src/commands/runtime.ts');
  const checks = [];
  const failed = [];
  const check = (name, pass, actual = null) => {
    checks.push({ name, pass, actual });
    if (!pass) failed.push(name);
  };
  const dispatch = async (id, input) =>
    await runtime.dispatchCommand(
      id,
      input,
      { kind: 'toolbar' },
      { correlationId: `agent-probe-${id}` }
    );

  await t.load('Alpha beta.\n');
  const initial = await dispatch('document:getRevision', null);
  check('the app reports a position', initial.ok === true, initial);
  check('a loaded document starts at revision zero', initial.value?.revision === 0, initial.value);

  const first = await dispatch('document:replaceRange', {
    ...initial.value,
    from: 0,
    to: 5,
    replacement: 'Gamma'
  });
  check('the matching edit succeeds', first.ok === true, first);
  check('and advances one revision', first.value?.revision === 1, first.value);
  await t.sleep(120);
  const firstText = await t.raw();
  check('and changes exactly the requested range', firstText === 'Gamma beta.\n', firstText);

  const stale = await dispatch('document:replaceRange', {
    ...initial.value,
    from: 0,
    to: 5,
    replacement: 'Delta'
  });
  check('the old plan is stale', stale.ok === false && stale.code === 'stale', stale);
  const staleText = await t.raw();
  check('and it leaves the newer text untouched', staleText === 'Gamma beta.\n', staleText);

  const current = await dispatch('document:getRevision', null);
  const second = await dispatch('document:replaceRange', {
    ...current.value,
    from: 0,
    to: 5,
    replacement: 'Delta'
  });
  check('a fresh plan succeeds', second.ok === true, second);
  check('and advances exactly once more', second.value?.revision === 2, second.value);
  const finalText = await t.raw();
  check('and the final document holds the second edit', finalText === 'Delta beta.\n', finalText);

  return { checks, failed };
})()
