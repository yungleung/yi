import { unified } from 'unified';
import remarkDeflist from 'remark-deflist';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import type { Root, RootContent } from 'mdast';
import { remarkCitation } from './plugins/remark-citation';
import { remarkWikilink } from './plugins/remark-wikilink';

const parseProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkDeflist)
  .use(remarkMath)
  .use(remarkFrontmatter, ['yaml', 'toml'])
  .use(remarkCitation)
  .use(remarkWikilink);

const stringifyProcessor = unified()
  .use(remarkStringify as any, {
    fences: true,
    bullet: '-',
    incrementListMarker: false,
    closeAtx: true,
    listItemIndent: 'one',
    handlers: {
      descriptionlist(node: any, _parent: any, state: any, info: any): string {
        return state.containerFlow(node, info);
      },
      descriptionterm(node: any, _parent: any, state: any, info: any): string {
        return state.containerPhrasing(node, info);
      },
      descriptiondetails(node: any, _parent: any, state: any, info: any): string {
        return `: ${state.containerPhrasing(node, info)}`;
      }
    }
  })
  .use(remarkGfm)
  .use(remarkDeflist)
  .use(remarkMath)
  .use(remarkFrontmatter, ['yaml', 'toml'])
  .use(remarkCitation)
  .use(remarkWikilink);

export function parseMarkdown(markdown: string): Root {
  const tree = parseProcessor.parse(markdown) as Root;
  return parseProcessor.runSync(tree) as Root;
}

function sanitizeNode(node: any): any {
  if (!node || typeof node !== 'object') {
    return node;
  }

  if (Array.isArray(node.children)) {
    return {
      ...node,
      children: node.children.map((child: any) => sanitizeNode(child))
    };
  }

  return node;
}

export function serializeMarkdown(tree: Root | RootContent[]): string {
  const sanitizedTree = Array.isArray(tree)
    ? { type: 'root', children: tree.map((node) => sanitizeNode(node)) } as Root
    : sanitizeNode(tree);

  return String(stringifyProcessor.stringify(sanitizedTree));
}
