/**
 * Creates the CodeMirror view used by the export-template code panel.
 *
 * Example: `notes.yaml` gets YAML highlighting and line numbers, while
 * `reference.docx` is created read-only and does not expose the save key.
 *
 * May import: CodeMirror packages and the shared theme tokens. Upholds: every
 * template/default view has the same search, history, indentation and save
 * bindings; this module owns no file state or persistence.
 */

import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, StreamLanguage } from '@codemirror/language';
import { yaml } from '@codemirror/legacy-modes/mode/yaml';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers
} from '@codemirror/view';

/** The editor's own colours: the app's daisyUI theme, never a second palette. */
const THEME = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--color-base-100)',
    color: 'var(--color-base-content)',
    fontSize: '0.8125rem'
  },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    lineHeight: '1.55'
  },
  '.cm-content': {
    caretColor: 'var(--color-primary)',
    padding: '0.5rem 0'
  },
  '.cm-gutters': {
    backgroundColor: 'var(--color-base-200)',
    color: 'color-mix(in oklab, var(--color-base-content) 55%, var(--color-base-200))',
    borderRight: '1px solid var(--color-base-300)'
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in oklab, var(--color-base-content) 5%, transparent)'
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'color-mix(in oklab, var(--color-base-content) 8%, transparent)'
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in oklab, var(--color-primary) 28%, transparent)'
  },
  '.cm-searchMatch': {
    backgroundColor: 'color-mix(in oklab, var(--color-warning) 35%, transparent)'
  }
});

export interface TemplateCodeEditorOptions {
  parent: HTMLElement;
  file: string;
  text: string;
  readOnly: boolean;
  onDocumentChanged(): void;
  onSave(): void;
}

export function createTemplateCodeEditor({
  parent,
  file,
  text,
  readOnly,
  onDocumentChanged,
  onSave
}: TemplateCodeEditorOptions): EditorView {
  const language = languageFor(file);
  return new EditorView({
    parent,
    state: EditorState.create({
      doc: text,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        bracketMatching(),
        indentOnInput(),
        highlightSelectionMatches(),
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        ...(language === null ? [] : [language]),
        keymap.of([
          {
            key: 'Mod-s',
            run: () => {
              onSave();
              return true;
            }
          },
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          indentWithTab
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onDocumentChanged();
          }
        }),
        THEME
      ]
    })
  });
}

function languageFor(file: string): ReturnType<typeof StreamLanguage.define> | null {
  const extension = file.split('.').pop()?.toLowerCase() ?? '';
  if (extension === 'yaml' || extension === 'yml') {
    return StreamLanguage.define(yaml);
  }
  if (['tex', 'cls', 'sty', 'bst', 'bbx', 'cbx'].includes(extension)) {
    return StreamLanguage.define(stex);
  }
  return null;
}
