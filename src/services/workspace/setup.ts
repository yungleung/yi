/**
 * Whether the app asks the reader where their workspace is, and what the one it makes for them is
 * called.
 *
 * A fresh install has no workspace, and the app is the one that knows it: two facts of the config
 * answer the question — whether a workspace is set, and whether the reader has already been asked —
 * and both are passed in, so the rule is held in Node rather than inferred from the app's start-up
 * path.
 *
 * May import: nothing. Upholds: one answer to "does this install need asking", so the start-up path
 * and the check beside this file cannot disagree.
 */

/** The name a workspace made for the reader has, under their documents folder. */
export const DEFAULT_WORKSPACE_NAME = 'Yi';

/** What the rule needs of the config, and nothing else. */
export interface SetupFacts {
  workspace: string | null;
  workspace_asked: boolean;
}

/**
 * Whether the app should ask: a reader with no workspace, who has not been asked before. A
 * cancelled question leaves `workspace_asked` false, so saying "not now" is not remembered as
 * "never" — the next start asks again.
 */
export function needsWorkspaceQuestion(facts: SetupFacts): boolean {
  return !facts.workspace && !facts.workspace_asked;
}
