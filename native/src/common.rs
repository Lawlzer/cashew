use std::ffi::CString;
use std::ptr::null;
use std::sync::Once;

use napi::{Error, Result, Status};
use windows_sys::Win32::Foundation::{GetLastError, HWND};
use windows_sys::Win32::Graphics::Gdi::{
    DeleteDC, DeleteObject, GetDC, ReleaseDC, HBITMAP, HDC, HGDIOBJ,
};
use windows_sys::Win32::UI::HiDpi::{
    SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_SYSTEM_AWARE,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{FindWindowA, GetForegroundWindow};

static DPI_INIT: Once = Once::new();

pub fn init_dpi_awareness() {
    DPI_INIT.call_once(|| unsafe {
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_SYSTEM_AWARE);
    });
}

pub fn error(reason: impl Into<String>) -> Error {
    Error::new(Status::GenericFailure, reason.into())
}

pub fn last_error(reason: &str) -> Error {
    let code = unsafe { GetLastError() };
    error(format!("{reason} (Error: {code})"))
}

pub async fn run_blocking<T, F>(task: F) -> Result<T>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T> + Send + 'static,
{
    tokio::task::spawn_blocking(task)
        .await
        .map_err(|err| error(format!("Native worker panicked or was cancelled: {err}")))?
}

pub fn c_string(value: &str, label: &str) -> Result<CString> {
    CString::new(value).map_err(|_| error(format!("{label} contains an embedded NUL byte")))
}

pub fn find_window(title: &str) -> Result<HWND> {
    let title = c_string(title, "windowTitle")?;
    let hwnd = unsafe { FindWindowA(null(), title.as_ptr().cast()) };
    if is_null_handle(hwnd) {
        return Err(error(format!(
            "Window not found: {}",
            title.to_string_lossy()
        )));
    }
    Ok(hwnd)
}

pub fn target_window(window_title: &str) -> Result<HWND> {
    if window_title.is_empty() {
        let hwnd = unsafe { GetForegroundWindow() };
        if is_null_handle(hwnd) {
            return Err(error("No foreground window found"));
        }
        Ok(hwnd)
    } else {
        find_window(window_title)
    }
}

pub fn is_null_handle<T>(handle: *mut T) -> bool {
    handle.is_null()
}

pub fn hwnd_to_raw(hwnd: HWND) -> isize {
    hwnd as isize
}

pub fn raw_to_hwnd(raw: isize) -> HWND {
    raw as HWND
}

pub fn wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

pub fn colorref(r: u8, g: u8, b: u8) -> u32 {
    u32::from(r) | (u32::from(g) << 8) | (u32::from(b) << 16)
}

pub fn ease_in_out_cubic(t: f64) -> f64 {
    if t < 0.5 {
        4.0 * t * t * t
    } else {
        1.0 - (-2.0 * t + 2.0).powi(3) / 2.0
    }
}

pub fn calculate_steps(duration_ms: i32) -> i32 {
    (duration_ms / 5).max(1)
}

pub fn sleep_ms(duration_ms: i32) {
    if duration_ms > 0 {
        std::thread::sleep(std::time::Duration::from_millis(duration_ms as u64));
    }
}

pub struct WindowDc {
    hwnd: HWND,
    hdc: HDC,
}

impl WindowDc {
    pub fn new(hwnd: HWND) -> Result<Self> {
        let hdc = unsafe { GetDC(hwnd) };
        if is_null_handle(hdc) {
            return Err(last_error("Failed to get device context"));
        }
        Ok(Self { hwnd, hdc })
    }

    pub fn get(&self) -> HDC {
        self.hdc
    }
}

impl Drop for WindowDc {
    fn drop(&mut self) {
        unsafe {
            let _ = ReleaseDC(self.hwnd, self.hdc);
        }
    }
}

pub struct CompatibleDc {
    hdc: HDC,
}

impl CompatibleDc {
    pub fn new(source: HDC) -> Result<Self> {
        let hdc = unsafe { windows_sys::Win32::Graphics::Gdi::CreateCompatibleDC(source) };
        if is_null_handle(hdc) {
            return Err(last_error("Failed to create compatible DC"));
        }
        Ok(Self { hdc })
    }

    pub fn get(&self) -> HDC {
        self.hdc
    }
}

impl Drop for CompatibleDc {
    fn drop(&mut self) {
        unsafe {
            let _ = DeleteDC(self.hdc);
        }
    }
}

pub struct Bitmap {
    bitmap: HBITMAP,
}

impl Bitmap {
    pub fn new(hdc: HDC, width: i32, height: i32) -> Result<Self> {
        let bitmap = unsafe {
            windows_sys::Win32::Graphics::Gdi::CreateCompatibleBitmap(hdc, width, height)
        };
        if is_null_handle(bitmap) {
            return Err(last_error("Failed to create bitmap"));
        }
        Ok(Self { bitmap })
    }

    pub fn get(&self) -> HBITMAP {
        self.bitmap
    }
}

impl Drop for Bitmap {
    fn drop(&mut self) {
        unsafe {
            let _ = DeleteObject(self.bitmap as HGDIOBJ);
        }
    }
}

pub struct SelectGuard {
    hdc: HDC,
    old: HGDIOBJ,
}

impl SelectGuard {
    pub fn new(hdc: HDC, object: HGDIOBJ) -> Result<Self> {
        let old = unsafe { windows_sys::Win32::Graphics::Gdi::SelectObject(hdc, object) };
        if is_null_handle(old) {
            return Err(last_error("Failed to select GDI object"));
        }
        Ok(Self { hdc, old })
    }
}

impl Drop for SelectGuard {
    fn drop(&mut self) {
        unsafe {
            let _ = windows_sys::Win32::Graphics::Gdi::SelectObject(self.hdc, self.old);
        }
    }
}
