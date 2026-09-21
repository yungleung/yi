/**
 * The find/replace bar: pure UI, no knowledge of the document.
 *
 * State changes (query, replacement, navigation) are reported through the
 * handlers so the search logic stays in `find_controller.ts`.
 *
 * May import: the DOM and `BaseComponent`. Upholds: the bar knows nothing about
 * the document — it reports what the author asked for and the controller does
 * the searching, which is what keeps the search testable without a window.
 */

export interface FindBarHandlers {
  /** The query changed; the controller should recompute the matches. */
  onQueryChanged(): void;
  /** The user asked for the next (or previous) match. */
  onNext(reverse: boolean): void;
  /** The user asked to replace the active match. */
  onReplace(): void;
  /** The user asked to replace every match. */
  onReplaceAll(): void;
  /** The bar was dismissed. */
  onClose(): void;
}

export class FindBar {
  readonly element: HTMLElement;
  private readonly findInput: HTMLInputElement;
  private readonly replaceInput: HTMLInputElement;
  private readonly replaceRow: HTMLElement;
  private readonly replaceActions: HTMLElement;
  private readonly status: HTMLElement;

  constructor(handlers: FindBarHandlers) {
    const bar = document.createElement('div');
    bar.className =
      'absolute right-4 top-2 z-10 hidden items-center gap-1 rounded-md bg-base-200 p-2 shadow-lg';
    bar.dataset.findBar = 'true';

    const findInput = document.createElement('input');
    findInput.className = 'input input-sm input-bordered w-48';
    findInput.placeholder = 'Find in Markdown';
    findInput.addEventListener('input', () => handlers.onQueryChanged());
    findInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handlers.onNext(event.shiftKey);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        handlers.onClose();
      }
    });

    const replaceRow = document.createElement('div');
    replaceRow.className = 'hidden';
    const replaceInput = document.createElement('input');
    replaceInput.className = 'input input-sm input-bordered w-48';
    replaceInput.placeholder = 'Replace with';
    replaceInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handlers.onReplace();
      }
    });
    replaceRow.append(replaceInput);

    const status = document.createElement('span');
    status.className = 'px-1 text-xs opacity-70';
    status.dataset.findStatus = 'true';

    const replaceActions = document.createElement('div');
    replaceActions.className = 'hidden items-center gap-1';
    replaceActions.dataset.findReplaceActions = 'true';
    replaceActions.append(
      button('Replace', () => handlers.onReplace()),
      button('All', () => handlers.onReplaceAll())
    );

    bar.append(
      findInput,
      replaceRow,
      status,
      button('Prev', () => handlers.onNext(true)),
      button('Next', () => handlers.onNext(false)),
      replaceActions,
      closeButton(() => handlers.onClose())
    );

    this.element = bar;
    this.findInput = findInput;
    this.replaceInput = replaceInput;
    this.replaceRow = replaceRow;
    this.replaceActions = replaceActions;
    this.status = status;
  }

  /** Shows the bar (optionally with the replace row) and focuses the query. */
  open(showReplace: boolean): void {
    this.element.classList.remove('hidden');
    this.element.classList.add('flex');
    this.replaceRow.classList.toggle('hidden', !showReplace);
    this.replaceActions.classList.toggle('hidden', !showReplace);
    this.replaceActions.classList.toggle('flex', showReplace);
    this.findInput.focus();
    this.findInput.select();
  }

  /** Hides the bar and forgets its query. */
  close(): void {
    this.element.classList.add('hidden');
    this.element.classList.remove('flex');
    this.findInput.value = '';
    this.replaceInput.value = '';
    this.setStatus('');
  }

  get query(): string {
    return this.findInput.value;
  }

  get replacement(): string {
    return this.replaceInput.value;
  }

  /** Updates the match counter (`3 of 12`). */
  setStatus(text: string): void {
    this.status.textContent = text;
  }
}

/** A small ghost button used inside the bar. */
function button(label: string, action: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.className = 'btn btn-ghost btn-xs';
  element.type = 'button';
  element.textContent = label;
  element.addEventListener('click', action);
  return element;
}

/** The bar's close control. */
function closeButton(action: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.className = 'btn btn-ghost btn-xs';
  element.type = 'button';
  element.title = 'Close';
  element.setAttribute('aria-label', 'Close find bar');
  element.textContent = '✕';
  element.addEventListener('click', action);
  return element;
}
