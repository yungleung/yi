//! The app's words, in the reader's language.
//!
//! The catalogues are the same files the webview reads (`locales/<language>.json`), brought into
//! the binary at compile time: one set of facts, two readers. This side serves the *menu*, which
//! is built before any window exists and has to survive a window that never loads
//! (`src/ui/markdown/...` has nothing to say about it) — and the webview's reader
//! (`src/services/i18n.ts`) serves everything else. A key is dotted and flat, a parameter is
//! `{name}` inside the string, and a key with no string answers the key itself, so a gap is
//! visible rather than blank. The lookup rule, the fallback to English and the reading of a
//! system locale are written twice, once per language, and `test/checks/check-locales.mjs` holds
//! the two to the same files and the same expectations.

use std::collections::HashMap;
use std::sync::{OnceLock, RwLock};

use crate::settings::AppConfig;

/// The languages this app speaks, in the order the settings window offers them.
pub const LANGUAGES: [&str; 8] = ["en", "ja", "zh-Hans", "zh-Hant", "de", "fr", "es", "pt"];

/// The language every fallback lands on, and the one every key is written in.
const DEFAULT_LANGUAGE: &str = "en";

const CATALOGUE_FILES: [(&str, &str); 8] = [
  ("en", include_str!("../../locales/en.json")),
  ("ja", include_str!("../../locales/ja.json")),
  ("zh-Hans", include_str!("../../locales/zh-Hans.json")),
  ("zh-Hant", include_str!("../../locales/zh-Hant.json")),
  ("de", include_str!("../../locales/de.json")),
  ("fr", include_str!("../../locales/fr.json")),
  ("es", include_str!("../../locales/es.json")),
  ("pt", include_str!("../../locales/pt.json")),
];

/// Every catalogue, parsed once. A file that will not parse leaves that language empty, which
/// reads as *the keys themselves* rather than as a crash.
fn catalogues() -> &'static HashMap<&'static str, HashMap<String, String>> {
  static PARSED: OnceLock<HashMap<&'static str, HashMap<String, String>>> = OnceLock::new();
  PARSED.get_or_init(|| {
    CATALOGUE_FILES
      .iter()
      .map(|(language, text)| {
        let catalogue = serde_json::from_str::<HashMap<String, String>>(text).unwrap_or_default();
        (*language, catalogue)
      })
      .collect()
  })
}

/// The string for `key`, with its parameters put in.
pub fn t(language: &str, key: &str, params: &[(&str, &str)]) -> String {
  let all = catalogues();
  let text = all
    .get(language)
    .and_then(|catalogue| catalogue.get(key))
    .or_else(|| all.get(DEFAULT_LANGUAGE).and_then(|catalogue| catalogue.get(key)))
    .map(String::as_str)
    .unwrap_or(key);
  let mut out = String::with_capacity(text.len());
  let mut rest = text;
  while let Some(open) = rest.find('{') {
    out.push_str(&rest[..open]);
    let after = &rest[open + 1..];
    match after.find('}') {
      Some(close) => {
        let name = &after[..close];
        match params.iter().find(|(known, _)| *known == name) {
          Some((_, value)) => out.push_str(value),
          None => {
            out.push('{');
            out.push_str(name);
            out.push('}');
          }
        }
        rest = &after[close + 1..];
      }
      None => {
        out.push('{');
        rest = after;
      }
    }
  }
  out.push_str(rest);
  out
}

/// Whether a string is one of the languages this app has a catalogue for.
pub fn is_language(code: &str) -> bool {
  LANGUAGES.contains(&code)
}

/// The language the app is speaking, for the sentences the backend writes where no configuration is at
/// hand — a failed write, a name the file system refuses: those happen inside a command, and the reader
/// meets them in a toast beside translated chrome. Set where the config is read and where it is written
/// (`settings::load_config`, `settings::set_config`), so it is never stale by more than one save.
static LANGUAGE: OnceLock<RwLock<String>> = OnceLock::new();

fn spoken() -> &'static RwLock<String> {
  LANGUAGE.get_or_init(|| RwLock::new(DEFAULT_LANGUAGE.to_string()))
}

/// Remembers the language a config asks for, so that `now` can speak it.
pub fn remember(language: &str) {
  let language = if is_language(language) {
    language
  } else {
    DEFAULT_LANGUAGE
  };
  if let Ok(mut spoken) = spoken().write() {
    *spoken = language.to_string();
  }
}

/// The string for `key` in the language the app is speaking — `t`, for a caller with no config: the
/// sentence a reader sees when a write fails is written where the write fails.
pub fn now(key: &str, params: &[(&str, &str)]) -> String {
  let language = spoken().read().map(|held| held.clone()).unwrap_or_default();
  t(&language, key, params)
}

/// The language a system locale asks for: `zh-Hant-TW` and `zh-TW` are Traditional Chinese, `zh`
/// and `zh-CN` are Simplified, and anything else this app does not speak is English. Chinese is
/// the one place a locale has to be read rather than matched by its first two letters — the script
/// is the language.
pub fn match_locale(locale: &str) -> &'static str {
  let tag = locale.replace('_', "-").to_lowercase();
  if tag.starts_with("zh") {
    let traditional = tag
      .split('-')
      .any(|part| matches!(part, "hant" | "tw" | "hk" | "mo"));
    return if traditional { "zh-Hant" } else { "zh-Hans" };
  }
  let two = &tag[..tag.len().min(2)];
  LANGUAGES
    .iter()
    .find(|language| **language == two)
    .copied()
    .unwrap_or(DEFAULT_LANGUAGE)
}

/// The language the app is speaking: what the config says, or — when it says nothing, which is
/// what a config written before this field existed says — the reader's own system locale, and
/// English when even that is not one this app has.
pub fn language_for(cfg: &AppConfig) -> String {
  let chosen = cfg.language.trim();
  if is_language(chosen) {
    return chosen.to_string();
  }
  tauri_plugin_os::locale()
    .map(|locale| match_locale(&locale).to_string())
    .unwrap_or_else(|| DEFAULT_LANGUAGE.to_string())
}

#[cfg(test)]
mod tests {
  use super::*;

  /// The backend's own sentences, in the language the config asks for — the half of this module the
  /// menu did not already use: a failed write or a name the file system refuses is written deep in a
  /// command, and `now` is what speaks it there.
  ///
  /// This is the one test that sets the process-wide language, and it is safe because no other test
  /// *reads* it: they all ask `t(language, …)` with the language spelled out.
  #[test]
  fn a_sentence_is_written_in_the_language_the_config_asked_for() {
    remember("zh-Hans");
    assert_eq!(now("export.noPandoc", &[]), "本机没有可运行的 pandoc。");
    assert_eq!(
      now("export.cannotWrite", &[("path", "/tmp/x"), ("reason", "no such file")]),
      "Yi 无法写入 /tmp/x：no such file"
    );
    // A language the app does not speak falls back to English rather than to a blank.
    remember("kl-Greenlandic");
    assert_eq!(now("export.noPandoc", &[]), "This machine has no pandoc to run.");
    // And every catalogue really does answer for these keys, one by one: a key that only English has
    // would leave a reader in the other seven languages looking at the key itself.
    for language in LANGUAGES {
      for key in ["export.noPandoc", "export.cannotWrite", "export.noSuchKind"] {
        let text = t(language, key, &[]);
        assert!(!text.is_empty() && text != *key, "{language} has nothing for {key}");
      }
    }
  }

  #[test]
  fn every_language_has_a_catalogue() {
    let all = catalogues();
    for language in LANGUAGES {
      assert!(
        all.get(language).is_some_and(|catalogue| !catalogue.is_empty()),
        "{language} has no catalogue"
      );
    }
  }

  #[test]
  fn every_catalogue_has_the_same_keys() {
    let all = catalogues();
    let english = all.get("en").expect("the default catalogue");
    for language in LANGUAGES {
      let catalogue = all.get(language).expect("a catalogue");
      let mut missing: Vec<&String> = english
        .keys()
        .filter(|key| !catalogue.contains_key(*key))
        .collect();
      missing.sort();
      assert!(missing.is_empty(), "{language} is missing {missing:?}");
      let mut extra: Vec<&String> = catalogue
        .keys()
        .filter(|key| !english.contains_key(*key))
        .collect();
      extra.sort();
      assert!(extra.is_empty(), "{language} has keys English does not: {extra:?}");
    }
  }

  #[test]
  fn a_string_is_answered_in_the_language_asked_for() {
    assert_eq!(t("de", "menu.file.save", &[]), "Sichern");
    assert_eq!(t("ja", "menu.file.save", &[]), "保存");
  }

  #[test]
  fn a_missing_key_is_the_key_itself() {
    assert_eq!(t("en", "no.such.key", &[]), "no.such.key");
  }

  #[test]
  fn parameters_are_put_in_where_their_braces_are() {
    assert_eq!(
      t("en", "toolbar.tableSize", &[("columns", "3"), ("rows", "2")]),
      "3 columns by 2 rows"
    );
    assert_eq!(t("en", "status.words", &[]), "Words: {count}");
  }

  #[test]
  fn a_system_locale_picks_a_language() {
    assert_eq!(match_locale("de-DE"), "de");
    assert_eq!(match_locale("fr_FR"), "fr");
    assert_eq!(match_locale("pt-BR"), "pt");
    assert_eq!(match_locale("ja-JP"), "ja");
    assert_eq!(match_locale("zh-Hans-CN"), "zh-Hans");
    assert_eq!(match_locale("zh-CN"), "zh-Hans");
    assert_eq!(match_locale("zh-TW"), "zh-Hant");
    assert_eq!(match_locale("zh-Hant-HK"), "zh-Hant");
    assert_eq!(match_locale("ko-KR"), "en");
  }
}
