/**
 * The app's events: every name something emits or listens for, and the payload it carries.
 *
 * Two kinds arrive on the same bus (`event_manager.ts`, over Tauri's own events):
 *
 * - **the app's own**, emitted by the frontend — the workspace changed, a version was read, the
 *   editor was typed in — whose names are constants in the module that emits them, so a listener
 *   imports the name rather than repeating it;
 * - **the native menu's**, emitted from Rust (`src-tauri/src/menu.rs`, `settings.rs`) as plain
 *   strings, because a menu exists before any page does.
 *
 * Both are declared here, because that is what makes the bus typed: `eventManager.emit(name,
 * payload)` and `on(name, callback)` take a name from this map and the payload that goes with it,
 * so a listener's payload is checked and a constant that drifts from its name fails to compile. The
 * menu's strings cannot be checked by the compiler — the emitter is Rust — so
 * `test/checks/check-events.mjs` reads the Rust side and fails on a name this map does not have.
 *
 * May import: the payload types, as types only. Upholds: one home for which events exist and what
 * they carry, so the two sides of one event cannot disagree about its shape.
 */

import type { Hint } from './hints';
import type { Message } from './messages';
import type { SessionState } from './session_rules';

/** One event's payload. `null` is "the event *is* the news". */
export interface AppEvents {
  // The app's own events.
  /** The workspace this window is now on, or null when it has none. */
  workspace_changed: string | null;
  /** The session changed: a document opened, moved in the stack, or was saved. */
  document_session_changed: SessionState;
  /** A document was opened into the app (the probes' own seam: `test/probes/lib.js: load`). */
  document_opened: string;
  /** A version list was read: the reading, which no listener reads — the news is the event. */
  versions_changed: unknown;
  /** A failure the app cannot do anything about. */
  message: Message;
  /** Something the reader only has to notice. */
  hint: Hint;
  /** The editor's text, on every change. */
  markdown_content_changed: string;
  /** Which layout the editor is drawn in now. */
  editor_layout_changed: 'page' | 'auto';
  /** The editor's document was edited (a keystroke, a command, an undo). */
  editor_edited: null;
  /** The bibliography was reloaded, so anything showing a citation must render again. */
  citation_updated: null;

  // The native menu's events (`src-tauri/src/menu.rs`, `settings.rs`).
  setting: null;
  config_changed: null;
  citation_config_changed: null;
  new_markdown: null;
  open_file: string;
  open_folder: string;
  save: null;
  save_as: null;
  version_save: null;
  undo: null;
  redo: null;
  cut: null;
  select_all: null;
  find: null;
  replace: null;
  export: null;
  documentation: null;
  report_issue: null;
  check_for_updates: null;
}

/** One event's name. */
export type AppEventName = keyof AppEvents;
