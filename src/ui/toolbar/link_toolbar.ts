import { runCommand } from '../markdown/commands/registry';
import { TOOL_ICON_SIZE, Toolbar } from './toolbar';

const LINK_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1.25em" height="1em" viewBox="0 0 640 512">' +
  '<path d="M0 0h640v512H0z" fill="none" />' +
  '<path fill="currentColor" d="M579.8 267.7c56.5-56.5 56.5-148 0-204.5c-50-50-128.8-56.5-186.3-15.4l-1.6 1.1c-14.4 10.3-17.7 30.3-7.4 44.6s30.3 17.7 44.6 7.4l1.6-1.1c32.1-22.9 76-19.3 103.8 8.6c31.5 31.5 31.5 82.5 0 114L422.3 334.8c-31.5 31.5-82.5 31.5-114 0c-27.9-27.9-31.5-71.8-8.6-103.8l1.1-1.6c10.3-14.4 6.9-34.4-7.4-44.6s-34.4-6.9-44.6 7.4l-1.1 1.6C206.5 251.2 213 330 263 380c56.5 56.5 148 56.5 204.5 0zM60.2 244.3c-56.5 56.5-56.5 148 0 204.5c50 50 128.8 56.5 186.3 15.4l1.6-1.1c14.4-10.3 17.7-30.3 7.4-44.6s-30.3-17.7-44.6-7.4l-1.6 1.1c-32.1 22.9-76 19.3-103.8-8.6C74 372 74 321 105.5 289.5l112.2-112.3c31.5-31.5 82.5-31.5 114 0c27.9 27.9 31.5 71.8 8.6 103.9l-1.1 1.6c-10.3 14.4-6.9 34.4 7.4 44.6s34.4 6.9 44.6-7.4l1.1-1.6C433.5 260.8 427 182 377 132c-56.5-56.5-148-56.5-204.5 0z" />' +
  '</svg>';

/**
 * The link button at the titlebar's centre, beside the inline styles it is not one
 * of: pressing it runs `edit:insertLink`, which writes `[title](destination)` where
 * the caret is (or around the selection, which becomes the title) and fills the
 * destination from the clipboard when the clipboard holds a URL.
 *
 * Like every tool button it must not start a window drag and must not take focus —
 * the caret the command writes at lives in the document, and a focused button would
 * take it away.
 */
export class LinkToolbar extends Toolbar {
  constructor() {
    super();
    this.addButton({ label: 'Link', icon: LINK_ICON, className: TOOL_ICON_SIZE }, () => {
      runCommand('edit:insertLink');
    });
  }
}
