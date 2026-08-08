mod app_update;
mod drive_sync;
mod repository;

use std::sync::Mutex;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Emitter,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(drive_sync::DriveLock(Mutex::new(())))
        .setup(|app| {
            let new_movement = MenuItem::with_id(
                app,
                "new_movement",
                "Nuevo movimiento",
                true,
                Some("CmdOrCtrl+N"),
            )?;
            let import_data = MenuItem::with_id(
                app,
                "import_data",
                "Importar copia…",
                true,
                Some("CmdOrCtrl+O"),
            )?;
            let export_data = MenuItem::with_id(
                app,
                "export_data",
                "Exportar JSON…",
                true,
                Some("CmdOrCtrl+S"),
            )?;
            let export_csv = MenuItem::with_id(
                app,
                "export_csv",
                "Exportar CSV…",
                true,
                Some("CmdOrCtrl+Shift+E"),
            )?;
            let quit = PredefinedMenuItem::quit(app, Some("Salir"))?;

            let view_dashboard =
                MenuItem::with_id(app, "view_dashboard", "Inicio", true, Some("CmdOrCtrl+1"))?;
            let view_movements = MenuItem::with_id(
                app,
                "view_movements",
                "Movimientos",
                true,
                Some("CmdOrCtrl+2"),
            )?;
            let view_planned =
                MenuItem::with_id(app, "view_planned", "Previstos", true, Some("CmdOrCtrl+3"))?;
            let view_cards =
                MenuItem::with_id(app, "view_cards", "Tarjetas", true, Some("CmdOrCtrl+4"))?;
            let view_projection = MenuItem::with_id(
                app,
                "view_projection",
                "Proyección",
                true,
                Some("CmdOrCtrl+5"),
            )?;
            let view_settings =
                MenuItem::with_id(app, "view_settings", "Ajustes", true, Some("CmdOrCtrl+6"))?;

            let month_prev = MenuItem::with_id(
                app,
                "month_prev",
                "Mes anterior",
                true,
                Some("CmdOrCtrl+Left"),
            )?;
            let month_next = MenuItem::with_id(
                app,
                "month_next",
                "Mes siguiente",
                true,
                Some("CmdOrCtrl+Right"),
            )?;
            let month_pick =
                MenuItem::with_id(app, "month_pick", "Elegir mes…", true, Some("CmdOrCtrl+M"))?;

            let about = MenuItem::with_id(app, "about", "Acerca de Ilara", true, None::<&str>)?;

            let file_menu = Submenu::with_items(
                app,
                "Archivo",
                true,
                &[
                    &new_movement,
                    &PredefinedMenuItem::separator(app)?,
                    &import_data,
                    &export_data,
                    &export_csv,
                    &PredefinedMenuItem::separator(app)?,
                    &quit,
                ],
            )?;
            let view_menu = Submenu::with_items(
                app,
                "Ver",
                true,
                &[
                    &view_dashboard,
                    &view_movements,
                    &view_planned,
                    &view_cards,
                    &view_projection,
                    &view_settings,
                ],
            )?;
            let month_menu =
                Submenu::with_items(app, "Mes", true, &[&month_prev, &month_next, &month_pick])?;
            let help_menu = Submenu::with_items(app, "Ayuda", true, &[&about])?;

            let menu = Menu::with_items(app, &[&file_menu, &view_menu, &month_menu, &help_menu])?;
            app.set_menu(menu)?;

            let handle = app.handle().clone();
            app.on_menu_event(move |_app, event| {
                let id = event.id().as_ref();
                let _ = handle.emit("ilara-menu", id);
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            repository::load_app_state,
            repository::save_app_state,
            repository::migrate_legacy_state,
            repository::list_data_profiles,
            repository::get_data_profile,
            repository::set_data_profile,
            repository::reset_sandbox_profile,
            drive_sync::drive_get_status,
            drive_sync::drive_save_credentials,
            drive_sync::drive_set_auto_sync,
            drive_sync::drive_mark_local_dirty,
            drive_sync::drive_disconnect,
            drive_sync::drive_connect,
            drive_sync::drive_push,
            drive_sync::drive_pull,
            drive_sync::drive_confirm_pulled,
            drive_sync::open_external_url,
            app_update::download_app_setup,
            app_update::launch_app_setup_and_quit,
            app_update::hash_local_file_sha256,
        ])
        .run(tauri::generate_context!())
        .expect("error al ejecutar Ilara Finanzas");
}
