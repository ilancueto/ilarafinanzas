mod repository;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            repository::load_app_state,
            repository::save_app_state,
            repository::migrate_legacy_state
        ])
        .run(tauri::generate_context!())
        .expect("error al ejecutar Ilara Finanzas");
}
