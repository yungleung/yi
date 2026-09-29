import type { ListCommand } from '../markdown/editing/lists';
import { runCommand } from '../markdown/commands/registry';
import { t } from '../../services/i18n';
import { TOOL_ICON_SIZE, Toolbar, type ToolbarButtonSpec } from './toolbar';

interface ListButtonSpec extends ToolbarButtonSpec {
  command: ListCommand;
}

const ICON_PREFIX = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 16 16">';

/**
 * The buttons, built when a toolbar is built rather than when this module loads — see
 * `formatting_toolbar.ts` for why a constant here costs the toolbar its language.
 */
const listButtons = (): ListButtonSpec[] => [
  {
    command: 'ordered',
    label: t('toolbar.orderedList'),
    className: TOOL_ICON_SIZE,
    icon:
      `${ICON_PREFIX}<path d="M0 0h16v16H0z" fill="none" /><g fill="currentColor">` +
      '<path fill-rule="evenodd" d="M5 11.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5" />' +
      '<path d="M1.713 11.865v-.474H2c.217 0 .363-.137.363-.317c0-.185-.158-.31-.361-.31c-.223 0-.367.152-.373.31h-.59c.016-.467.373-.787.986-.787c.588-.002.954.291.957.703a.595.595 0 0 1-.492.594v.033a.615.615 0 0 1 .569.631c.003.533-.502.8-1.051.8c-.656 0-1-.37-1.008-.794h.582c.008.178.186.306.422.309c.254 0 .424-.145.422-.35c-.002-.195-.155-.348-.414-.348h-.3zm-.004-4.699h-.604v-.035c0-.408.295-.844.958-.844c.583 0 .96.326.96.756c0 .389-.257.617-.476.848l-.537.572v.03h1.054V9H1.143v-.395l.957-.99c.138-.142.293-.304.293-.508c0-.18-.147-.32-.342-.32a.33.33 0 0 0-.342.338zM2.564 5h-.635V2.924h-.031l-.598.42v-.567l.629-.443h.635z" />' +
      '</g></svg>'
  },
  {
    command: 'bullet',
    label: t('toolbar.bulletList'),
    className: TOOL_ICON_SIZE,
    icon:
      `${ICON_PREFIX}<path d="M0 0h16v16H0z" fill="none" />` +
      '<path fill="currentColor" fill-rule="evenodd" d="M5 11.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5m-3 1a1 1 0 1 0 0-2a1 1 0 0 0 0 2m0 4a1 1 0 1 0 0-2a1 1 0 0 0 0 2m0 4a1 1 0 1 0 0-2a1 1 0 0 0 0 2" /></svg>'
  },
  {
    command: 'task',
    label: t('toolbar.taskList'),
    className: TOOL_ICON_SIZE,
    icon:
      `${ICON_PREFIX}<path d="M0 0h16v16H0z" fill="none" /><g fill="currentColor">` +
      '<path fill-rule="evenodd" d="M2 2.5a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5V3a.5.5 0 0 0-.5-.5zM3 3H2v1h1z" />' +
      '<path d="M5 3.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5M5.5 7a.5.5 0 0 0 0 1h9a.5.5 0 0 0 0-1zm0 4a.5.5 0 0 0 0 1h9a.5.5 0 0 0 0-1z" />' +
      '<path fill-rule="evenodd" d="M1.5 7a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5H2a.5.5 0 0 1-.5-.5zM2 7h1v1H2zm0 3.5a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5zm1 .5H2v1h1z" />' +
      '</g></svg>'
  },
  {
    command: 'indent',
    label: t('toolbar.indentItem'),
    className: TOOL_ICON_SIZE,
    icon:
      `${ICON_PREFIX}<path d="M0 0h16v16H0z" fill="none" />` +
      '<path fill="currentColor" fill-rule="evenodd" d="M4.5 11.5A.5.5 0 0 1 5 11h10a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5m-2-4A.5.5 0 0 1 3 7h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m-2-4A.5.5 0 0 1 1 3h10a.5.5 0 0 1 0 1H1a.5.5 0 0 1-.5-.5" /></svg>'
  }
];

/**
 * The list tools at the titlebar's centre: ordered, bullet and task lists, and
 * one indent step. Like the formatting buttons, they must not start a window
 * drag and must not take focus from the editor's selection, and each one runs
 * the command named after what it does.
 */
export class ListToolbar extends Toolbar {
  constructor() {
    super();
    this.addButtons(listButtons(), (spec) => {
      runCommand(`list:${spec.command}`);
    });
  }
}
