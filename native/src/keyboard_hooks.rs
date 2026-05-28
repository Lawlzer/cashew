use std::collections::{HashMap, HashSet};
use std::ptr::null_mut;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};

use napi::bindgen_prelude::Function;
use napi::threadsafe_function::{
    ThreadsafeCallContext, ThreadsafeFunction, ThreadsafeFunctionCallMode,
};
use napi::{Result, Status};
use napi_derive::napi;
use once_cell::sync::Lazy;
use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleA;
use windows_sys::Win32::System::Threading::GetCurrentThreadId;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, PostThreadMessageW, SetWindowsHookExA,
    TranslateMessage, UnhookWindowsHookEx, HC_ACTION, HHOOK, KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL,
    WM_KEYDOWN, WM_KEYUP, WM_QUIT, WM_SYSKEYDOWN, WM_SYSKEYUP,
};

use crate::common::{error, init_dpi_awareness};

static HOOK_STATE: Lazy<Mutex<KeyboardHookState>> =
    Lazy::new(|| Mutex::new(KeyboardHookState::default()));
static HOOK_ACTIVE: AtomicBool = AtomicBool::new(false);
static NEXT_LISTENER_ID: AtomicU32 = AtomicU32::new(1);

#[napi(object)]
#[derive(Clone)]
pub struct NativeKeyEvent {
    pub key_code: u32,
    pub timestamp: u32,
}

#[napi(object)]
pub struct KeyListenerOptions {
    pub trigger_once: Option<bool>,
}

struct CallbackInfo {
    tsfn: Arc<ThreadsafeFunction<NativeKeyEvent, (), NativeKeyEvent, Status, false>>,
    key_codes: Vec<u32>,
    trigger_once: bool,
    key_states: HashSet<u32>,
}

#[derive(Default)]
struct KeyboardHookState {
    callbacks: HashMap<u32, CallbackInfo>,
    hook: isize,
    hook_thread_id: u32,
    hook_thread: Option<JoinHandle<()>>,
}

#[napi(js_name = "registerKeyListener")]
pub fn register_key_listener(
    key_codes: Vec<u32>,
    callback: Function<NativeKeyEvent, ()>,
    options: KeyListenerOptions,
) -> Result<u32> {
    init_dpi_awareness();
    let tsfn = callback
        .build_threadsafe_function()
        .build_callback(|ctx: ThreadsafeCallContext<NativeKeyEvent>| Ok(ctx.value))?;

    let id = NEXT_LISTENER_ID.fetch_add(1, Ordering::Relaxed);
    {
        let mut state = HOOK_STATE
            .lock()
            .map_err(|_| error("Keyboard hook mutex poisoned"))?;
        state.callbacks.insert(
            id,
            CallbackInfo {
                tsfn: Arc::new(tsfn),
                key_codes,
                trigger_once: options.trigger_once.unwrap_or(true),
                key_states: HashSet::new(),
            },
        );
    }

    ensure_hook_started()?;
    Ok(id)
}

#[napi(js_name = "unregisterKeyListener")]
pub fn unregister_key_listener(id: u32) -> Result<()> {
    let mut state = HOOK_STATE
        .lock()
        .map_err(|_| error("Keyboard hook mutex poisoned"))?;
    state.callbacks.remove(&id);
    Ok(())
}

#[napi(js_name = "stopAllKeyboardHooks")]
pub fn stop_all_keyboard_hooks() -> Result<()> {
    let thread = {
        let mut state = HOOK_STATE
            .lock()
            .map_err(|_| error("Keyboard hook mutex poisoned"))?;
        state.callbacks.clear();
        let thread_id = state.hook_thread_id;
        if HOOK_ACTIVE.swap(false, Ordering::SeqCst) && thread_id != 0 {
            unsafe {
                let _ = PostThreadMessageW(thread_id, WM_QUIT, 0, 0);
            }
        }
        state.hook_thread_id = 0;
        state.hook_thread.take()
    };

    if let Some(thread) = thread {
        let _ = thread.join();
    }

    Ok(())
}

fn ensure_hook_started() -> Result<()> {
    if HOOK_ACTIVE.load(Ordering::SeqCst) {
        return Ok(());
    }

    HOOK_ACTIVE.store(true, Ordering::SeqCst);
    let handle = thread::spawn(hook_message_loop);
    {
        let mut state = HOOK_STATE
            .lock()
            .map_err(|_| error("Keyboard hook mutex poisoned"))?;
        state.hook_thread = Some(handle);
    }
    std::thread::sleep(std::time::Duration::from_millis(50));

    if !HOOK_ACTIVE.load(Ordering::SeqCst) {
        return Err(error("Failed to start keyboard hook"));
    }
    Ok(())
}

fn hook_message_loop() {
    unsafe {
        let hook = SetWindowsHookExA(
            WH_KEYBOARD_LL,
            Some(low_level_keyboard_proc),
            GetModuleHandleA(std::ptr::null()),
            0,
        );
        if hook.is_null() {
            HOOK_ACTIVE.store(false, Ordering::SeqCst);
            return;
        }

        if let Ok(mut state) = HOOK_STATE.lock() {
            state.hook = hook as isize;
            state.hook_thread_id = GetCurrentThreadId();
        }

        let mut msg: MSG = std::mem::zeroed();
        while HOOK_ACTIVE.load(Ordering::SeqCst) && GetMessageW(&mut msg, null_mut(), 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }

        UnhookWindowsHookEx(hook);
        if let Ok(mut state) = HOOK_STATE.lock() {
            state.hook = 0;
            state.hook_thread_id = 0;
        }
    }
}

unsafe extern "system" fn low_level_keyboard_proc(
    n_code: i32,
    w_param: WPARAM,
    l_param: LPARAM,
) -> LRESULT {
    if n_code == HC_ACTION as i32 {
        let keyboard = &*(l_param as *const KBDLLHOOKSTRUCT);
        let key_code = keyboard.vkCode;
        let is_key_down = w_param == WM_KEYDOWN as WPARAM || w_param == WM_SYSKEYDOWN as WPARAM;
        let is_key_up = w_param == WM_KEYUP as WPARAM || w_param == WM_SYSKEYUP as WPARAM;

        if is_key_down || is_key_up {
            if let Ok(mut state) = HOOK_STATE.lock() {
                for callback in state.callbacks.values_mut() {
                    let should_trigger =
                        callback.key_codes.is_empty() || callback.key_codes.contains(&key_code);
                    if should_trigger && is_key_down {
                        if callback.trigger_once && !callback.key_states.insert(key_code) {
                            continue;
                        }
                        callback.tsfn.call(
                            NativeKeyEvent {
                                key_code,
                                timestamp: keyboard.time,
                            },
                            ThreadsafeFunctionCallMode::NonBlocking,
                        );
                    } else if should_trigger && is_key_up && callback.trigger_once {
                        callback.key_states.remove(&key_code);
                    }
                }
            }
        }
    }

    let hook = HOOK_STATE
        .lock()
        .ok()
        .map_or(std::ptr::null_mut(), |state| state.hook as HHOOK);
    CallNextHookEx(hook, n_code, w_param, l_param)
}
