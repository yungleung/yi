/**
 * What a node needs from the app to draw itself: the text some of its renderings are not made of.
 *
 * A citation draws a formatted reference, a wikilink draws the title of the document it names, an
 * image draws a URL the page may load — none of which is in the node's own markdown. Those three
 * answers come from the app (`services/bibliography.ts`, `services/document_manager.ts`, the
 * folders the settings name), and this is the port they are handed in through: the editor sets a
 * context before the renderer builds a window of blocks, so the node components stay a pure
 * function of their node and the input they were given, and the render layer imports no service.
 *
 * The context is module-wide for the same reason `source_mode.ts`'s frame is: a node component is
 * built synchronously, deep inside the renderer, and it is the *renderer's pass* — not the node —
 * that knows what the app has to say. The default answers nothing (`null`, no URL), which is what a
 * node built outside a pass gets: a probe of a single component, or a check.
 *
 * May import: nothing. Upholds: the answers a rendering needs are handed to the render, so no node
 * component reaches into the app for them.
 */

/** The app's answers a rendering may need. */
export interface RenderContext {
  /** A citation's formatted reference. `cached` asks for the fast path, which may answer null. */
  citation(source: string, cached: boolean): string | null;
  /** A wikilink target's title, or null when the target is not a document in the workspace. */
  wikilinkTitle(target: string): Promise<string | null>;
  /** The URLs a destination may name, in the order they are tried (possibly none). */
  imageSources(destination: string): string[];
}

/** What a rendering gets when the app has said nothing. */
const nothing: RenderContext = {
  citation: (_source, _cached) => null,
  wikilinkTitle: async (_target) => null,
  imageSources: (_destination) => []
};

let current: RenderContext = nothing;

/** The answers in force right now. */
export function renderContext(): RenderContext {
  return current;
}

/** Runs `build` with `context` in force, and puts the previous one back afterwards. */
export function withRenderContext<T>(context: RenderContext | null, build: () => T): T {
  const previous = current;
  current = context ?? nothing;
  try {
    return build();
  } finally {
    current = previous;
  }
}
