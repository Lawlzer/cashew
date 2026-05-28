use std::ptr::null_mut;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Mutex;
use std::thread;

use napi::Result;
use napi_derive::napi;
use once_cell::sync::Lazy;
use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleA;
use windows_sys::Win32::System::Threading::{GetCurrentProcess, Sleep, TerminateProcess};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, SetWindowsHookExA, TranslateMessage,
    UnhookWindowsHookEx, HC_ACTION, HHOOK, KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WM_KEYDOWN,
};

use crate::common::{error, init_dpi_awareness, run_blocking};

static PANIC_ACTIVE: AtomicBool = AtomicBool::new(false);
static PANIC_KEY_CODE: AtomicU32 = AtomicU32::new(0);
static PANIC_HOOK: Lazy<Mutex<isize>> = Lazy::new(|| Mutex::new(0));

#[napi(js_name = "enablePanicShutdown")]
pub async fn enable_panic_shutdown(key_code: u32, key_name: String) -> Result<bool> {
    run_blocking(move || enable_panic_shutdown_impl(key_code, key_name)).await
}

fn enable_panic_shutdown_impl(key_code: u32, key_name: String) -> Result<bool> {
    init_dpi_awareness();
    if PANIC_ACTIVE.load(Ordering::SeqCst) {
        return Ok(true);
    }

    PANIC_KEY_CODE.store(key_code, Ordering::SeqCst);
    PANIC_ACTIVE.store(true, Ordering::SeqCst);
    thread::spawn(move || panic_hook_loop(key_name));
    std::thread::sleep(std::time::Duration::from_millis(50));

    if !PANIC_ACTIVE.load(Ordering::SeqCst) {
        return Err(error("Failed to start panic shutdown hook"));
    }
    Ok(true)
}

fn panic_hook_loop(key_name: String) {
    unsafe {
        let hook = SetWindowsHookExA(
            WH_KEYBOARD_LL,
            Some(panic_keyboard_proc),
            GetModuleHandleA(std::ptr::null()),
            0,
        );
        if hook.is_null() {
            PANIC_ACTIVE.store(false, Ordering::SeqCst);
            return;
        }
        if let Ok(mut stored) = PANIC_HOOK.lock() {
            *stored = hook as isize;
        }

        eprintln!("Panic shutdown native hook active for key: {key_name}");
        let mut msg: MSG = std::mem::zeroed();
        while PANIC_ACTIVE.load(Ordering::SeqCst) && GetMessageW(&mut msg, null_mut(), 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }

        UnhookWindowsHookEx(hook);
        if let Ok(mut stored) = PANIC_HOOK.lock() {
            *stored = 0;
        }
    }
}

unsafe extern "system" fn panic_keyboard_proc(
    n_code: i32,
    w_param: WPARAM,
    l_param: LPARAM,
) -> LRESULT {
    if n_code == HC_ACTION as i32 && w_param == WM_KEYDOWN as WPARAM {
        let keyboard = &*(l_param as *const KBDLLHOOKSTRUCT);
        if keyboard.vkCode == PANIC_KEY_CODE.load(Ordering::SeqCst) {
            eprintln!("Panic shutdown key pressed. Terminating process.");
            Sleep(50);
            TerminateProcess(GetCurrentProcess(), 1);
        }
    }

    let hook = PANIC_HOOK
        .lock()
        .ok()
        .map_or(std::ptr::null_mut(), |hook| *hook as HHOOK);
    CallNextHookEx(hook, n_code, w_param, l_param)
}
