use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};

use napi::Result;
use napi_derive::napi;
use once_cell::sync::Lazy;
use windows_sys::Win32::Foundation::{LPARAM, WPARAM};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, MapVirtualKeyA, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT,
    KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, KEYEVENTF_SCANCODE, MAPVK_VK_TO_VSC, VIRTUAL_KEY,
    VK_APPS, VK_CANCEL, VK_DELETE, VK_DIVIDE, VK_DOWN, VK_END, VK_HOME, VK_INSERT, VK_LEFT,
    VK_LWIN, VK_NEXT, VK_NUMLOCK, VK_PRIOR, VK_RCONTROL, VK_RIGHT, VK_RMENU, VK_RWIN, VK_SNAPSHOT,
    VK_UP,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    PostMessageA, SendMessageA, SetForegroundWindow, WM_CHAR, WM_KEYDOWN, WM_KEYUP,
};

use crate::common::{
    error, hwnd_to_raw, init_dpi_awareness, raw_to_hwnd, run_blocking, sleep_ms, target_window,
};

static HELD_KEYS: Lazy<Mutex<HashMap<u16, HeldKey>>> = Lazy::new(|| Mutex::new(HashMap::new()));

struct HeldKey {
    stop: Arc<AtomicBool>,
    handle: Option<JoinHandle<()>>,
}

#[napi(js_name = "holdKey")]
pub async fn hold_key(key_code: u32, window_title: Option<String>) -> Result<()> {
    run_blocking(move || hold_key_impl(key_code as u16, window_title.unwrap_or_default())).await
}

#[napi(js_name = "releaseKey")]
pub async fn release_key(key_code: u32, _window_title: Option<String>) -> Result<()> {
    run_blocking(move || release_key_impl(key_code as u16)).await
}

#[napi(js_name = "holdKeys")]
pub async fn hold_keys(key_codes: Vec<u32>, window_title: Option<String>) -> Result<()> {
    run_blocking(move || {
        let title = window_title.unwrap_or_default();
        for key_code in key_codes {
            hold_key_impl(key_code as u16, title.clone())?;
        }
        Ok(())
    })
    .await
}

#[napi(js_name = "releaseKeys")]
pub async fn release_keys(key_codes: Vec<u32>) -> Result<()> {
    run_blocking(move || {
        for key_code in key_codes {
            release_key_impl(key_code as u16)?;
        }
        Ok(())
    })
    .await
}

#[napi(js_name = "isKeyPressed")]
pub async fn is_key_pressed(key_code: u32) -> Result<bool> {
    run_blocking(move || Ok(is_key_pressed_impl(key_code))).await
}

#[napi(js_name = "type")]
pub async fn type_text(
    key_codes: Vec<u32>,
    window_title: String,
    delay_per_key: u32,
) -> Result<bool> {
    run_blocking(move || type_text_impl(key_codes, window_title, delay_per_key)).await
}

#[napi(js_name = "tapKey")]
pub async fn tap_key(key_code: u32, window_title: Option<String>) -> Result<()> {
    run_blocking(move || tap_key_impl(key_code as u16, window_title.unwrap_or_default())).await
}

#[napi(js_name = "holdKeyForDuration")]
pub async fn hold_key_for_duration(key_code: u32, duration: u32) -> Result<()> {
    run_blocking(move || {
        send_key(key_code as u16, true);
        sleep_ms(duration as i32);
        send_key(key_code as u16, false);
        Ok(())
    })
    .await
}

#[napi(js_name = "stopAllHoldKeys")]
pub fn stop_all_hold_keys() -> Result<()> {
    stop_all_hold_keys_impl()
}

pub fn is_key_pressed_impl(key_code: u32) -> bool {
    init_dpi_awareness();
    unsafe { (GetAsyncKeyState(key_code as i32) & 0x8000u16 as i16) != 0 }
}

pub fn batch_keyboard_input(key_code: u16, down: bool) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: key_code as VIRTUAL_KEY,
                wScan: 0,
                dwFlags: if down { 0 } else { KEYEVENTF_KEYUP },
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

fn hold_key_impl(key_code: u16, window_title: String) -> Result<()> {
    init_dpi_awareness();
    let target = if window_title.is_empty() {
        0
    } else {
        hwnd_to_raw(target_window(&window_title)?)
    };

    let mut held = HELD_KEYS
        .lock()
        .map_err(|_| error("Held key mutex poisoned"))?;
    if held.contains_key(&key_code) {
        return Err(error("Key is already being held"));
    }

    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = Arc::clone(&stop);
    let handle = thread::spawn(move || hold_key_loop(key_code, target, thread_stop));
    held.insert(
        key_code,
        HeldKey {
            stop,
            handle: Some(handle),
        },
    );

    Ok(())
}

fn release_key_impl(key_code: u16) -> Result<()> {
    init_dpi_awareness();
    let held = HELD_KEYS
        .lock()
        .map_err(|_| error("Held key mutex poisoned"))?
        .remove(&key_code);

    if let Some(mut held_key) = held {
        held_key.stop.store(true, Ordering::SeqCst);
        if let Some(handle) = held_key.handle.take() {
            let _ = handle.join();
        }
    } else {
        send_key(key_code, false);
    }

    Ok(())
}

fn stop_all_hold_keys_impl() -> Result<()> {
    let held_keys = {
        let mut held = HELD_KEYS
            .lock()
            .map_err(|_| error("Held key mutex poisoned"))?;
        held.drain()
            .map(|(_, held_key)| held_key)
            .collect::<Vec<_>>()
    };

    for mut held_key in held_keys {
        held_key.stop.store(true, Ordering::SeqCst);
        if let Some(handle) = held_key.handle.take() {
            let _ = handle.join();
        }
    }

    Ok(())
}

fn hold_key_loop(key_code: u16, target: isize, stop: Arc<AtomicBool>) {
    if target != 0 {
        unsafe {
            let _ = SetForegroundWindow(raw_to_hwnd(target));
        }
        sleep_ms(50);
    }

    if target == 0 {
        send_key(key_code, true);
    } else {
        post_key(raw_to_hwnd(target), key_code, true, false);
    }

    sleep_ms(500);

    while !stop.load(Ordering::SeqCst) {
        if target == 0 {
            send_key(key_code, true);
        } else {
            post_key(raw_to_hwnd(target), key_code, true, true);
        }
        sleep_ms(33);
    }

    if target == 0 {
        send_key(key_code, false);
    } else {
        post_key(raw_to_hwnd(target), key_code, false, false);
    }
}

fn type_text_impl(key_codes: Vec<u32>, window_title: String, delay_per_key: u32) -> Result<bool> {
    init_dpi_awareness();
    let hwnd = target_window(&window_title)?;
    for key_code in key_codes {
        unsafe {
            SendMessageA(hwnd, WM_CHAR, key_code as WPARAM, 0);
        }
        sleep_ms(delay_per_key as i32);
    }
    Ok(true)
}

fn tap_key_impl(key_code: u16, window_title: String) -> Result<()> {
    init_dpi_awareness();
    if !window_title.is_empty() {
        let hwnd = target_window(&window_title)?;
        unsafe {
            let _ = SetForegroundWindow(hwnd);
        }
        sleep_ms(50);
    }

    send_key(key_code, true);
    sleep_ms(10);
    send_key(key_code, false);
    Ok(())
}

fn send_key(key_code: u16, down: bool) -> bool {
    let input = scan_keyboard_input(key_code, down);
    unsafe { SendInput(1, &input, std::mem::size_of::<INPUT>() as i32) == 1 }
}

fn scan_keyboard_input(key_code: u16, down: bool) -> INPUT {
    let scan = unsafe { MapVirtualKeyA(u32::from(key_code), MAPVK_VK_TO_VSC) as u16 };
    let mut flags = KEYEVENTF_SCANCODE;
    if !down {
        flags |= KEYEVENTF_KEYUP;
    }
    if is_extended_key(key_code) {
        flags |= KEYEVENTF_EXTENDEDKEY;
    }

    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: 0 as VIRTUAL_KEY,
                wScan: scan,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

fn post_key(hwnd: windows_sys::Win32::Foundation::HWND, key_code: u16, down: bool, repeat: bool) {
    let scan = unsafe { MapVirtualKeyA(u32::from(key_code), MAPVK_VK_TO_VSC) };
    let lparam = if down {
        ((scan as LPARAM) << 16) | if repeat { 0x40000001 } else { 0x00000001 }
    } else {
        ((scan as LPARAM) << 16) | 0xC0000001u32 as LPARAM
    };
    unsafe {
        let _ = PostMessageA(
            hwnd,
            if down { WM_KEYDOWN } else { WM_KEYUP },
            key_code as WPARAM,
            lparam,
        );
    }
}

fn is_extended_key(key_code: u16) -> bool {
    matches!(
        key_code as VIRTUAL_KEY,
        VK_LWIN
            | VK_RWIN
            | VK_APPS
            | VK_RCONTROL
            | VK_RMENU
            | VK_INSERT
            | VK_DELETE
            | VK_HOME
            | VK_END
            | VK_PRIOR
            | VK_NEXT
            | VK_LEFT
            | VK_RIGHT
            | VK_UP
            | VK_DOWN
            | VK_NUMLOCK
            | VK_CANCEL
            | VK_SNAPSHOT
            | VK_DIVIDE
    )
}
