use std::sync::Arc;

use crate::commands::AppState;

pub fn request_shutdown(app_state: &Arc<AppState>) {
    app_state.request_shutdown();
}
