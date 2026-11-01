//! For Statistics, such as words count

/// Words Statistics
#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
pub struct WordsCount {
    pub words: usize,
    pub characters: usize,
    pub whitespaces: usize,
    pub cjk: usize,
}

#[tauri::command]
pub fn get_word_count(markdown: String) -> WordsCount {
    let count = words_count::count(&markdown);
    WordsCount {
        words: count.words,
        characters: count.characters,
        whitespaces: count.whitespaces,
        cjk: count.cjk,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_word_count() {
        let markdown = "Rust是由 Mozilla 主導開發的通用、編譯型程式語言。".into();
        let count = get_word_count(markdown);
        assert_eq!(
            count,
            WordsCount {
                words: 20,
                characters: 31,
                whitespaces: 2,
                cjk: 18,
            }
        );
    }
}
