/**
 * Reads Pandoc attributes from a fenced code block's opening line.
 *
 * The fence body and delimiter rules stay in `markers.ts`; this module only
 * combines them with the shared attribute grammar. A listing is a parsed fence
 * with an explicit ID or a non-empty caption.
 *
 * May import: markers and the Pandoc attribute grammar. Upholds: malformed or
 * non-final attributes remain ordinary fence text and never create a target.
 */

import { attributeBlockAtEnd, type PandocAttributeBlock } from './pandoc_attributes';
import { fenceBody, openingFence } from './markers';

/** The attributes and body boundary a fenced code block exposes to its renderer. */
export interface CodeFenceData {
  id: string | null;
  language: string | null;
  classes: string[];
  attributes: Record<string, string>;
  caption: string | null;
  attribute: PandocAttributeBlock | null;
  /** Block-relative offset of the first body character. */
  bodyStart: number;
}

/** Read one fenced block's opening metadata without deciding whether it is a listing. */
export function codeFenceData(text: string): CodeFenceData {
  const start = fenceBody(text).start;
  const newline = text.indexOf('\n');
  const opening = newline < 0 ? text : text.slice(0, newline);
  const marker = openingFence(opening);
  if (marker === null) {
    return {
      id: null,
      language: null,
      classes: [],
      attributes: {},
      caption: null,
      attribute: null,
      bodyStart: start
    };
  }
  const markerAt = opening.indexOf(marker);
  const infoAt = markerAt + marker.length;
  const info = opening.slice(infoAt);
  const relative = attributeBlockAtEnd(info, info.length, false);
  if (relative === null) {
    return {
      id: null,
      language: bareLanguage(info),
      classes: bareLanguage(info) === null ? [] : [bareLanguage(info) as string],
      attributes: {},
      caption: null,
      attribute: null,
      bodyStart: start
    };
  }
  const before = info.slice(0, relative.separatorFrom).trim();
  if (before !== '' && /\s/.test(before)) {
    return {
      id: null,
      language: bareLanguage(info),
      classes: bareLanguage(info) === null ? [] : [bareLanguage(info) as string],
      attributes: {},
      caption: null,
      attribute: null,
      bodyStart: start
    };
  }
  const bare = before === '' ? null : before;
  const language = bare ?? relative.classes[0] ?? null;
  const caption = relative.attributes.caption?.trim() ?? '';
  const attribute: PandocAttributeBlock = {
    ...relative,
    from: infoAt + relative.from,
    to: infoAt + relative.to,
    separatorFrom: infoAt + relative.separatorFrom
  };
  return {
    id: relative.id,
    language,
    classes: [
      ...(bare === null ? [] : [bare]),
      ...relative.classes
    ],
    attributes: relative.attributes,
    caption: caption === '' ? null : caption,
    attribute,
    bodyStart: start
  };
}

/** The listing data when the fence has an ID or caption, otherwise null. */
export function listingFenceData(text: string): CodeFenceData | null {
  const data = codeFenceData(text);
  return data.id !== null || data.caption !== null ? data : null;
}

/** The first word of a fence info string, when it is a plain language token. */
function bareLanguage(info: string): string | null {
  const value = info.trim();
  if (value === '' || value.startsWith('{')) {
    return null;
  }
  const [first] = value.split(/\s+/);
  return first === '' ? null : first;
}
