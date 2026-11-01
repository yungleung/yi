/**
 * Portable picture destinations for a LaTeX source export.
 *
 * The editor resolves a note's picture to a real file so Pandoc can read it. A LaTeX source folder
 * cannot keep that absolute path: a readable relative destination keeps its source-tree path and
 * the note-local file is copied there; an absolute or unsafe one is copied under a generated bundle
 * beside the `.tex`.
 *
 * May import: the wire shape `NoteAsset` from `api/export.ts`. Upholds: the exported `.tex` names
 * only relative picture files, and each picture outside the selected package appears once in the
 * exported source tree.
 */

import type { NoteAsset } from '../../../api/export';

export interface LatexImagePlan {
  path: string;
  asset: NoteAsset | null;
}

interface LatexImageOptions {
  destination: string;
  resolved: string;
  outputPath: string;
  packageRoot: string | null;
  packageAssets?: readonly string[];
  /** Resolved source path → target already assigned in this export. */
  targets: Map<string, string>;
}

export function portableLatexImage({
  destination,
  resolved,
  outputPath,
  packageRoot,
  packageAssets = [],
  targets
}: LatexImageOptions): LatexImagePlan {
  const packagePath = packageRoot === null ? null : relativeInside(packageRoot, resolved);
  if (packagePath !== null) {
    return { path: packagePath, asset: null };
  }
  const known = targets.get(resolved);
  if (known !== undefined) {
    return { path: known, asset: null };
  }
  const written = portableDestination(destination);
  const stem = fileStem(outputPath);
  const bundle = `${stem}.assets`;
  const wanted = written ?? basename(resolved);
  const candidate =
    written !== null && imageExtension(written) && packageAssets.includes(written)
      ? written
      : `${bundle}/${wanted}`;
  const target = uniqueTarget(candidate, new Set(targets.values()));
  targets.set(resolved, target);
  return { path: target, asset: { source: resolved, target } };
}

function relativeInside(root: string, file: string): string | null {
  const normalizedRoot = normalize(root).replace(/\/+$/, '');
  const normalizedFile = normalize(file);
  const comparableRoot = normalizedRoot.toLowerCase();
  const comparableFile = normalizedFile.toLowerCase();
  if (!comparableFile.startsWith(`${comparableRoot}/`)) {
    return null;
  }
  return normalizedFile.slice(normalizedRoot.length + 1);
}

function portableDestination(destination: string): string | null {
  const path = normalize(destination).trim();
  if (
    path === '' ||
    path.startsWith('/') ||
    path.includes(':') ||
    path.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    return null;
  }
  return path;
}

function imageExtension(path: string): boolean {
  return /\.(?:avif|gif|jpe?g|pdf|png|svg|tiff?|webp)$/i.test(path);
}

function uniqueTarget(candidate: string, used: Set<string>): string {
  if (!used.has(candidate)) {
    return candidate;
  }
  const slash = candidate.lastIndexOf('/');
  const folder = slash < 0 ? '' : candidate.slice(0, slash + 1);
  const name = slash < 0 ? candidate : candidate.slice(slash + 1);
  const dot = name.lastIndexOf('.');
  const stem = dot <= 0 ? name : name.slice(0, dot);
  const extension = dot <= 0 ? '' : name.slice(dot);
  let index = 2;
  while (used.has(`${folder}${index}-${stem}${extension}`)) {
    index += 1;
  }
  return `${folder}${index}-${stem}${extension}`;
}

function fileStem(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? name || 'note' : name.slice(0, dot);
}

function basename(path: string): string {
  const parts = normalize(path).split('/').filter(Boolean);
  return parts[parts.length - 1] ?? 'image';
}

function normalize(path: string): string {
  return path.replace(/\\/g, '/');
}
