/**
 * Built-in presentation metadata offered when creating a note.
 *
 * May import: nothing. Upholds: presentation starters are app data rather than
 * export template packages, and each id names exactly one export kind.
 */

export interface BuiltInNewNoteTemplate {
  id: string;
  kind: 'revealjs' | 'beamer';
  nameKey: 'newNote.template.revealjs' | 'newNote.template.beamer';
}

export const BUILTIN_NOTE_TEMPLATES: readonly BuiltInNewNoteTemplate[] = [
  {
    id: 'builtin:revealjs',
    kind: 'revealjs',
    nameKey: 'newNote.template.revealjs'
  },
  {
    id: 'builtin:beamer',
    kind: 'beamer',
    nameKey: 'newNote.template.beamer'
  }
];

export const BUILT_IN_NOTE_METADATA: Readonly<Record<string, string>> = {
  'builtin:revealjs': [
    'title: Presentation',
    'subtitle:',
    'author:',
    'date:',
    'id:',
    'keywords:',
    '  - untagged',
    'theme: black',
    'transition: slide',
    'slide-level: 2',
    'incremental: false',
    'controls: true',
    'progress: true',
    'history: true'
  ].join('\n'),
  'builtin:beamer': [
    'title: Presentation',
    'subtitle:',
    'author:',
    'date:',
    'id:',
    'keywords:',
    '  - untagged',
    'institute:',
    'theme: default',
    'colortheme: default',
    'fonttheme: default',
    'aspectratio: 169',
    'navigation: horizontal',
    'section-titles: true'
  ].join('\n')
};
