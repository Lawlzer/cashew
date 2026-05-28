use std::ptr::null_mut;

use napi::Result;
use napi_derive::napi;
use windows_sys::Win32::Foundation::GlobalFree;
use windows_sys::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, GetClipboardData, OpenClipboard, SetClipboardData,
};
use windows_sys::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
use windows_sys::Win32::System::Ole::CF_TEXT;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VIRTUAL_KEY, VK_CONTROL,
};

use crate::common::{error, init_dpi_awareness, run_blocking};

#[napi(js_name = "ReadClipboard")]
pub async fn read_clipboard() -> Result<Option<String>> {
    run_blocking(read_clipboard_impl).await
}

#[napi(js_name = "WriteClipboard")]
pub async fn write_clipboard(text: String) -> Result<bool> {
    run_blocking(move || write_clipboard_impl(&text)).await
}

#[napi(js_name = "ClipboardPaste")]
pub async fn clipboard_paste() -> Result<bool> {
    run_blocking(clipboard_paste_impl).await
}

fn read_clipboard_impl() -> Result<Option<String>> {
    init_dpi_awareness();
    unsafe {
        if OpenClipboard(null_mut()) == 0 {
            return Err(error("Failed to open clipboard"));
        }

        let handle = GetClipboardData(CF_TEXT as u32);
        if handle.is_null() {
            CloseClipboard();
            return Err(error("No text data in clipboard"));
        }

        let data = GlobalLock(handle);
        if data.is_null() {
            CloseClipboard();
            return Err(error("Failed to lock clipboard data"));
        }

        let mut len = 0usize;
        let bytes = data.cast::<u8>();
        while *bytes.add(len) != 0 {
            len += 1;
        }

        let slice = std::slice::from_raw_parts(bytes, len);
        let text = String::from_utf8_lossy(slice).into_owned();
        GlobalUnlock(handle);
        CloseClipboard();
        Ok(Some(text))
    }
}

fn write_clipboard_impl(text: &str) -> Result<bool> {
    init_dpi_awareness();
    let bytes = text.as_bytes();

    unsafe {
        if OpenClipboard(null_mut()) == 0 {
            return Err(error("Failed to open clipboard"));
        }

        if EmptyClipboard() == 0 {
            CloseClipboard();
            return Err(error("Failed to empty clipboard"));
        }

        let size = bytes.len() + 1;
        let handle = GlobalAlloc(GMEM_MOVEABLE, size);
        if handle.is_null() {
            CloseClipboard();
            return Err(error("Failed to allocate clipboard memory"));
        }

        let data = GlobalLock(handle);
        if data.is_null() {
            GlobalFree(handle);
            CloseClipboard();
            return Err(error("Failed to lock clipboard memory"));
        }

        std::ptr::copy_nonoverlapping(bytes.as_ptr(), data.cast::<u8>(), bytes.len());
        *data.cast::<u8>().add(bytes.len()) = 0;
        GlobalUnlock(handle);

        if SetClipboardData(CF_TEXT as u32, handle).is_null() {
            GlobalFree(handle);
            CloseClipboard();
            return Err(error("Failed to set clipboard data"));
        }

        CloseClipboard();
        Ok(true)
    }
}

fn clipboard_paste_impl() -> Result<bool> {
    init_dpi_awareness();
    let inputs = &mut [
        keyboard_input(VK_CONTROL, true),
        keyboard_input(b'V' as VIRTUAL_KEY, true),
        keyboard_input(b'V' as VIRTUAL_KEY, false),
        keyboard_input(VK_CONTROL, false),
    ];

    let sent = unsafe {
        SendInput(
            inputs.len() as u32,
            inputs.as_mut_ptr(),
            std::mem::size_of::<INPUT>() as i32,
        )
    };
    Ok(sent == inputs.len() as u32)
}

fn keyboard_input(key: VIRTUAL_KEY, down: bool) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: key,
                wScan: 0,
                dwFlags: if down { 0 } else { KEYEVENTF_KEYUP },
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}
