/**
 * The app's events: every name something emits or listens for, and the payload it carries.
 *
 * Two kinds arrive on the same bus (`events/manager.ts`, over Tauri's own events):
 *
 * - **the app's own**, emitted by the frontend — the workspace changed, a version was read, the
 *   editor was typed in — whose names are constants in the module that emits them, so a listener
 *   imports the name rather than repeating it;
 * - **the native menu's**, emitted from Rust (`src-tauri/src/menu.rs`, `settings.rs`) as plain
 *   strings, because a menu exists before any page does.
 *
 * Both are declared here, because that is what makes the bus typed: `eventManager.emit(name,
 * payload)` and `on(name, callback)` take a name from this map and the payload that goes with it,
 * so a listener's payload is checked and a constant that drifts from its name fails to compile.
 * The boundary map says whether a name stays in this window or arrives from Rust/Tauri, which keeps
 * local facts synchronous without giving up the native menu. The menu's strings cannot be checked
 * by the compiler, so `test/checks/check-events.mjs` holds the Rust emitters to the inbound side.
 *
 * May import: the payload types, as types only. Upholds: one home for which events exist and what
 * they carry, so the two sides of one event cannot disagree about its shape.
 */

import type { Hint } from '../hints';
import type { Message } from '../messages';
import type { SessionState } from '../session';

/** Why the document's committed text or revision changed. */
export type DocumentChangeReason = 'load' | 'edit' | 'undo' | 'redo';

/** One committed document state, announced after the editor owns the change. */
export interface DocumentChanged {
  readonly documentKey: string;
  readonly previousRevision: number | null;
  readonly revision: number;
  readonly reason: DocumentChangeReason;
  readonly text: string;
}

/** One event's payload. `null` is "the event *is* the news". */
export interface AppEvents {
  // The app's own events.
  /** The workspace this window is now on, or null when it has none. */
  workspace_changed: string | null;
  /** The session changed: a document opened, moved in the stack, or was saved. */
  document_session_changed: SessionState;
  /** A document was opened into the app (the probes' own seam: `test/probes/lib.js: load`). */
  document_opened: string;
  /** The Help menu's *Open Tutorial*. */
  tutorial: null;
  /** A version list was read: the reading, which no listener reads — the news is the event. */
  versions_changed: unknown;
  /** A failure the app cannot do anything about. */
  message: Message;
  /** Something the reader only has to notice. */
  hint: Hint;
  /** The committed document text and revision after a load, edit, undo or redo. */
  document_changed: DocumentChanged;
  /** Which layout the editor is drawn in now. */
  editor_layout_changed: 'page' | 'auto';
  /** The system selected a different keyboard input source. */
  input_source_changed: null;
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
  manage_export_templates: null;
  undo: null;
  redo: null;
  cut: null;
  select_all: null;
  find: null;
  replace: null;
  toggle_stack: null;
  next_stacked: null;
  previous_stacked: null;
  /** The kind the Export submenu's own item names — the event *is* the choice of kind. */
  export: string | null;
  documentation: null;
  report_issue: null;
  check_for_updates: null;
}

/** The one document-change fact emitted by the live editor. */
export const DOCUMENT_CHANGED = 'document_changed' as const;

/** One event's name. */
export type AppEventName = keyof AppEvents;

/** Whether one event stays local or must cross the Tauri boundary into this window. */
export type EventBoundary = 'local' | 'inbound';

/**
 * How each event reaches this window.
 *
 * Example: `editor_layout_changed` is emitted and consumed in the main window,
 * so it is local; `undo` comes from the Rust native menu, so it is inbound.
 */
export const EVENT_BOUNDARIES: Readonly<
  Record<AppEventName, EventBoundary>
> = {
  workspace_changed: 'local',
  document_session_changed: 'local',
  document_opened: 'local',
  tutorial: 'inbound',
  versions_changed: 'local',
  message: 'local',
  hint: 'local',
  document_changed: 'local',
  editor_layout_changed: 'local',
  input_source_changed: 'inbound',
  citation_updated: 'local',
  setting: 'inbound',
  config_changed: 'inbound',
  citation_config_changed: 'inbound',
  new_markdown: 'inbound',
  open_file: 'inbound',
  open_folder: 'inbound',
  save: 'inbound',
  save_as: 'inbound',
  version_save: 'inbound',
  manage_export_templates: 'inbound',
  undo: 'inbound',
  redo: 'inbound',
  cut: 'inbound',
  select_all: 'inbound',
  find: 'inbound',
  replace: 'inbound',
  toggle_stack: 'inbound',
  next_stacked: 'inbound',
  previous_stacked: 'inbound',
  export: 'inbound',
  documentation: 'inbound',
  report_issue: 'inbound',
  check_for_updates: 'inbound'
};

/** Whether one event name arrives through Tauri from outside this window. */
export function isInboundEvent(name: AppEventName): boolean {
  return EVENT_BOUNDARIES[name] === 'inbound';
}
