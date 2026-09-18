import { eventManager } from '../../services/event_manager';
import { BaseComponent } from '../component';

/** The footnote button asks the editor for a new footnote at the caret. */
export const FOOTNOTE_COMMAND = 'footnote_command';

const FOOTNOTE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">' +
  '<path d="M0 0h24v24H0z" fill="none" />' +
  '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m2.75 17.248l1.44-3.384m0 0h5.188m-5.187 0l2.208-5.186a.412.412 0 0 1 .771 0l2.208 5.186m0 0l1.441 3.384m2.398-8.838v8.838m5.833-2.916a2.916 2.916 0 1 1-5.833 0a2.916 2.916 0 0 1 5.833 0m0-7.707l2.2-1.375v5.5" />' +
  '</svg>';

/**
 * The footnote button at the titlebar's centre. Like the other tool buttons it
 * must not start a window drag and must not take focus from the editor, which
 * is where the caret it works from lives.
 */
export class FootnoteToolbar extends BaseComponent {
  constructor() {
    super('div', ['flex', 'items-center', 'gap-1']);

    const button = document.createElement('button');
    // The icon is sized in `em`, so the font size is the icon size.
    button.className = 'btn btn-ghost btn-xs text-[1.25em]';
    button.title = 'Footnote';
    button.setAttribute('aria-label', 'Footnote');
    button.innerHTML = FOOTNOTE_ICON;
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener('click', () => {
      void eventManager.emit(FOOTNOTE_COMMAND);
    });
    this.element.appendChild(button);
  }
}
