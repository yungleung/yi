/**
 * The stable facade over the session's pure rules and plain state model.
 *
 * Example: callers keep importing `openDecision`, `capture`, and `parseSession` from this file;
 * their implementations now live in focused modules with one-way dependencies.
 *
 * May import: the focused session rule modules. Upholds: one public rule surface, while model,
 * opening/stack, edit/view, and serialization rules keep separate reasons to change.
 */

export * from './session_model';
export * from './session_open';
export * from './session_edit';
export * from './session_serialization';
