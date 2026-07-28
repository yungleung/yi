use chrono::{Local, Timelike};

#[tauri::command]
pub fn greet(name: &str) -> String {
    // Get the current local time
    let now = Local::now();
    let hour = now.hour();

    // Determine the time of day
    let time_of_day = match hour {
        5..=11 => "Morning",    // 5 AM to 11 AM
        12..=17 => "Afternoon", // 12 PM to 5 PM
        18..=21 => "Evening",   // 6 PM to 9 PM
        _ => "Night",           // 9 PM to 4 AM
    };
    if name.trim().is_empty() {
        return format!("{}!", time_of_day);
    }
    let first_char = name.chars().next().unwrap().to_uppercase().to_string();
    format!(
        "{} {}{}!",
        time_of_day,
        first_char,
        &name[1..].to_lowercase()
    )
}
