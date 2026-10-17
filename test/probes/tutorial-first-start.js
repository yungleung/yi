/**
 * The tutorial's first-start half, through the session the app actually loads.
 *
 * `initializeConfig` calls `openTutorialForFirstStart` after the session restores; this drives that
 * function with an empty session file, so the answer is the same one a fresh install gets without
 * reloading the whole window. The second half proves a later start with nothing restored leaves the
 * page empty.
 *
 * @covers src/ui/tutorial/tutorial_flow.ts (openTutorialForFirstStart),
 *   src/ui/tutorial/tutorial_rules.ts, src/services/session.ts
 */
(async () => {
  const t = window.__t;
  const api = await t.app('/src/api/session.ts');
  const session = await t.app('/src/services/session.ts');
  const flow = await t.app('/src/ui/tutorial/tutorial_flow.ts');
  const { emptySession } = await t.app('/src/services/session_rules.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });

  const previousSession = await api.loadSessionText();
  const empty = JSON.stringify(emptySession());
  try {
    await api.saveSessionText(empty);
    await session.documentSession.load();
    check('with no session, nothing is on screen', session.documentSession.current() === null, true);

    await flow.openTutorialForFirstStart(true);
    const opened = session.documentSession.current();
    check(
      'a first start opens the tutorial',
      opened?.title === 'Welcome to Yi' && opened?.readOnly === true,
      { title: opened?.title ?? null, readOnly: opened?.readOnly ?? null }
    );

    await api.saveSessionText(empty);
    await session.documentSession.load();
    await flow.openTutorialForFirstStart(false);
    check(
      'a later start with nothing restored opens nothing',
      session.documentSession.current() === null,
      session.documentSession.current()?.title ?? null
    );
  } finally {
    await api.saveSessionText(previousSession ?? empty);
    await session.documentSession.load();
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
