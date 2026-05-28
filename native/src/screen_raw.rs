use std::ptr::null_mut;
use std::sync::Mutex;

use napi::Result;
use napi_derive::napi;
use once_cell::sync::Lazy;
use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows_sys::Win32::Graphics::Gdi::{
    BeginPaint, CreateSolidBrush, DeleteObject, EndPaint, FillRect, InvalidateRect, UpdateWindow,
    HBRUSH, PAINTSTRUCT,
};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, GetClientRect, GetSystemMetrics, LoadCursorW,
    RegisterClassExW, SetLayeredWindowAttributes, ShowWindow, CS_HREDRAW, CS_VREDRAW, IDC_ARROW,
    LWA_COLORKEY, SM_CXSCREEN, SM_CYSCREEN, SW_SHOW, WM_DESTROY, WM_PAINT, WNDCLASSEXW,
    WS_EX_LAYERED, WS_EX_TOPMOST, WS_EX_TRANSPARENT, WS_POPUP,
};

use crate::common::{colorref, error, init_dpi_awareness, raw_to_hwnd, wide_null};

static OVERLAY_STATE: Lazy<Mutex<OverlayState>> = Lazy::new(|| Mutex::new(OverlayState::default()));

#[derive(Clone, Copy)]
struct OverlayState {
    hwnd: isize,
    rect: RECT,
    color: u32,
    has_active_square: bool,
    class_registered: bool,
}

impl Default for OverlayState {
    fn default() -> Self {
        Self {
            hwnd: 0,
            rect: RECT {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
            },
            color: 0,
            has_active_square: false,
            class_registered: false,
        }
    }
}

#[napi(js_name = "setSquare")]
pub async fn set_square(
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    r: u32,
    g: u32,
    b: u32,
) -> Result<bool> {
    init_dpi_awareness();
    if r > 255 || g > 255 || b > 255 {
        return Err(error("RGB values must be between 0 and 255"));
    }

    ensure_overlay_window()?;
    {
        let mut state = OVERLAY_STATE
            .lock()
            .map_err(|_| error("Overlay mutex poisoned"))?;
        state.rect = RECT {
            left: x,
            top: y,
            right: x + width,
            bottom: y + height,
        };
        state.color = colorref(r as u8, g as u8, b as u8);
        state.has_active_square = true;
        let hwnd = raw_to_hwnd(state.hwnd);
        unsafe {
            ShowWindow(hwnd, SW_SHOW);
            InvalidateRect(hwnd, null_mut(), 1);
            UpdateWindow(hwnd);
        }
    }

    Ok(true)
}

#[napi(js_name = "clearSquare")]
pub async fn clear_square() -> Result<bool> {
    init_dpi_awareness();
    let mut state = OVERLAY_STATE
        .lock()
        .map_err(|_| error("Overlay mutex poisoned"))?;
    state.has_active_square = false;
    if state.hwnd != 0 {
        unsafe {
            InvalidateRect(raw_to_hwnd(state.hwnd), null_mut(), 1);
            UpdateWindow(raw_to_hwnd(state.hwnd));
        }
    }
    Ok(true)
}

fn ensure_overlay_window() -> Result<()> {
    let mut state = OVERLAY_STATE
        .lock()
        .map_err(|_| error("Overlay mutex poisoned"))?;
    if state.hwnd != 0 {
        return Ok(());
    }

    let class_name = wide_null("SquareOverlayClass");
    let instance = unsafe { GetModuleHandleW(null_mut()) };

    if !state.class_registered {
        let wc = WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(overlay_window_proc),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: instance,
            hIcon: null_mut(),
            hCursor: unsafe { LoadCursorW(null_mut(), IDC_ARROW) },
            hbrBackground: null_mut(),
            lpszMenuName: null_mut(),
            lpszClassName: class_name.as_ptr(),
            hIconSm: null_mut(),
        };

        let atom = unsafe { RegisterClassExW(&wc) };
        if atom == 0 {
            return Err(error("Failed to register overlay window class"));
        }
        state.class_registered = true;
    }

    let screen_width = unsafe { GetSystemMetrics(SM_CXSCREEN) };
    let screen_height = unsafe { GetSystemMetrics(SM_CYSCREEN) };
    let hwnd = unsafe {
        CreateWindowExW(
            WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST,
            class_name.as_ptr(),
            wide_null("Cashew Square Overlay").as_ptr(),
            WS_POPUP,
            0,
            0,
            screen_width,
            screen_height,
            null_mut(),
            null_mut(),
            instance,
            null_mut(),
        )
    };

    if hwnd.is_null() {
        return Err(error("Failed to create overlay window"));
    }

    unsafe {
        SetLayeredWindowAttributes(hwnd, colorref(0, 0, 0), 0, LWA_COLORKEY);
    }
    state.hwnd = hwnd as isize;
    Ok(())
}

unsafe extern "system" fn overlay_window_proc(
    hwnd: HWND,
    msg: u32,
    w_param: WPARAM,
    l_param: LPARAM,
) -> LRESULT {
    match msg {
        WM_PAINT => {
            let mut ps: PAINTSTRUCT = std::mem::zeroed();
            let hdc = BeginPaint(hwnd, &mut ps);
            let mut client = RECT {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
            };
            GetClientRect(hwnd, &mut client);
            let black = CreateSolidBrush(colorref(0, 0, 0));
            FillRect(hdc, &client, black);
            DeleteObject(black as _);

            if let Ok(state) = OVERLAY_STATE.lock() {
                if state.has_active_square {
                    let brush: HBRUSH = CreateSolidBrush(state.color);
                    FillRect(hdc, &state.rect, brush);
                    DeleteObject(brush as _);
                }
            }

            EndPaint(hwnd, &ps);
            0
        }
        WM_DESTROY => {
            if let Ok(mut state) = OVERLAY_STATE.lock() {
                state.has_active_square = false;
                state.hwnd = 0;
            }
            0
        }
        _ => DefWindowProcW(hwnd, msg, w_param, l_param),
    }
}
