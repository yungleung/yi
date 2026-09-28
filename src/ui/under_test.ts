/**
 * Whether a probe is driving this page.
 *
 * `test/probes/lib.js` is the only thing that puts `__t` on the window, so this is the whole of
 * the "under test" test — and it has one home because two questions in the app are answered with
 * two hands, one for a reader and one for the harness: the prompt's yes or no (`prompt.ts`) and
 * the new-note card (`new_document/new_document_dialog.ts`). A reader gets the system's own
 * surface, which is modal and unmissable; a probe gets a card in the page, because a native
 * dialog blocks the webview and the harness reaches the app *through* the webview. A caller
 * never chooses a hand by hand — it asks its question and this says who is in the room.
 *
 * May import: nothing. Upholds: one answer to "is a probe driving this page", so a second module
 * cannot decide it differently.
 */

export function drivenByTools(): boolean {
  return typeof (window as { __t?: unknown }).__t === 'object';
}
