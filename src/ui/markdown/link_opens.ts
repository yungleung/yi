/**
 * Asking the app to open what a link names.
 *
 * A link's rendering holds none of the characters it was made from, so a click on one cannot say
 * what it names: a wikilink writes its *target* on its own element (`nodes/wikilink.ts`) and the
 * router reads it back, and an ordinary link stands for the `href` it was built with. What the app
 * then does with either — resolve a target through the workspace's index, resolve a path against
 * the note's own folder and the workspace, read the file, hand it to the session, which decides
 * what becomes of the document on screen — is the shell's business and not the editor's. The
 * session *owns* the editor (`main.ts: documentSession.attach(editor)`), so an editor module that
 * imported it would be asking its own owner; this is the port the shell sets instead, the same
 * shape and the same reason as `source_mode.ts: setSourceEntryHandler`.
 *
 * May import: nothing. Upholds: the editor asks and the shell answers — no module under this one
 * reaches the app, and a window whose shell has set no handler opens nothing at all.
 */

/** What the editor asks the app to open: a wikilink's target, or an ordinary link's destination. */
export type OpenRequest =
  | { kind: 'wikilink'; target: string }
  | { kind: 'link'; destination: string };

/** What the shell does with a request: open what it names, or say there is nothing there. */
export type OpenRequestHandler = (request: OpenRequest) => void;

let handler: OpenRequestHandler | null = null;

/** Hands in this window's answer — what opening what a link names means here. */
export function setOpenRequestHandler(next: OpenRequestHandler | null): void {
  handler = next;
}

/** Asks for the document a wikilink names. */
export function openWikilinkTarget(target: string): void {
  handler?.({ kind: 'wikilink', target });
}

/** Asks for the file a link's destination names. */
export function openLinkDestination(destination: string): void {
  handler?.({ kind: 'link', destination });
}
