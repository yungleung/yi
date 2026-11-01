/**
 * Small DOM controls used to compose the export form.
 *
 * Example: `labelledRow(label('Paper'), select('data-export-paper'))` builds one labelled field
 * without giving `ExportForm` a second responsibility for low-level DOM construction.
 *
 * May import: browser DOM APIs only. Upholds: every factory emits the same classes and data
 * selectors that the probes and form behavior already use.
 */

export function formButton(
  name: string,
  labelText: string,
  className: string,
  onClick: (() => void) | null,
  type: 'button' | 'submit' = 'button'
): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = type;
  control.className = className;
  control.textContent = labelText;
  control.setAttribute(`data-${name}`, 'true');
  if (onClick) {
    control.addEventListener('click', onClick);
  }
  return control;
}

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text: string
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  result.className = className;
  result.textContent = text;
  return result;
}

export function label(text: string): HTMLLabelElement {
  return element('label', 'label-text text-xs', text);
}

export function textBlock(text: string, className: string): HTMLSpanElement {
  return element('span', className, text);
}

export function select(dataName: string): HTMLSelectElement {
  const control = document.createElement('select');
  control.className = 'select select-bordered select-sm';
  control.setAttribute(dataName, 'true');
  return control;
}

export function checkbox(dataName: string): HTMLInputElement {
  const control = document.createElement('input');
  control.type = 'checkbox';
  control.className = 'checkbox checkbox-sm';
  control.setAttribute(dataName, 'true');
  return control;
}

export function diagnostic(dataName: string, className: string): HTMLParagraphElement {
  const paragraph = element('p', className, '');
  paragraph.setAttribute(dataName, 'true');
  return paragraph;
}

export function option(text: string, value: string): HTMLOptionElement {
  const control = document.createElement('option');
  control.value = value;
  control.textContent = text;
  return control;
}

export function labelledRow(
  labelElement: HTMLElement,
  control: HTMLElement,
  ...rest: HTMLElement[]
): HTMLElement {
  const group = document.createElement('div');
  group.className = 'flex flex-col gap-1';
  const line = document.createElement('div');
  line.className = 'flex items-center gap-2';
  line.append(control, ...rest);
  group.append(labelElement, line);
  return group;
}

export function rowGroup(...children: HTMLElement[]): HTMLElement {
  const group = document.createElement('div');
  group.className = 'mt-3 flex flex-col gap-1';
  group.append(...children);
  return group;
}

export function buttonRow(...buttons: HTMLButtonElement[]): HTMLElement {
  const row = document.createElement('div');
  row.className = 'flex items-center gap-3';
  row.append(...buttons);
  return row;
}

export function checkboxRow(box: HTMLInputElement, labelText: string): HTMLElement {
  const group = document.createElement('div');
  group.className = 'mt-3 flex items-center gap-2';
  const words = document.createElement('label');
  words.className = 'label-text flex items-center gap-2 text-xs';
  words.append(box, document.createTextNode(labelText));
  group.append(words);
  return group;
}
