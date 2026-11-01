/**
 * Local facts reach their listeners synchronously, while an event from the
 * native/Rust side still arrives through Tauri and keeps the same typed shape.
 *
 * @covers src/services/events/index.ts, src/events/local_bus.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const failed = [];
  const check = (name, pass, actual = null) => {
    checks.push({ name, pass, actual });
    if (!pass) failed.push(name);
  };
  const { eventManager } = await t.app('/src/services/events/index.ts');

  let localSeen = null;
  await eventManager.on('editor_layout_changed', (event) => {
    localSeen = event;
  });
  const localEmit = eventManager.emit('editor_layout_changed', 'auto');
  const localWasSynchronous = localSeen?.payload === 'auto';
  await localEmit;
  check('a local fact reaches its listener before emit settles', localWasSynchronous);
  check('the local fact carries an envelope id', Boolean(localSeen?.id), localSeen?.id ?? null);
  check('the local fact says it stayed local', localSeen?.source === 'local', localSeen?.source);

  let inboundSeen = null;
  await eventManager.on('report_issue', (event) => {
    inboundSeen = event;
  });
  await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', {
    event: 'report_issue',
    payload: null
  });
  for (let attempt = 0; attempt < 20 && inboundSeen === null; attempt += 1) {
    await t.sleep(25);
  }
  check('a native event still reaches the same listener shape', inboundSeen?.event === 'report_issue');
  check('the native event says it crossed Tauri', inboundSeen?.source === 'inbound', inboundSeen?.source);

  return { checks, failed };
})()
