//! The native menu domain.
//!
//! Example: startup installs the menu in the configured language; choosing `export_pdf` emits an
//! `export` event while a Settings language change rebuilds the labels.
//!
//! May import: the menu builder, event bridge and config language. Upholds: construction and event
//! mapping are separate implementations behind stable app lifecycle functions.

mod build;
mod events;

use std::error::Error;
use tauri::{App, AppHandle};

use crate::i18n::language_for;
use crate::settings::load_config;

pub fn set_as_main_menu(app: &mut App) -> Result<(), Box<dyn Error>> {
    set_menu_for_language(app.handle())?;
    events::install(app);
    Ok(())
}

pub fn set_menu_for_language(app: &AppHandle) -> Result<(), Box<dyn Error>> {
    let language = language_for(&load_config(app));
    app.set_menu(build::build(app, &language)?)?;
    Ok(())
}
