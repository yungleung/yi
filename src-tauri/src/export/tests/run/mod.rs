use super::*;
use std::path::Path;

/// A request for the tests that read the arguments: every name it can carry, carried.
fn request_in(dir: &Path) -> ExportRequest {
    ExportRequest {
        kind: "docx".to_string(),
        text: "# a note\n".to_string(),
        output_path: dir.join("out.docx").to_string_lossy().into_owned(),
        resource_paths: vec![dir.to_string_lossy().into_owned()],
        source_dir: None,
        bibliography: Some(dir.join("library.bib").to_string_lossy().into_owned()),
        csl: Some(CslStyle {
            name: "apa".to_string(),
            xml: "<style>apa</style>".to_string(),
        }),
        references: Some("References".to_string()),
        title: Some("Going out".to_string()),
        language: Some("en-GB".to_string()),
        paper: None,
        landscape: None,
        suppress_references: false,
        template_id: None,
        self_contained: false,
        native_bibliography: None,
        note_assets: Vec::new(),
    }
}

fn named_arguments(dir: &Path, request: &ExportRequest) -> Vec<String> {
    named_arguments_for(dir, request, kind_of(&request.kind).unwrap())
}

fn named_arguments_for(dir: &Path, request: &ExportRequest, kind: &ExportKind) -> Vec<String> {
    pandoc_arguments(
        dir,
        &dir.join(config_file_name(kind.kind)),
        &dir.join("note-1.md"),
        request,
        kind,
        None,
        None,
        None,
        None,
    )
    .unwrap()
    .iter()
    .map(|argument| argument.to_string_lossy().into_owned())
    .collect()
}

mod arguments;
mod delivery;
