use napi::Result;
use napi_derive::napi;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, SetForegroundWindow as WinSetForegroundWindow,
};

use crate::common::{
    find_window, get_window_title, init_dpi_awareness, is_null_handle, run_blocking,
};

#[napi(js_name = "SetForegroundWindow")]
pub async fn set_foreground_window(window_title: String) -> Result<bool> {
    run_blocking(move || {
        init_dpi_awareness();
        let hwnd = find_window(&window_title)?;
        Ok(unsafe { WinSetForegroundWindow(hwnd) != 0 })
    })
    .await
}

#[napi(js_name = "GetForegroundWindowTitle")]
pub async fn get_foreground_window_title() -> Result<Option<String>> {
    run_blocking(|| {
        init_dpi_awareness();
        let hwnd = unsafe { GetForegroundWindow() };
        if is_null_handle(hwnd) {
            return Ok(None);
        }

        let title = get_window_title(hwnd)?;
        Ok(Some(title))
    })
    .await
}
