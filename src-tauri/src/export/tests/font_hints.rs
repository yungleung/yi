/// What a settings file names, as the names themselves: the header that wires in the shipped faces
/// draws Han and kana with the CJK name, so a yes-or-no would not be enough to hand it over.
#[test]
fn a_file_names_its_fonts_and_a_comment_names_nothing() {
    let (main, cjk) = named_fonts(
        "variables:\n  mainfont: \"Arial Unicode MS\"\n  CJKmainfont: \"Songti SC\" # mine\n",
    );
    assert_eq!(main.as_deref(), Some("Arial Unicode MS"));
    assert_eq!(cjk.as_deref(), Some("Songti SC"));

    // The file this build ships talks about both variables in its header, and names neither: the
    // shipped faces are what draw Han, kana and Hangul until a reader writes a line of their own.
    let pdf = KINDS.iter().find(|kind| kind.kind == "pdf").unwrap();
    assert_eq!(named_fonts(pdf.defaults), (None, None));

    // A reader's copy of an *older* build's file still names one, and that name is still honored.
    let (_, cjk) = named_fonts("variables:\n  CJKmainfont: \"Songti SC\"\n");
    assert_eq!(cjk.as_deref(), Some("Songti SC"));
}

#[test]
fn a_file_names_a_font_when_a_line_that_is_not_a_comment_says_so() {
    // The two variables, as the names themselves — the CJK one is handed to the header that draws
    // Han and kana, so a yes-or-no would not do — and the two spellings that look like one of them
    // without being it.
    assert_eq!(
        named_fonts("variables:\n  CJKmainfont: \"Songti SC\"\n"),
        (None, Some("Songti SC".to_string()))
    );
    assert_eq!(
        named_fonts("variables:\n  mainfont: \"Arial Unicode MS\"\n"),
        (Some("Arial Unicode MS".to_string()), None)
    );
    assert_eq!(
        named_fonts("variables:\n  sansfont: X\n  monofont: Y\n"),
        (None, None)
    );

    // A **comment** names nothing: the shipped files' headers talk about fonts at length — they
    // explain what happens without one and how to add it — and reading that as a reader who has
    // chosen is the mistake that once left the characters missing.
    assert_eq!(
        named_fonts("# add `mainfont: \"Arial Unicode MS\"` for other scripts\nreader: markdown\n"),
        (None, None)
    );
    assert_eq!(
        named_fonts("variables:\n  # mainfont: \"X\"\n  CJKmainfont: \"Songti SC\"\n"),
        (None, Some("Songti SC".to_string()))
    );
}
use super::*;
