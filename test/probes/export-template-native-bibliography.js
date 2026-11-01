/**
 * A PRL LaTeX package exports through the app's ordinary citation setting.
 *
 * The package asks for native BibTeX in its defaults. The reader's selected library is filtered to
 * the keys the note cites, and that cited-only bibliography is written beside the generated `.tex`
 * with the figure and REVTeX bibliography style.
 */
(async () => {
  const t = window.__t;
  const api = await t.app('/src/api/templates.ts');
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session/index.ts');
  const { configManager } = await t.app('/src/services/config_manager.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const checkout = window.__probePaths.checkout;
  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folderName = `yi-probe-native-bibliography-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const notePath = `${folder}/paper.md`;
  const targetFolder = `${folder}/source`;
  const target = `${targetFolder}/paper.tex`;
  const jsonNotePath = `${folder}/json-paper.md`;
  const jsonTargetFolder = `${folder}/json-source`;
  const jsonTarget = `${jsonTargetFolder}/json-paper.tex`;
  const jsonLibrary = `${folder}/library.json`;
  const library = `${checkout}examples/templates/latex/references.bib`;
  const before = await invoke('get_config');
  let templateId = null;
  const readText = async (path) => {
    const bytes = await invoke('plugin:fs|read_text_file', { path });
    return new TextDecoder().decode(bytes instanceof ArrayBuffer ? bytes : Uint8Array.from(bytes));
  };
  const exists = async (path) => {
    try {
      return await invoke('plugin:fs|exists', { path });
    } catch {
      return false;
    }
  };
  const readBytes = async (path) => {
    const bytes = await invoke('plugin:fs|read_file', { path });
    return bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : Uint8Array.from(bytes);
  };
  const writeBytes = async (path, bytes) =>
    await window.__TAURI_INTERNALS__.invoke('plugin:fs|write_file', bytes, {
      headers: { path: encodeURIComponent(path) }
    });
  const until = async (ready, tries = 120) => {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      if (await ready()) return true;
      await t.sleep(100);
    }
    return false;
  };
  try {
    await files.createEntry(home, folderName, false);
    await files.createEntry(folder, 'source', false);
    await files.createEntry(folder, 'json-source', false);
    await files.createEntry(folder, 'figures', false);
    await files.createEntry(folder, 'paper.md', true);
    await files.createEntry(folder, 'json-paper.md', true);
    const source = await readText(
      `${checkout}examples/templates/latex/example.md`
    );
    await files.writeTextAtomically(notePath, source);
    const templatePicture = await readBytes(
      `${checkout}examples/templates/latex/figures/cmb-spectrum.pdf`
    );
    const noteMarker = new TextEncoder().encode('\n% note-local probe picture\n');
    const notePicture = new Uint8Array(templatePicture.length + noteMarker.length);
    notePicture.set(templatePicture);
    notePicture.set(noteMarker, templatePicture.length);
    await writeBytes(`${folder}/figures/cmb-spectrum.pdf`, notePicture);
    await t.openWorkspace(folder);
    templateId = (
      await api.importTemplate({
        source: `${checkout}examples/templates/latex`,
        name: `Probe native bibliography ${Date.now().toString(36)}`,
        kind: 'latex',
        entry: 'template.tex',
        source_url: null,
        license: 'CC0-1.0',
        map_title: false,
        map_author: false
      })
    ).id;
    await configManager.update({
      bibliography_file: library,
      export_templates: {
        ...(before.export_templates ?? {}),
        latex: templateId
      }
    });
    const pending = session.documentSession.openFile({ path: notePath, content: source });
    await Promise.race([pending, t.sleep(2000)]);
    await t.sleep(250);
    await invoke('plugin:event|emit', { event: 'export', payload: 'latex' });
    const card = () =>
      document.querySelector('[data-export-dialog]') !== null &&
      !document.querySelector('[data-export-dialog]').classList.contains('hidden');
    check('the PRL package opens the LaTeX export card', await until(card), {
      open: card()
    });
    const targetField = document.querySelector('[data-export-target]');
    targetField.value = target;
    document.querySelector('[data-export-run]').click();
    check('the export writes the LaTeX source through the app', await until(() => exists(target)), {
      target,
      exists: await exists(target)
    });
    const tex = await readText(target);
    const bibliographyPath = `${targetFolder}/references.bib`;
    const bibliographyWritten = await until(() => exists(bibliographyPath));
    const bibliography = bibliographyWritten ? await readText(bibliographyPath) : '';
    check(
      'the generated TeX keeps three metadata authors and native citations',
      tex.includes('\\documentclass[') &&
        tex.includes('revtex4-2}') &&
        ['Elena M. Hart', 'Mateo R. Silva', 'Priya N. Rao'].every((name) =>
          tex.includes(`\\author{${name}}`)
        ) &&
        /\\(?:cite|citep)\{penzias1965/.test(tex) &&
        !tex.includes('\\section*{References}') &&
        tex.includes(']{figures/cmb-spectrum.pdf}') &&
        !tex.includes(`${checkout}examples/templates/latex/figures/cmb-spectrum.pdf`)
    );
    check(
      'the selected library is filtered to exactly the cited works',
      bibliographyWritten &&
        ['penzias1965', 'dicke1965', 'mather1994', 'smoot1992', 'fixsen2009', 'planck2020'].every(
          (key) => bibliography.includes(`{${key},`)
        ) &&
        !bibliography.includes('uncited2024'),
      bibliography
    );
    check(
      'the output carries the official source-tree companions',
      (await exists(`${targetFolder}/figures/cmb-spectrum.pdf`)) &&
        (await exists(`${targetFolder}/bibliography/apsrev4-2.bst`)),
      {
        figure: await exists(`${targetFolder}/figures/cmb-spectrum.pdf`),
        bibliography: await exists(`${targetFolder}/bibliography/apsrev4-2.bst`)
      }
    );
    const deliveredPicture = await readBytes(`${targetFolder}/figures/cmb-spectrum.pdf`);
    check(
      'the note picture replaces the template picture in the output',
      deliveredPicture.length === notePicture.length &&
        deliveredPicture.every((byte, index) => byte === notePicture[index]),
      {
        deliveredBytes: deliveredPicture.length,
        noteBytes: notePicture.length,
        templateBytes: templatePicture.length
      }
    );

    const jsonSource = `---
title: JSON bibliography check
author:
  - name: Elena M. Hart
    affiliation: Department of Physics and Astronomy, Northridge University
    email: elena.hart@northridge.example
date: 2026-10-22
abstract: A compact check of CSL-JSON bibliography packaging.
---

# Introduction

The discovery [@penzias1965] and the modern cosmological model [@planck2020] are cited here.
`;
    await files.writeTextAtomically(jsonNotePath, jsonSource);
    await files.writeTextAtomically(
      jsonLibrary,
      JSON.stringify([
        {
          id: 'zotero-penzias',
          'citation-key': 'penzias1965',
          type: 'article-journal',
          title: 'A Measurement of Excess Antenna Temperature at 4080 Mc/s',
          author: [{ family: 'Penzias', given: 'Arno A.' }],
          issued: { 'date-parts': [[1965]] }
        },
        {
          id: 'planck2020',
          type: 'article-journal',
          title: 'Planck 2018 Results. VI. Cosmological Parameters',
          author: [{ literal: 'Planck Collaboration' }],
          issued: { 'date-parts': [[2020]] }
        },
        {
          id: 'uncited2024',
          type: 'article-journal',
          title: 'A Library Entry That Must Not Reach the Output',
          author: [{ family: 'Example', given: 'Uncited' }],
          issued: { 'date-parts': [[2024]] }
        }
      ])
    );
    await configManager.update({ bibliography_file: jsonLibrary });
    await t.sleep(250);
    await session.documentSession.openFile({ path: jsonNotePath, content: jsonSource });
    await t.sleep(250);
    await invoke('plugin:event|emit', { event: 'export', payload: 'latex' });
    check('the JSON bibliography export opens its card', await until(card), {
      open: card()
    });
    document.querySelector('[data-export-target]').value = jsonTarget;
    document.querySelector('[data-export-run]').click();
    const jsonWritten = await until(() => exists(`${jsonTargetFolder}/references.bib`));
    const jsonTex = jsonWritten ? await readText(jsonTarget) : '';
    check(
      'CSL-JSON converts to a cited-only BibTeX file in the source tree',
      jsonWritten &&
        ['penzias1965', 'planck2020'].every((key) =>
          jsonTex.includes(`\\citep{${key}}`)
        ),
      { tex: jsonTex }
    );
    const converted = await readText(`${jsonTargetFolder}/references.bib`);
    check(
      'the JSON conversion uses citation-key first, id second, and omits uncited works',
      converted.includes('@article{penzias1965') &&
        converted.includes('@article{planck2020') &&
        !converted.includes('zotero-penzias') &&
        !converted.includes('uncited2024'),
      converted
    );
  } finally {
    if (templateId !== null) {
      try {
        await api.removeTemplate(templateId);
      } catch {
        // A package a failed import never made.
      }
    }
    try {
      await files.deleteEntry(folder);
    } catch {
      // The folder a failed run never made.
    }
    await invoke('set_config', {
      cfg: { ...before, config_version: await invoke('get_current_config_version') }
    });
    await configManager.load();
  }
  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
