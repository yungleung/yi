import { BaseComponent } from '../component';
import { eventManager } from '../../services/event_manager';

/** Formatting commands emitted by the toolbar (the editor subscribes later). */
export const FORMATTING_COMMAND = 'formatting_command';

/** The inline styles the toolbar can apply to a selection. */
export type FormattingStyle = 'bold' | 'italic' | 'strikethrough' | 'inlineCode';

interface FormattingButtonSpec {
  style: FormattingStyle;
  label: string;
  /** The inline SVG icon (fills with the button's text color). */
  icon: string;
}

const FORMATTING_BUTTONS: FormattingButtonSpec[] = [
  {
    style: 'bold',
    label: 'Bold',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="0.92em" height="1em" viewBox="0 0 1408 1536">' +
      '<path d="M0 0h1408v1536H0z" fill="none" />' +
      '<path fill="currentColor" d="M555 1393q74 32 140 32q376 0 376-335q0-114-41-180q-27-44-61.5-74T901 789.5t-80.5-25t-84-10.5t-94.5-2q-73 0-101 10q0 53-.5 159t-.5 158q0 8-1 67.5t-.5 96.5t4.5 83.5t12 66.5m-14-746q42 7 109 7q82 0 143-13t110-44.5t74.5-89.5t25.5-142q0-70-29-122.5t-79-82T787 117t-124-14q-50 0-130 13q0 50 4 151t4 152q0 27-.5 80t-.5 79q0 46 1 69M0 1536l2-94q15-4 85-16t106-27q7-12 12.5-27t8.5-33.5t5.5-32.5t3-37.5t.5-34V1169q0-982-22-1025q-4-8-22-14.5t-44.5-11t-49.5-7t-48.5-4.5T6 104L2 21q98-2 340-11.5T715 0q23 0 68 .5t68 .5q70 0 136.5 13T1116 56t108 71t74 104.5t28 137.5q0 52-16.5 95.5t-39 72T1206 594t-73 45t-84 40q154 35 256.5 134t102.5 248q0 100-35 179.5t-93.5 130.5t-138 85.5T978 1505t-176 14q-44 0-132-3t-132-3q-106 0-307 11T0 1536" />' +
      '</svg>'
  },
  {
    style: 'italic',
    label: 'Italic',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 1024 1536">' +
      '<path d="M0 0h1024v1536H0z" fill="none" />' +
      '<path fill="currentColor" d="m0 1534l17-85q22-7 61.5-16.5t72-19T210 1390q28-35 41-101q1-7 62-289t114-543.5T479 160v-25q-24-13-54.5-18.5t-69.5-8t-58-5.5L316 0q33 2 120 6.5t149.5 7T706 16q48 0 98.5-2.5t121-7T1024 0q-5 39-19 89q-30 10-101.5 28.5T795 151q-8 19-14 42.5t-9 40t-7.5 45.5t-6.5 42q-27 148-87.5 419.5T593 1096q-2 9-13 58t-20 90t-16 83.5t-6 57.5l1 18q17 4 185 31q-3 44-16 99q-11 0-32.5 1.5T643 1536q-29 0-87-10t-86-10q-138-2-206-2q-51 0-143 9T0 1534" />' +
      '</svg>'
  },
  {
    style: 'strikethrough',
    label: 'Strikethrough',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="1.17em" height="1em" viewBox="0 0 1792 1536">' +
      '<path d="M0 0h1792v1536H0z" fill="none" />' +
      '<path fill="currentColor" d="M1760 768q14 0 23 9t9 23v64q0 14-9 23t-23 9H32q-14 0-23-9t-9-23v-64q0-14 9-23t23-9zM483 704q-28-35-51-80q-48-98-48-188q0-181 134-309Q651 0 911 0q50 0 167 19q66 12 177 48q10 38 21 118q14 123 14 183q0 18-5 45l-12 3l-84-6l-14-2q-50-149-103-205q-88-91-210-91q-114 0-182 59q-67 58-67 146q0 73 66 140t279 129q69 20 173 66q58 28 95 52zm507 256h411q7 39 7 92q0 111-41 212q-23 56-71 104q-37 35-109 81q-80 48-153 66q-80 21-203 21q-114 0-195-23l-140-40q-57-16-72-28q-8-8-8-22v-13q0-108-2-156q-1-30 0-68l2-37v-44l102-2q15 34 30 71t22.5 56t12.5 27q35 57 80 94q43 36 105 57q59 22 132 22q64 0 139-27q77-26 122-86q47-61 47-129q0-84-81-157q-34-29-137-71" />' +
      '</svg>'
  },
  {
    style: 'inlineCode',
    label: 'Inline code',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">' +
      '<path d="M0 0h24v24H0z" fill="none" />' +
      '<path fill="currentColor" d="M8.7 15.9L4.8 12l3.9-3.9a.984.984 0 0 0 0-1.4a.984.984 0 0 0-1.4 0l-4.59 4.59a.996.996 0 0 0 0 1.41l4.59 4.6c.39.39 1.01.39 1.4 0a.984.984 0 0 0 0-1.4m6.6 0l3.9-3.9l-3.9-3.9a.984.984 0 0 1 0-1.4a.984.984 0 0 1 1.4 0l4.59 4.59c.39.39.39 1.02 0 1.41l-4.59 4.6a.984.984 0 0 1-1.4 0a.984.984 0 0 1 0-1.4" />' +
      '</svg>'
  }
];

/**
 * The formatting toolbar shown at the center of the titlebar: Bold, Italic
 * and Strikethrough. This is the entry point for editing — each button emits
 * a {@link FORMATTING_COMMAND} event that the markdown editor will apply to
 * the current selection.
 */
export class FormattingToolbar extends BaseComponent {
  constructor() {
    super('div', ['flex', 'items-center', 'gap-1']);
    for (const spec of FORMATTING_BUTTONS) {
      this.element.appendChild(this.createButton(spec));
    }
  }

  private createButton(spec: FormattingButtonSpec): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'btn btn-ghost btn-xs';
    button.title = spec.label;
    button.setAttribute('aria-label', spec.label);
    button.innerHTML = spec.icon;

    // Interactive controls must not start a titlebar window drag, and must
    // not take focus (which would clear the editor's selection).
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener('click', () => {
      void eventManager.emit(FORMATTING_COMMAND, { style: spec.style });
    });
    return button;
  }
}
