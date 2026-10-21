/**
 * Builds the dissertation ODT reference document from Pandoc’s own ODT reference file.
 *
 * The generated file keeps every Pandoc style, then adds the cover, abstract, TOC and body master
 * pages, the cover background, underlined metadata lines, A4 geometry and a body page-number reset.
 * Run: node scripts/build-dissertation-odt.mjs
 */

import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = join(root, 'test/fixtures/templates/examples/odt');
const target = join(fixture, 'reference.odt');
const coverSource = join(fixture, 'college-cover.svg');
const cover = join(fixture, 'college-cover.png');
const work = mkdtempSync(join(tmpdir(), 'yi-dissertation-odt-'));
const source = join(work, 'source.odt');
const unpacked = join(work, 'unpacked');

const run = (program, args, options = {}) => {
  const result = spawnSync(program, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    throw new Error(`${program} failed: ${result.stderr || result.stdout}`);
  }
  return result;
};

const replaceStyle = (xml, name, replacement) =>
  xml.replace(
    new RegExp(`<style:style style:name="${name}"[\\s\\S]*?</style:style>`),
    replacement
  );

try {
  const defaults = spawnSync('pandoc', ['--print-default-data-file=reference.odt']);
  if (defaults.status !== 0) {
    throw new Error(`pandoc failed: ${String(defaults.stderr)}`);
  }
  writeFileSync(source, defaults.stdout);
  run('rsvg-convert', ['-w', '1240', '-h', '1754', coverSource, '-o', cover]);
  mkdirSync(unpacked);
  run('unzip', ['-q', source, '-d', unpacked]);

  let styles = readFileSync(join(unpacked, 'styles.xml'), 'utf8');
  styles = replaceStyle(
    styles,
    'Title',
    `<style:style style:name="Title" style:family="paragraph" style:parent-style-name="Heading" style:next-style-name="Subtitle" style:class="chapter" style:master-page-name="DissertationCover">
      <style:paragraph-properties fo:text-align="center" fo:margin-top="2.2cm" fo:margin-bottom="0.35cm" style:contextual-spacing="false"/>
      <style:text-properties fo:font-size="26pt" fo:font-weight="bold" fo:color="#20364a" style:font-size-asian="26pt" style:font-weight-asian="bold" style:font-size-complex="26pt" style:font-weight-complex="bold"/>
    </style:style>`
  );
  styles = replaceStyle(
    styles,
    'Subtitle',
    `<style:style style:name="Subtitle" style:family="paragraph" style:parent-style-name="Heading" style:next-style-name="Author" style:class="chapter">
      <style:paragraph-properties fo:text-align="center" fo:margin-top="0.12cm" fo:margin-bottom="8.3cm" style:contextual-spacing="false"/>
      <style:text-properties fo:font-size="17pt" fo:font-style="italic" fo:color="#536a73" style:font-size-asian="17pt" style:font-style-asian="italic" style:font-size-complex="17pt" style:font-style-complex="italic"/>
    </style:style>`
  );
  styles = replaceStyle(
    styles,
    'Author',
    `<style:style style:name="Author" style:family="paragraph" style:parent-style-name="Standard" style:class="html">
      <style:paragraph-properties fo:text-align="left" fo:margin-left="3.2cm" fo:margin-right="3.2cm" fo:margin-top="0.12cm" fo:margin-bottom="0.45cm" style:contextual-spacing="false"/>
      <style:text-properties fo:font-size="12pt" fo:text-decoration="underline" style:text-underline-style="solid" style:text-underline-type="single" style:text-underline-width="auto" style:text-underline-color="font-color"/>
    </style:style>`
  );
  styles = replaceStyle(
    styles,
    'Date',
    `<style:style style:name="Date" style:family="paragraph" style:parent-style-name="Standard" style:class="html">
      <style:paragraph-properties fo:text-align="left" fo:margin-left="3.2cm" fo:margin-right="3.2cm" fo:margin-top="0.12cm" fo:margin-bottom="0.45cm" style:contextual-spacing="false"/>
      <style:text-properties fo:font-size="12pt" fo:text-decoration="underline" style:text-underline-style="solid" style:text-underline-type="single" style:text-underline-width="auto" style:text-underline-color="font-color"/>
    </style:style>`
  );
  styles = replaceStyle(
    styles,
    'Abstract',
    `<style:style style:name="Abstract" style:family="paragraph" style:parent-style-name="Standard" style:class="html" style:master-page-name="DissertationAbstract">
      <style:paragraph-properties fo:break-before="page" fo:margin-left="2.8cm" fo:margin-right="2.8cm" fo:margin-top="1.2cm" fo:margin-bottom="0.45cm" style:contextual-spacing="false" fo:text-indent="0in" style:auto-text-indent="false" fo:line-height="145%"/>
      <style:text-properties fo:font-size="11.5pt"/>
    </style:style>`
  );
  styles = replaceStyle(
    styles,
    'Horizontal_20_Line',
    `<style:style style:name="Horizontal_20_Line" style:display-name="Horizontal Line" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Text_20_body" style:class="html" style:master-page-name="DissertationTOC">
      <style:paragraph-properties fo:break-before="page" fo:margin-top="0in" fo:margin-bottom="0.1965in" style:contextual-spacing="false" fo:padding="0in" fo:border-left="none" fo:border-right="none" fo:border-top="none" fo:border-bottom="none" text:number-lines="false" text:line-number="0" style:join-border="false"/>
      <style:text-properties fo:font-size="6pt" style:font-size-asian="6pt" style:font-size-complex="6pt"/>
    </style:style>`
  );
  styles = styles.replace(
    /<style:style style:name="Heading_20_1"[\s\S]*?<\/style:style>/,
    `<style:style style:name="Heading_20_1" style:display-name="Heading 1" style:family="paragraph" style:parent-style-name="Heading" style:next-style-name="Text_20_body" style:default-outline-level="1" style:class="text" style:master-page-name="DissertationBody">
      <style:paragraph-properties fo:break-before="page" style:page-number="1" fo:margin-top="0.45cm" fo:margin-bottom="0.3cm" fo:keep-with-next="always"/>
      <style:text-properties fo:font-size="18pt" fo:font-weight="bold" fo:color="#20364a" style:font-size-asian="18pt" style:font-weight-asian="bold"/>
    </style:style>`
  );
  styles = styles.replace(
    '</office:styles>',
    `<style:style style:name="Contents_20_Heading" style:display-name="Contents Heading" style:family="paragraph" style:parent-style-name="Heading_20_1" style:master-page-name="DissertationTOC">
      <style:paragraph-properties fo:text-align="center" fo:break-before="page" fo:margin-top="1.2cm" fo:margin-bottom="1.1cm"/>
      <style:text-properties fo:font-size="18pt" fo:font-weight="bold" fo:color="#20364a"/>
    </style:style>
    <style:style style:name="Contents_20_1" style:display-name="Contents 1" style:family="paragraph" style:parent-style-name="Standard">
      <style:paragraph-properties fo:margin-left="0.6cm" fo:margin-bottom="0.16cm"/>
      <style:text-properties fo:font-weight="bold"/>
    </style:style>
    <style:style style:name="Contents_20_2" style:display-name="Contents 2" style:family="paragraph" style:parent-style-name="Standard">
      <style:paragraph-properties fo:margin-left="1.2cm" fo:margin-bottom="0.12cm"/>
    </style:style>
    <style:style style:name="DissertationFooter" style:display-name="Dissertation Footer" style:family="paragraph" style:parent-style-name="Footer">
      <style:paragraph-properties fo:text-align="center"/>
      <style:text-properties fo:font-size="9pt" fo:color="#536a73"/>
    </style:style>
    <style:style style:name="Heading_20_7" style:display-name="Heading 7" style:family="paragraph" style:parent-style-name="Heading_20_6" style:default-outline-level="7"/>
    <style:style style:name="Heading_20_8" style:display-name="Heading 8" style:family="paragraph" style:parent-style-name="Heading_20_7" style:default-outline-level="8"/>
    <style:style style:name="Heading_20_9" style:display-name="Heading 9" style:family="paragraph" style:parent-style-name="Heading_20_8" style:default-outline-level="9"/>
  </office:styles>`
  );

  styles = styles.replace(
    /<style:page-layout style:name="Mpm1">[\s\S]*?<\/style:page-layout>/,
    `<style:page-layout style:name="Mpm1">
      <style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" style:num-format="1" style:print-orientation="portrait" fo:margin-top="2.5cm" fo:margin-bottom="2.5cm" fo:margin-left="2.5cm" fo:margin-right="2.5cm" style:writing-mode="lr-tb" style:footnote-max-height="0in">
        <style:footnote-sep style:width="0.0071in" style:distance-before-sep="0.0398in" style:distance-after-sep="0.0398in" style:line-style="none" style:adjustment="left" style:rel-width="25%" style:color="#000000"/>
      </style:page-layout-properties>
      <style:header-style/>
      <style:footer-style><style:header-footer-properties fo:min-height="0.4in" fo:margin-left="0in" fo:margin-right="0in" fo:margin-top="0.2in" style:dynamic-spacing="false"/></style:footer-style>
    </style:page-layout>
    <style:page-layout style:name="MpmCover">
      <style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" style:print-orientation="portrait" fo:margin-top="2.5cm" fo:margin-bottom="2.5cm" fo:margin-left="2.5cm" fo:margin-right="2.5cm" style:writing-mode="lr-tb">
        <style:background-image xlink:type="simple" xlink:href="Pictures/college-cover.png" xlink:show="embed" xlink:actuate="onLoad" style:repeat="stretch" style:position="center" style:filter-name=""/>
      </style:page-layout-properties>
      <style:header-style/>
      <style:footer-style/>
    </style:page-layout>`
  );

  styles = styles.replace(
    '</office:master-styles>',
    `<style:master-page style:name="DissertationCover" style:page-layout-name="MpmCover">
    </style:master-page>
    <style:master-page style:name="DissertationAbstract" style:page-layout-name="Mpm1"/>
    <style:master-page style:name="DissertationTOC" style:page-layout-name="Mpm1"/>
    <style:master-page style:name="DissertationBody" style:page-layout-name="Mpm1">
      <style:footer><text:p text:style-name="DissertationFooter"><text:page-number text:select-page="current">1</text:page-number></text:p></style:footer>
    </style:master-page>
  </office:master-styles>`
  );
  writeFileSync(join(unpacked, 'styles.xml'), styles);

  mkdirSync(join(unpacked, 'Pictures'));
  copyFileSync(cover, join(unpacked, 'Pictures/college-cover.png'));
  const manifestPath = join(unpacked, 'META-INF/manifest.xml');
  const manifest = readFileSync(manifestPath, 'utf8').replace(
    '</manifest:manifest>',
    ` <manifest:file-entry manifest:full-path="Pictures/college-cover.png" manifest:media-type="image/png"/>\n</manifest:manifest>`
  );
  writeFileSync(manifestPath, manifest);

  rmSync(target, { force: true });
  run('zip', ['-q', '-X', '-0', target, 'mimetype'], { cwd: unpacked });
  run('zip', ['-q', '-X', '-r', target, '.', '-x', 'mimetype'], { cwd: unpacked });
} finally {
  rmSync(work, { recursive: true, force: true });
}
