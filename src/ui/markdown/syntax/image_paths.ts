/**
 * Reads an image whose path has spaces in it.
 *
 * A markdown link destination may not contain a space unless it is wrapped in `<…>` — which is
 * why the app *writes* one that way (`link_edits.ts`) — so a line another editor wrote as
 * `![shot](my shot.png)` is a paragraph of that literal text: no image, no path, and nothing of
 * the picture the reader asked for. A reader writing a path means the file it names, and that
 * file is what stands between the parentheses.
 *
 * So a run like that is read as the image it names, wherever it stands, and the characters around
 * it stay the text they were: the `)` ends the path, so nothing there has to be guessed. What is
 * *not* read is a run whose characters are not the document's own — `\![a](b c.png)`, where the
 * author escaped it to mean exactly those characters, and text holding an entity, whose offsets
 * this repair could not split exactly.
 *
 * Measured over the imported library that asked for this: 66 image lines, 35 of them with a space
 * in the path, and 24 of those sharing their paragraph with the prose after them — which is why the
 * reading is not limited to a line of its own.
 *
 * May import: the parse (mdast types). Upholds: one fact about markdown syntax has one home — this
 * is the reading of an image path that markdown itself refuses to read.
 */

import type { Root } from 'mdast';

/** A node with the position and children this repair needs, as the tree is walked. */
interface Container {
  type?: string;
  value?: string;
  children?: Container[];
  position?: { start: Point; end: Point };
}

/** A position inside the parsed markdown. */
interface Point {
  offset: number;
  line: number;
  column: number;
}

/** An image run, with a path's spaces allowed: `![alt](my shot.png)`. */
const IMAGE_RUN = /!\[([^\]]*)\]\(([^()<>]*)\)/g;

/** Reads every image markdown refused, wherever the run stands. */
export function restoreImagePaths(root: Root, markdown: string): void {
  repairContainer(root as unknown as Container, markdown);
}

/** Bottom-up: repair a container once its own children are repaired. */
function repairContainer(container: Container, markdown: string): void {
  const children = container.children;
  if (!children) {
    return;
  }
  for (const child of children) {
    repairContainer(child, markdown);
  }
  for (let index = 0; index < children.length; index += 1) {
    const parts = partsOf(markdown, children[index]);
    if (parts) {
      children.splice(index, 1, ...parts);
    }
  }
}

/**
 * The text and image nodes a text node becomes, or null when there is no such image in it: each
 * run read, and the characters between them kept as text.
 */
function partsOf(markdown: string, node: Container): Container[] | null {
  const position = node.position;
  if (node.type !== 'text' || !position || typeof node.value !== 'string' || node.children) {
    return null;
  }
  const start = Math.max(0, Math.min(position.start.offset, markdown.length));
  const end = Math.max(start, Math.min(position.end.offset, markdown.length));
  const source = markdown.slice(start, end);
  // The characters have to be the document's own: anything escaped reads as different text, and
  // the offsets this repair splits by would no longer line up with it.
  if (source !== node.value || !source.includes('![')) {
    return null;
  }
  const parts: Container[] = [];
  let cursor = 0;
  for (const match of source.matchAll(IMAGE_RUN)) {
    // The space is what markdown refused: without one the run was already an image, and this
    // repair has no business reading it.
    if (!match[2].includes(' ')) {
      continue;
    }
    const from = match.index;
    const to = from + match[0].length;
    if (from > cursor) {
      parts.push(textAt(source.slice(cursor, from), start + cursor, start + from, position));
    }
    const { url, title } = splitDestination(match[2]);
    parts.push({
      type: 'image',
      url,
      alt: match[1],
      title,
      position: {
        start: { ...position.start, offset: start + from },
        end: { ...position.end, offset: start + to }
      }
    } as Container);
    cursor = to;
  }
  if (parts.length === 0) {
    return null;
  }
  if (cursor < source.length) {
    parts.push(textAt(source.slice(cursor), start + cursor, end, position));
  }
  return parts;
}

/** A text node holding the characters between `from` and `to` of the markdown. */
function textAt(
  value: string,
  from: number,
  to: number,
  position: { start: Point; end: Point }
): Container {
  return {
    type: 'text',
    value,
    position: {
      start: { ...position.start, offset: from },
      end: { ...position.end, offset: to }
    }
  } as Container;
}

/**
 * What stands between the parentheses: the path, and the title when the run ends with a quoted
 * one (`my shot.png "a title"`) — markdown's own reading of a *wrapped* destination, applied to
 * the path a reader wrote by hand.
 */
function splitDestination(inside: string): { url: string; title: string | null } {
  const titled = /^(.*?)\s+(["'])(.*)\2$/.exec(inside);
  return titled
    ? { url: titled[1].trim(), title: titled[3].trim() }
    : { url: inside.trim(), title: null };
}
