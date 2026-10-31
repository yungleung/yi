/**
 * Every committed edit/history change announces one typed local
 * `document_changed` fact with the same document key and a new revision.
 *
 * @covers src/ui/markdown/markdown_editor.ts, src/services/app_events.ts
 */
(async () => {
  const t = window.__t;
  const runtime = await t.app('/src/commands/runtime.ts');
  const { eventManager } = await t.app('/src/services/event_manager.ts');
  const checks = [];
  const failed = [];
  const check = (name, pass, actual = null) => {
    checks.push({ name, pass, actual });
    if (!pass) failed.push(name);
  };

  await t.load('Alpha.\n');
  const start = await runtime.dispatchCommand(
    'document:getRevision',
    null,
    { kind: 'toolbar' }
  );
  const events = [];
  await eventManager.on('document_changed', (event) => events.push(event));

  const edit = await runtime.dispatchCommand(
    'document:replaceRange',
    {
      ...start.value,
      from: 0,
      to: 5,
      replacement: 'Gamma'
    },
    { kind: 'toolbar' },
    { correlationId: 'change-edit' }
  );
  check('the edit succeeds', edit.ok === true, edit);
  check('one edit emits one document fact', events.length === 1, events.length);
  check('the fact says edit', events[0]?.payload.reason === 'edit', events[0]?.payload.reason);
  check('the fact advances one revision', events[0]?.payload.revision === 1, events[0]?.payload);
  check('the fact carries the new text', events[0]?.payload.text === 'Gamma.\n');
  check('the fact stays local', events[0]?.source === 'local', events[0]?.source);

  const undo = await runtime.dispatchCommand(
    'history:undo',
    null,
    { kind: 'toolbar' },
    { correlationId: 'change-undo' }
  );
  check('undo succeeds', undo.ok === true, undo);
  check('undo adds exactly one more fact', events.length === 2, events.length);
  check('the fact says undo', events[1]?.payload.reason === 'undo', events[1]?.payload.reason);
  check('undo advances one revision', events[1]?.payload.revision === 2, events[1]?.payload);
  check('the fact carries the restored text', events[1]?.payload.text === 'Alpha.\n');
  check(
    'both facts describe the same document',
    events[0]?.payload.documentKey === events[1]?.payload.documentKey,
    events.map((event) => event.payload.documentKey)
  );
  check(
    'the undo names the revision it replaced',
    events[1]?.payload.previousRevision === 1,
    events[1]?.payload.previousRevision
  );

  return { checks, failed };
})()
