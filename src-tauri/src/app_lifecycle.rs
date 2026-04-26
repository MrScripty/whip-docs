use std::sync::Arc;

use crate::commands::AppState;

pub fn request_shutdown(app_state: &Arc<AppState>) {
    app_state.request_shutdown();
    let app_state = Arc::clone(app_state);
    tauri::async_runtime::spawn(async move {
        if let Err(error) = app_state.shutdown_services().await {
            log::warn!("failed to shut down analyzer services: {}", error.message);
        }
    });
}
