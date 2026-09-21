import { runCommand } from '../markdown/commands/registry';
import { TOOL_ICON_SIZE, Toolbar } from './toolbar';

const FOOTNOTE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">' +
  '<path d="M0 0h24v24H0z" fill="none" />' +
  '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m2.75 17.248l1.44-3.384m0 0h5.188m-5.187 0l2.208-5.186a.412.412 0 0 1 .771 0l2.208 5.186m0 0l1.441 3.384m2.398-8.838v8.838m5.833-2.916a2.916 2.916 0 1 1-5.833 0a2.916 2.916 0 0 1 5.833 0m0-7.707l2.2-1.375v5.5" />' +
  '</svg>';

/**
 * The footnote button at the titlebar's centre. Like the other tool buttons it
 * must not start a window drag and must not take focus from the editor, which
 * is where the caret it works from lives. Pressing it runs the editor's
 * `edit:insertFootnote` command by name.
 */
export class FootnoteToolbar extends Toolbar {
  constructor() {
    super();
    this.addButton({ label: 'Footnote', icon: FOOTNOTE_ICON, className: TOOL_ICON_SIZE }, () => {
      runCommand('edit:insertFootnote');
    });
  }
}
