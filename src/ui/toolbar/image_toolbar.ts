import { runCommand } from '../markdown/commands/registry';
import { TOOL_ICON_SIZE, Toolbar } from './toolbar';

const IMAGE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 16 16">' +
  '<path d="M0 0h16v16H0z" fill="none" />' +
  '<g fill="currentColor">' +
  '<path d="M6.002 5.5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0" />' +
  '<path d="M2.002 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2zm12 1a1 1 0 0 1 1 1v6.5l-3.777-1.947a.5.5 0 0 0-.577.093l-3.71 3.71l-2.66-1.772a.5.5 0 0 0-.63.062L1.002 12V3a1 1 0 0 1 1-1z" />' +
  '</g>' +
  '</svg>';

/**
 * The image button at the titlebar's centre, beside the link button it is the sibling of: pressing
 * it runs `edit:insertImage`, which reads the clipboard and either writes a destination it is
 * offered or asks about an image it is holding (`ui/image/image_flow.ts`).
 *
 * Like every tool button it must not start a window drag and must not take focus — the caret the
 * command writes at lives in the document, and a focused button would take it away.
 */
export class ImageToolbar extends Toolbar {
  constructor() {
    super();
    this.addButton({ label: 'Image', icon: IMAGE_ICON, className: TOOL_ICON_SIZE }, () => {
      runCommand('edit:insertImage');
    });
  }
}
