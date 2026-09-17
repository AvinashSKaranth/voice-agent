#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Voice Agent desktop shell (Tauri 2 + Svelte 5).
// The UI performs no OS actions directly (FR-UI-03): all agency routes through
// the local agent runtime over ws://127.0.0.1:3790 + permission layer (NFR-06/07).
fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running voice-agent");
}
