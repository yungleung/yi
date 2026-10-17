/**
 * Checks the session's rules in Node: which document a click opens, what pushing and dropping
 * do, how the text and the view are captured, and what a session file is allowed to say.
 *
 * The rules are a pure function of the state — the DOM only reads and writes them — so they are
 * asserted here rather than driven through the app (`test/probes/document-stack.js` drives the
 * buttons, and `document-session-restart.js` the file).
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-session-'));

/** Bundles one module and imports it, the way every check loads its subject. */
async function bundleModule(input, name) {
  const bundle = await rolldown({ input, logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  const file = join(directory, `${name}.mjs`);
  writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
  return import(file);
}

const session = await bundleModule('src/services/session_rules.ts', 'session_rules');
const identity = await bundleModule('src/services/document_identity.ts', 'document_identity');
const {
  SESSION_VERSION,
  capture,
  currentDocument,
  dropFromStack,
  emptySession,
  isSaved,
  keyFor,
  markSaved,
  openDecision,
  openInto,
  parseSession,
  reachable,
  restore,
  serializeSession,
  setPath,
  setStacked,
  stackedDocuments
} = session;
const { documentId, documentTitle } = identity;

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

// --- what a document is called ------------------------------------------------------------

const NOTE = '---\nid: 20240707122715\ntitle: A note about things\n---\n\n# A heading\n\nBody.\n';
check('the id is the one the frontmatter gives', documentId(NOTE, '/notes/a.md'), '20240707122715');
check(
  'and the first fourteen digits when it has none',
  documentId('# A heading\n\nwritten 20250101121314 by hand\n', '/notes/b.md'),
  '/notes/b.md'
);
check(
  'a stamp after the opening paragraph is not the top, so it is not the id',
  documentId('# A heading\n\n20250101121314\n\nBody.\n', '/notes/b.md'),
  '/notes/b.md'
);
check(
  'and one written above the text, with no frontmatter',
  documentId('20250101121314\n\n# A heading\n', '/notes/b.md'),
  '20250101121314'
);
check(
  'but a note that links to another by its id is not that note',
  documentId('# A heading\n\nSee [[20250101121314]] for more.\n', '/notes/b.md'),
  '/notes/b.md'
);
check('and only then the path', documentId('# No id here\n', '/notes/c.md'), '/notes/c.md');
check('a document with neither has no id', documentId('# Nothing\n', null), null);
check(
  'a longer run of digits is not an id',
  documentId('# 202501011213140\n', '/notes/d.md'),
  '/notes/d.md'
);
check('the title is the frontmatter one', documentTitle(NOTE, '/notes/a.md'), 'A note about things');
check(
  'else the first heading',
  documentTitle('---\nid: 20240707122715\n---\n\n# Heading here\n', '/notes/a.md'),
  'Heading here'
);
check('else the file name', documentTitle('plain text', '/notes/Some Note.md'), 'Some Note');
check('else Untitled', documentTitle('plain text', null), 'Untitled');
check('and a document with nothing gets a name too', documentTitle('', null), 'Untitled');

// --- opening ------------------------------------------------------------------------------

const openNote = (path, content) =>
  openInto(emptySession(), { path, content }, keyFor(path, content, () => 'made'));

let state = openNote('/notes/a.md', NOTE);
const noteId = state.current;
check('the first document is the current one and is not stacked', {
  current: currentDocument(state)?.id,
  stacked: stackedDocuments(state).length
}, { current: noteId, stacked: 0 });
check('and it is saved, having just been read', isSaved(currentDocument(state)), true);

// Nothing on screen: no question.
check(
  'with nothing open, a file just opens',
  openDecision(emptySession(), { id: 'other' }),
  'open'
);

// The document on screen is not stacked, but its text *is* its file's: replacing it loses
// nothing, so it goes without a question — and the push setting does not push it either, because
// putting a saved document in the stack is the reader's own choice (the stack button).
check('a saved document is replaced without a question', openDecision(state, { id: 'other' }), 'open');
check('and the setting does not push it', openDecision(state, { id: 'other' }, true), 'open');

// A reference document is never the reader's unsaved work, even if something has changed its
// text: opening a file replaces it without a question, and the standing push answer does not turn
// that into a "push and open" either.
const tutorial = openInto(
  emptySession(),
  {
    path: null,
    content: '---\nid: yi-tutorial\ntitle: Welcome\n---\n\nA tutorial.\n',
    readOnly: true
  },
  'yi-tutorial'
);
check('a read-only document is opened as read-only', currentDocument(tutorial)?.readOnly, true);
const tutorialEdited = capture(tutorial, '---\nid: yi-tutorial\ntitle: Welcome\n---\n\nChanged.\n', {
  caret: 4,
  to: null,
  scroll: null
});
check(
  'an edited read-only document is replaced without a question',
  openDecision(tutorialEdited, { id: 'other' }),
  'open'
);
check(
  'and the push setting does not push it',
  openDecision(tutorialEdited, { id: 'other' }, true),
  'open'
);

// An edit its file does not have is what the question is for…
const editing = capture(state, `${NOTE}More.\n`, { caret: 12, to: null, scroll: null });
check('an unstacked document with an edit is asked about', openDecision(editing, { id: 'other' }), 'ask');
// …and what the reader's standing answer replaces: pushed, without a question.
check(
  'and the push setting pushes it without asking',
  openDecision(editing, { id: 'other' }, true),
  'pushAndOpen'
);

// A note that has never been written is not in a file at all, whatever its text says.
const unwritten = openInto(emptySession(), { path: null, content: 'A new note.\n' }, 'made', true);
check(
  'a note with no file is asked about even before it is typed in',
  openDecision(unwritten, { id: 'other' }),
  'ask'
);

// …and saying yes keeps it.
let withBoth = openInto(state, { path: '/notes/b.md', content: '# B\n' }, 'other', true);
check('pushing keeps the document on screen', stackedDocuments(withBoth).map((d) => d.id), [noteId]);
check('and the new one is current', currentDocument(withBoth)?.id, 'other');
check(
  'and it is the only document that is not stacked',
  withBoth.documents.map((d) => d.stacked),
  [true, false]
);

// …and saying no lets it go: it was never stacked, so there is no copy.
let replaced = openInto(state, { path: '/notes/b.md', content: '# B\n' }, 'other', false);
check('declining drops the document that was on screen', replaced.documents.map((d) => d.id), ['other']);

// A stacked document needs no question: its latest version is already in the stack.
const pushed = setStacked(state, noteId, true);
check('a stacked document is replaced without asking', openDecision(pushed, { id: 'other' }), 'open');
let openedOver = openInto(pushed, { path: '/notes/b.md', content: '# B\n' }, 'other', true);
check(
  'and the question is not asked, but it is still kept',
  openedOver.documents.map((d) => ({ id: d.id, stacked: d.stacked })),
  [{ id: noteId, stacked: true }, { id: 'other', stacked: false }]
);

// A document already in the stack is brought forward, not read again.
check('a document in the stack is brought forward', openDecision(openedOver, { id: noteId }), 'bringForward');
check('and the one on screen is already open', openDecision(openedOver, { id: 'other' }), 'alreadyOpen');
state = restore(openedOver, noteId);
check('restoring makes it current', currentDocument(state)?.id, noteId);
check('and leaves the stack alone', stackedDocuments(state).map((d) => d.id), [noteId]);
check(
  'opening a document that is already here never adds a second copy',
  openInto(openedOver, { path: '/notes/a.md', content: NOTE }, noteId, true).documents.length,
  2
);

// --- capturing, saving, dropping ----------------------------------------------------------

const view = { caret: 12, to: null, scroll: { offset: 40, within: 3 } };
const captured = capture(state, `${NOTE}More.\n`, view);
check('capturing writes the text and the view into the current document', {
  content: currentDocument(captured)?.content.endsWith('More.\n'),
  view: currentDocument(captured)?.view
}, { content: true, view });
check('and it is editing, not saved, once it differs', isSaved(currentDocument(captured)), false);
check('the title follows the text', currentDocument(captured)?.title, 'A note about things');
// A capture that cannot see the caret — the block holding it has been unmounted — keeps the one
// the document already had, or a reader who scrolled away from their caret would be put back at
// the beginning of the document.
check('a capture that cannot see the caret keeps the one there was', currentDocument(capture(captured, `${NOTE}More.\n`, { caret: null, to: null, scroll: view.scroll }))?.view.caret, 12);
check('and one that cannot see the view keeps that too', currentDocument(capture(captured, `${NOTE}More.\n`, { caret: 4, to: null, scroll: null }))?.view.scroll, view.scroll);
// A selection is a range, and the session keeps both of its ends so a note can reopen with its
// title already selected (`services/new_document.ts: titleRange`).
const range = { caret: 20, to: 28, scroll: view.scroll };
const selected = capture(state, `${NOTE}More.\n`, range);
check('a selection is kept as its two ends', currentDocument(selected)?.view, range);
check(
  'and a capture that sees a plain caret replaces the range with it',
  currentDocument(capture(selected, `${NOTE}More.\n`, { caret: 4, to: null, scroll: null }))?.view,
  { caret: 4, to: null, scroll: view.scroll }
);
check(
  'a capture that cannot see the caret keeps both ends of the range',
  currentDocument(capture(selected, `${NOTE}More.\n`, { caret: null, to: null, scroll: null }))?.view,
  range
);
check(
  'a range survives the session file',
  parseSession(serializeSession(selected)).documents.find((document) => document.id === noteId)?.view,
  range
);
check(
  'a written document is saved again',
  isSaved(currentDocument(markSaved(captured, noteId, currentDocument(captured).content))),
  true
);
check('and it can be given the path it was written to', currentDocument(setPath(captured, noteId, '/notes/a.md'))?.path, '/notes/a.md');

// Dropping: the document on screen stays, one behind it goes.
const three = openInto(
  openInto(pushed, { path: '/notes/b.md', content: '# B\n' }, 'other', true),
  { path: '/notes/c.md', content: '# C\n' },
  'third',
  true
);
check('three documents, two of them stacked', stackedDocuments(three).length, 2);
check(
  'dropping a document that is not on screen removes it',
  dropFromStack(three, noteId).documents.map((d) => d.id),
  ['other', 'third']
);
check(
  'dropping the document on screen only takes it out of the stack',
  dropFromStack(three, 'third').documents.map((d) => ({ id: d.id, stacked: d.stacked })),
  [{ id: noteId, stacked: true }, { id: 'other', stacked: true }, { id: 'third', stacked: false }]
);
check('and it is still current', currentDocument(dropFromStack(three, 'third'))?.id, 'third');

// --- the file -----------------------------------------------------------------------------

const roundTripped = parseSession(serializeSession(three));
check('a session survives the round trip', roundTripped, three);
check(
  'a session written before read-only documents reads one as ordinary',
  parseSession(
    JSON.stringify({
      version: SESSION_VERSION,
      current: 'old',
      documents: [
        {
          id: 'old',
          path: null,
          title: 'Old',
          content: 'Old.\n',
          saved: 'Old.\n',
          stacked: false,
          view: { caret: null, to: null, scroll: null }
        }
      ]
    })
  ).documents[0].readOnly,
  false
);
check('a session file this build does not know is discarded', parseSession('{"version":99,"documents":[]}'), emptySession());
check('so is a file that is not JSON', parseSession('not json at all'), emptySession());
check('and so is one with nothing in it', parseSession(null), emptySession());
check('the version this build writes is the one it reads', roundTripped.version, SESSION_VERSION);
check(
  'a document that does not make sense is dropped, not half-read',
  parseSession(JSON.stringify({ version: SESSION_VERSION, current: 'a', documents: [{ id: 'a' }, { id: 'b', path: null, title: 'B', content: '', saved: '', stacked: false, view: { caret: 0, scroll: null } }] })).documents.map((d) => d.id),
  // `a` cannot be read, so nothing is current, and `b` — neither stacked nor on screen — is
  // unreachable and goes with it.
  []
);
check(
  'and a current that names nothing leaves nothing current',
  parseSession(JSON.stringify({ version: SESSION_VERSION, current: 'gone', documents: [] })).current,
  null
);
// A session written before a view had a far end is a plain caret there, which is what it was;
// a far end of the wrong *kind* is a shape this build cannot read, and takes the document with it.
check(
  'a view written before the far end existed reads as a plain caret',
  parseSession(
    JSON.stringify({
      version: SESSION_VERSION,
      current: 'a',
      documents: [{ id: 'a', path: null, title: 'A', content: '', saved: '', stacked: false, view: { caret: 3, scroll: null } }]
    })
  ).documents[0].view,
  // The key order is the one `readView` leaves it in: the fields it read, then the far end it
  // filled in.
  { caret: 3, scroll: null, to: null }
);
check(
  'a far end that is not a number is not repaired',
  parseSession(
    JSON.stringify({
      version: SESSION_VERSION,
      current: 'a',
      documents: [{ id: 'a', path: null, title: 'A', content: '', saved: '', stacked: false, view: { caret: 3, to: 'lots', scroll: null } }]
    })
  ).documents.length,
  0
);
// A document that is neither in the stack nor on screen cannot be reached — nothing names it —
// so it is not kept: an older session file with one is tidied as it is read.
check(
  'a document that is neither stacked nor on screen is not kept',
  reachable({
    version: SESSION_VERSION,
    current: 'a',
    documents: [
      { id: 'a', path: null, title: 'A', content: '', saved: '', stacked: false, view: { caret: 0, scroll: null } },
      { id: 'b', path: null, title: 'B', content: '', saved: '', stacked: false, view: { caret: 0, scroll: null } },
      { id: 'c', path: null, title: 'C', content: '', saved: '', stacked: true, view: { caret: 0, scroll: null } }
    ]
  }).documents.map((document) => document.id),
  ['a', 'c']
);
check(
  'and a file that held one is tidied as it is read',
  parseSession(
    JSON.stringify({
      version: SESSION_VERSION,
      current: 'a',
      documents: [
        { id: 'a', path: null, title: 'A', content: '', saved: '', stacked: false, view: { caret: 0, scroll: null } },
        { id: 'b', path: null, title: 'B', content: '', saved: '', stacked: false, view: { caret: 0, scroll: null } }
      ]
    })
  ).documents.map((document) => document.id),
  ['a']
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('document session: all checks passed');
