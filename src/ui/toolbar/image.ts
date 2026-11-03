/**
 * The image button: runs the editor's own insert-image command.
 *
 * May import: the command registry, the catalogue and the toolbar base. Upholds: the button names
 * the command; the clipboard, the card and the file it writes stay with the image flow.
 */

import { runCommand } from '../../commands/runtime';
import { t } from '../../services/i18n';
import { TOOL_ICON_SIZE, Toolbar } from '../toolbar';

const IMAGE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 16 16">' +
  '<path d="M0 0h16v16H0z" fill="none" />' +
  '<g fill="currentColor">' +
  '<path d="M6.002 5.5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0" />' +
  '<path d="M1.5 2A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 14.5 2zm13 1a.5.5 0 0 1 .5.5v6l-3.775-1.947a.5.5 0 0 0-.577.093l-3.71 3.71l-2.66-1.772a.5.5 0 0 0-.63.062L1.002 12v.54L1 12.5v-9a.5.5 0 0 1 .5-.5z" />' +
  '</g>' +
  '</svg>';

/**
 * The image button at the titlebar's centre, beside the link button it is the sibling of: pressing
 * it runs `edit:insertImage`, which reads the clipboard and either writes a destination it is
 * offered or asks about an image it is holding (`ui/image/index.ts`).
 *
 * Like every tool button it must not start a window drag and must not take focus — the caret the
 * command writes at lives in the document, and a focused button would take it away.
 */
export class ImageToolbar extends Toolbar {
  constructor() {
    super();
    this.addButton({ label: t('toolbar.image'), icon: IMAGE_ICON, className: TOOL_ICON_SIZE }, () => {
      runCommand('edit:insertImage', null, 'toolbar');
    });
  }
}
