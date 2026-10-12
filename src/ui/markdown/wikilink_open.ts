/**
 * Asking the app to open the document a wikilink names.
 *
 * A wikilink's rendering holds none of the characters it was made from, so a click on one cannot
 * say what document it names: the node that does know writes the target on its own element
 * (`nodes/wikilink.ts`) and the click router reads it back (`click_routing.ts: routeWikilinkClick`).
 * What the app then does with that target — resolve it in the workspace, read the file, hand it to
 * the session, which decides what becomes of the document on screen — is the shell's business and
 * not the editor's. The session *owns* the editor (`main.ts: documentSession.attach(editor)`), so
 * an editor module that imported it would be asking its own owner; this is the port the shell sets
 * instead, the same shape and the same reason as `source_mode.ts: setSourceEntryHandler`.
 *
 * May import: nothing. Upholds: the editor asks and the shell answers — no module under this one
 * reaches the app, and a window whose shell has set no handler opens nothing at all.
 */

/** What the shell does with a target: open the document it names, or say there is none. */
export type WikilinkOpenHandler = (target: string) => void;

let handler: WikilinkOpenHandler | null = null;

/** Hands in this window's answer — what opening a wikilink target means here. */
export function setWikilinkOpenHandler(next: WikilinkOpenHandler | null): void {
  handler = next;
}

/** Asks for the document a wikilink names. A window with no handler opens nothing, quietly. */
export function openWikilinkTarget(target: string): void {
  handler?.(target);
}
