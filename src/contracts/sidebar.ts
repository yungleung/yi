/**
 * Cross-layer contracts for the sidebar's selected view and visibility.
 *
 * Example: navigation loads `contents` into the shell and announces
 * `{ view: 'contents', visible: true }`; both sidebar controls read that same neutral shape.
 *
 * May import: nothing. Upholds: the sidebar vocabulary has one home shared by the shell, status
 * control and typed event contract without any of them importing another implementation.
 */

/** The one view the sidebar shell currently has loaded. */
export type SidebarViewName = 'workspace' | 'contents';

/** The sidebar's selected view and whether its shell is open. */
export interface SidebarState {
  readonly view: SidebarViewName;
  readonly visible: boolean;
}
