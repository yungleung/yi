/**
 * Builds the app-service answers handed to markdown node renderers.
 *
 * Example: a citation node receives the bibliography's formatted reference while
 * a wikilink receives the resolved target title, without either node importing
 * those services.
 *
 * May import: the render context port, document state and shell services.
 * Upholds: services are adapted at the editor boundary; node modules stay
 * render-only.
 */

import { bibliographyManager } from '../../services/bibliography';
import { documentManager } from '../../services/document_manager';
import { imageSourceCandidates } from '../image/image_urls';
import type { MarkdownEditorState } from './document/state';
import {
  equationBlockNumber,
  firstReference,
  referenceLabel
} from './document/reference_index';
import type { RenderContext } from './render_context';

/** Creates the one render context for a live editor state. */
export function createEditorRenderContext(
  state: MarkdownEditorState
): RenderContext {
  return {
    citation: (source, cached) =>
      cached
        ? bibliographyManager.formatCached(source)
        : bibliographyManager.format(source),
    wikilinkTitle: (target) => documentManager.getTitle(target),
    imageSources: (destination) => imageSourceCandidates(destination),
    headingId: (from) =>
      state.headingTargets().find((target) => target.from === from)?.id ?? null,
    referenceText: (id) => {
      const target = firstReference(state.referenceEntries(), id);
      return target
        ? { text: referenceLabel(target), resolved: true }
        : { text: `#${id}`, resolved: false };
    },
    figureLabelAt: (from) => {
      const target = state
        .referenceEntries()
        .find((entry) => entry.kind === 'figure' && entry.from === from);
      return target?.number == null ? null : referenceLabel(target);
    },
    listingLabelAt: (from) => {
      const target = state
        .referenceEntries()
        .find((entry) => entry.kind === 'listing' && entry.from === from);
      return target?.number == null ? null : referenceLabel(target);
    },
    tableLabelAt: (from) => {
      const target = state
        .referenceEntries()
        .find((entry) => entry.kind === 'table' && entry.from === from);
      return target?.number == null ? null : referenceLabel(target);
    },
    listLabelAt: (from) => {
      const target = state
        .referenceEntries()
        .find((entry) => entry.kind === 'list' && entry.from === from);
      return target?.number == null ? null : referenceLabel(target);
    },
    equationNumberAt: (from) => {
      const target = state
        .referenceEntries()
        .find((entry) => entry.kind === 'equation' && entry.from === from);
      return target === undefined ? null : equationBlockNumber(target);
    }
  };
}
