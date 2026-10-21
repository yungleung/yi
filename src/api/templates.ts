/**
 * Export template packages, through the app's own commands.
 *
 * A package is a folder under the app's export data with a manifest the app writes; the window
 * names one by id, never by path. Inspection, import, the editor's file calls and validation all
 * live behind this seam, so a component never learns where the data folder is.
 *
 * May import: the app's command seam (`invoke`). Upholds: one declaration of the package shape,
 * which the Rust manifest and the window's types both read.
 */

import { invoke } from '@tauri-apps/api/core';

/** The export kind a package is for, as the manifest spells it. */
export type ExportKindName = 'html' | 'latex' | 'pdf' | 'epub' | 'docx' | 'odt';

/** What an inspection found: a text template, a reference document, or both. */
export type TemplateKind = 'template' | 'reference-doc' | 'ambiguous';

/** How a package's entry is used. */
export type TemplateMode = 'template' | 'wrapper' | 'reference-doc';

export interface TemplateOrigin {
  type: string;
  path?: string | null;
  source?: string | null;
  license?: string | null;
  imported?: string | null;
}

/** The shape the app writes to `template.json`. */
export interface TemplateManifest {
  schema: number;
  id: string;
  name: string;
  kind: string;
  mode: TemplateMode;
  origin: TemplateOrigin;
  template: string | null;
  reference_doc: string | null;
  csl: string | null;
  assets: string[];
  deliver: string[];
}

export interface TemplateFileInfo {
  name: string;
  size: number;
  editable: boolean;
}

export interface TemplateSummary {
  id: string;
  path: string;
  manifest: TemplateManifest | null;
  /** Why a broken package cannot be read, or null. Such a package is still listed so it can be removed. */
  error: string | null;
  files: TemplateFileInfo[];
}

export interface ScannedFile {
  name: string;
  size: number;
}

export interface WrapperProposal {
  source_entry: string;
  entry: string;
  insertion: string;
  preview: string;
  maps_title: boolean;
  maps_author: boolean;
}

/** What inspection proposes, before anything is copied. */
export interface ImportProposal {
  kind: TemplateKind;
  entry: string;
  mode: TemplateMode;
  assets: string[];
  deliver: string[];
  warnings: string[];
  source_type: string;
  suggested_kind: ExportKindName | null;
  csl: string | null;
  entry_candidates: string[];
  ambiguous_entry: boolean;
  wrapper: WrapperProposal | null;
  files: ScannedFile[];
}

/** What the reader confirmed after inspection. */
export interface ImportRequest {
  source: string;
  name: string;
  kind: string;
  entry: string | null;
  source_url: string | null;
  license: string | null;
  map_title: boolean;
  map_author: boolean;
}

export interface DetailsPatch {
  name: string;
  kind: string;
  source: string | null;
  license: string | null;
  entry: string | null;
}

export interface ValidationResult {
  ok: boolean;
  message: string;
  warnings: string[];
}

export async function exportTemplates(): Promise<TemplateSummary[]> {
  return await invoke<TemplateSummary[]>('export_templates');
}

export async function inspectTemplate(source: string): Promise<ImportProposal> {
  return await invoke<ImportProposal>('export_template_inspect', { source });
}

export async function wrapperPreview(
  source: string,
  entry: string,
  mapTitle: boolean,
  mapAuthor: boolean
): Promise<string> {
  return await invoke<string>('export_template_wrapper_preview', {
    source,
    entry,
    mapTitle,
    mapAuthor
  });
}

export async function importTemplate(request: ImportRequest): Promise<TemplateSummary> {
  return await invoke<TemplateSummary>('export_template_import', { request });
}

export async function createDefaultTemplate(
  kind: string,
  name: string | null,
  source: string | null,
  license: string | null
): Promise<TemplateSummary> {
  return await invoke<TemplateSummary>('export_template_create_default', {
    kind,
    name,
    source,
    license
  });
}

export async function duplicateTemplate(id: string): Promise<TemplateSummary> {
  return await invoke<TemplateSummary>('export_template_duplicate', { id });
}

export async function removeTemplate(id: string): Promise<void> {
  await invoke('export_template_remove', { id });
}

export async function updateTemplate(id: string, patch: DetailsPatch): Promise<TemplateSummary> {
  return await invoke<TemplateSummary>('export_template_update', { id, patch });
}

export async function readTemplateFile(id: string, file: string): Promise<string> {
  return await invoke<string>('export_template_read', { id, file });
}

export async function writeTemplateFile(id: string, file: string, text: string): Promise<void> {
  await invoke('export_template_write', { id, file, text });
}

export async function validateTemplate(id: string): Promise<ValidationResult> {
  return await invoke<ValidationResult>('export_template_validate', { id });
}

export async function testTemplatePdf(id: string): Promise<ValidationResult> {
  return await invoke<ValidationResult>('export_template_test_pdf', { id });
}

export async function templateTakesPdf(kind: string): Promise<boolean> {
  return await invoke<boolean>('export_template_takes_pdf', { kind });
}

export async function exportConfigText(kind: string): Promise<string> {
  return await invoke<string>('export_config_text', { kind });
}

export async function saveExportConfigText(kind: string, text: string): Promise<void> {
  await invoke('export_save_config_text', { kind, text });
}
