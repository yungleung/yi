/**
 * Measures the Legrand remark marker against its heading in a real rendered page.
 *
 * Example: the circled R and "Remark 1.1" should have nearly the same vertical
 * midpoint; a marker sixty pixels above the heading is a visible mismatch.
 *
 * May import: Node file, process and LaTeX/Ghostscript helpers. Upholds: the
 * result comes from rendered pixels, not from the source spelling of a TeX
 * offset.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const TEX = String.raw`\documentclass[11pt,fleqn]{book}
\usepackage[a4paper,margin=3cm]{geometry}
\usepackage{theorem-styles}
\begin{document}
\chapter{Measurement}
\section{Remarks}
\theoremstyle{legrand-remark}
\newtheorem{Remark}{Remark}[section]
\begin{Remark}
The page should remain legible when the ornamental color is removed.
\end{Remark}
\end{document}
`;

/** The vertical distance between the marker and heading midpoints, in pixels. */
export function remarkMarkerAlignment(styleDirectory) {
  const directory = mkdtempSync(join(tmpdir(), 'yi-remark-geometry-'));
  const source = join(directory, 'remark.tex');
  const pdf = join(directory, 'remark.pdf');
  const page = join(directory, 'remark.ppm');
  try {
    writeFileSync(source, TEX);
    const compiled = spawnSync(
      'pdflatex',
      ['-interaction=nonstopmode', '-halt-on-error', source],
      {
        cwd: directory,
        encoding: 'utf8',
        env: {
          ...process.env,
          TEXINPUTS: `.${delimiter}${styleDirectory}${delimiter}`
        }
      }
    );
    if (compiled.error?.code === 'ENOENT') {
      return { skipped: true, reason: 'pdflatex is absent' };
    }
    if (compiled.status !== 0) {
      return { error: compiled.stderr.trim() || compiled.stdout.trim() };
    }
    const rendered = spawnSync(
      'gs',
      [
        '-q',
        '-dNOPAUSE',
        '-dBATCH',
        '-sDEVICE=ppmraw',
        '-r216',
        '-dFirstPage=1',
        '-dLastPage=1',
        `-sOutputFile=${page}`,
        pdf
      ],
      { encoding: 'utf8' }
    );
    if (rendered.error?.code === 'ENOENT') {
      return { skipped: true, reason: 'Ghostscript is absent' };
    }
    if (rendered.status !== 0) {
      return { error: rendered.stderr.trim() };
    }
    const { width, pixels } = readPpm(page);
    const marker = orangeBounds(width, pixels, 0, 350);
    const heading = orangeBounds(width, pixels, 350, 700);
    if (marker === null || heading === null) {
      return { error: 'the rendered marker or heading was not found' };
    }
    return {
      markerCenterY: (marker.minY + marker.maxY) / 2,
      headingCenterY: (heading.minY + heading.maxY) / 2,
      distance: Math.abs((marker.minY + marker.maxY - heading.minY - heading.maxY) / 2)
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function readPpm(path) {
  const bytes = readFileSync(path);
  const tokens = [];
  let at = 0;
  while (tokens.length < 4) {
    while (isWhitespace(bytes[at])) at += 1;
    if (bytes[at] === 0x23) {
      while (at < bytes.length && bytes[at] !== 0x0a) at += 1;
      continue;
    }
    const start = at;
    while (at < bytes.length && !isWhitespace(bytes[at])) at += 1;
    tokens.push(new TextDecoder().decode(bytes.subarray(start, at)));
  }
  while (isWhitespace(bytes[at])) at += 1;
  return {
    width: Number(tokens[1]),
    height: Number(tokens[2]),
    pixels: bytes.subarray(at)
  };
}

function orangeBounds(width, pixels, fromX, toX) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < pixels.length / 3 / width; y += 1) {
    for (let x = fromX; x < toX; x += 1) {
      const index = (y * width + x) * 3;
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      if (
        red < 180 ||
        green < 30 ||
        green >= 240 ||
        blue >= 225 ||
        red <= green * 1.05
      ) {
        continue;
      }
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return minX === Infinity ? null : { minX, maxX, minY, maxY };
}

function isWhitespace(byte) {
  return byte === 0x20 || byte === 0x0a || byte === 0x0d || byte === 0x09;
}
