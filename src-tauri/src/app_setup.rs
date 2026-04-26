use std::sync::Arc;

use tauri::{Manager, RunEvent};

use crate::app_lifecycle;
use crate::commands::{self, AppState};

type AppStartupResult<T> = Result<T, Box<dyn std::error::Error>>;

pub fn run_app() -> AppStartupResult<()> {
    let app_state = Arc::new(AppState::default());

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![commands::get_app_status])
        .build(tauri::generate_context!())?
        .run(|app_handle, event| {
            if let RunEvent::ExitRequested { .. } = event {
                if let Some(state) = app_handle.try_state::<Arc<AppState>>() {
                    app_lifecycle::request_shutdown(state.inner());
                }
            }
        });

    Ok(())
}
