use napi::Result;
use napi_derive::napi;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowTextA, SetForegroundWindow as WinSetForegroundWindow,
};

use crate::common::{error, find_window, init_dpi_awareness, is_null_handle, run_blocking};

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
            return Err(error("No foreground window found"));
        }

        let mut buffer = [0u8; 256];
        let len = unsafe { GetWindowTextA(hwnd, buffer.as_mut_ptr(), buffer.len() as i32) };
        if len <= 0 {
            return Err(error("Failed to get foreground window title"));
        }

        Ok(Some(
            String::from_utf8_lossy(&buffer[..len as usize]).into_owned(),
        ))
    })
    .await
}
