use std::collections::HashSet;
use std::sync::{Mutex, Once};

use napi::Result;
use napi_derive::napi;
use once_cell::sync::Lazy;
use windows_sys::Win32::System::Threading::Sleep;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, GetKeyboardState, SendInput, INPUT,
};

use crate::common::{error, init_dpi_awareness};
use crate::keyboard::{batch_keyboard_input, is_key_pressed_impl};

static INIT_ONCE: Once = Once::new();
static INITIALIZED_KEYS: Lazy<Mutex<HashSet<u32>>> = Lazy::new(|| Mutex::new(HashSet::new()));

#[napi(object)]
pub struct KeyBatchEvent {
    pub key_code: u32,
    pub is_down: bool,
}

#[napi(object)]
pub struct RawKeyState {
    pub async_state: i32,
    pub async_state_hex: String,
    pub is_pressed: bool,
    pub was_pressed: bool,
    pub keyboard_state: u32,
    pub kb_state_pressed: bool,
}

#[napi(js_name = "isKeyPressedSync")]
pub fn is_key_pressed_sync(key_code: u32) -> Result<bool> {
    initialize_key(key_code)?;
    Ok(is_key_pressed_impl(key_code))
}

#[napi(js_name = "areKeysPressed")]
pub fn are_keys_pressed(key_codes: Vec<u32>) -> Result<Vec<bool>> {
    key_codes
        .into_iter()
        .map(|key_code| {
            initialize_key(key_code)?;
            Ok(is_key_pressed_impl(key_code))
        })
        .collect()
}

#[napi(js_name = "getPressedKeys")]
pub fn get_pressed_keys() -> Result<Vec<u32>> {
    initialize_global_key_states();
    let mut pressed = Vec::new();
    for key_code in 0..=255u32 {
        if is_key_pressed_impl(key_code) {
            pressed.push(key_code);
        }
    }
    Ok(pressed)
}

#[napi(js_name = "sendKeyBatch")]
pub fn send_key_batch(events: Vec<KeyBatchEvent>) -> Result<bool> {
    init_dpi_awareness();
    let mut inputs: Vec<INPUT> = events
        .into_iter()
        .filter(|event| event.key_code <= u32::from(u16::MAX))
        .map(|event| batch_keyboard_input(event.key_code as u16, event.is_down))
        .collect();

    if inputs.is_empty() {
        return Ok(true);
    }

    let sent = unsafe {
        SendInput(
            inputs.len() as u32,
            inputs.as_mut_ptr(),
            std::mem::size_of::<INPUT>() as i32,
        )
    };
    Ok(sent == inputs.len() as u32)
}

#[napi(js_name = "getRawKeyState")]
pub fn get_raw_key_state(key_code: u32) -> Result<RawKeyState> {
    initialize_key(key_code)?;
    let async_state = unsafe { GetAsyncKeyState(key_code as i32) };
    let mut keyboard_state = [0u8; 256];
    let kb_ok = unsafe { GetKeyboardState(keyboard_state.as_mut_ptr()) } != 0;
    let kb_state = if kb_ok && key_code < 256 {
        keyboard_state[key_code as usize]
    } else {
        0
    };

    Ok(RawKeyState {
        async_state: i32::from(async_state),
        async_state_hex: i32::from(async_state).to_string(),
        is_pressed: (async_state & 0x8000u16 as i16) != 0,
        was_pressed: (async_state & 0x0001) != 0,
        keyboard_state: u32::from(kb_state),
        kb_state_pressed: (kb_state & 0x80) != 0,
    })
}

#[napi(js_name = "isKeyPressedAlt")]
pub fn is_key_pressed_alt(key_code: u32) -> Result<bool> {
    initialize_key(key_code)?;
    unsafe {
        let _ = GetAsyncKeyState(key_code as i32);
        Sleep(1);
        Ok((GetAsyncKeyState(key_code as i32) & 0x8000u16 as i16) != 0)
    }
}

fn initialize_global_key_states() {
    init_dpi_awareness();
    INIT_ONCE.call_once(|| unsafe {
        for key_code in 0..=255 {
            let _ = GetAsyncKeyState(key_code);
        }
        Sleep(10);
    });
}

fn initialize_key(key_code: u32) -> Result<()> {
    initialize_global_key_states();
    let mut initialized = INITIALIZED_KEYS
        .lock()
        .map_err(|_| error("Keyboard state mutex poisoned"))?;
    if initialized.insert(key_code) {
        unsafe {
            let _ = GetAsyncKeyState(key_code as i32);
            Sleep(1);
        }
    }
    Ok(())
}
