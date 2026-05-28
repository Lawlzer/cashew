use napi::Result;
use napi_derive::napi;
use windows_sys::Win32::Foundation::{LPARAM, POINT, WPARAM};
use windows_sys::Win32::Graphics::Gdi::ClientToScreen;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
    MOUSEEVENTF_MOVE, MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP, MOUSEINPUT,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, PostMessageA, SendMessageA, SetCursorPos, WM_LBUTTONDOWN, WM_LBUTTONUP,
};

use crate::common::{
    calculate_steps, ease_in_out_cubic, error, find_window, init_dpi_awareness, run_blocking,
    sleep_ms,
};

#[napi(object)]
pub struct MousePosition {
    pub x: i32,
    pub y: i32,
}

#[napi(js_name = "clickMessage")]
pub async fn click_message(
    x: i32,
    y: i32,
    hold_for: u32,
    window_title: String,
    message_type: String,
) -> Result<()> {
    run_blocking(move || click_message_impl(x, y, hold_for, &window_title, &message_type)).await
}

#[napi(js_name = "getPosition")]
pub async fn get_position() -> Result<MousePosition> {
    run_blocking(get_position_impl).await
}

#[napi(js_name = "hold")]
pub async fn hold(x: Option<i32>, y: Option<i32>, button: String) -> Result<()> {
    run_blocking(move || hold_impl(x, y, &button)).await
}

#[napi(js_name = "release")]
pub async fn release(_x: Option<i32>, _y: Option<i32>, button: String) -> Result<()> {
    run_blocking(move || release_impl(&button)).await
}

#[napi(js_name = "click")]
pub async fn click(
    x: Option<i32>,
    y: Option<i32>,
    button: String,
    hold_for: u32,
    window_title: Option<String>,
) -> Result<()> {
    run_blocking(move || click_impl(x, y, &button, hold_for, window_title.unwrap_or_default()))
        .await
}

#[napi(js_name = "moveRelative")]
pub async fn move_relative(
    dx: i32,
    dy: i32,
    smooth_duration: i32,
    use_raw_input: bool,
) -> Result<()> {
    run_blocking(move || move_relative_impl(dx, dy, smooth_duration, use_raw_input)).await
}

#[napi(js_name = "moveRelativePolar")]
pub async fn move_relative_polar(
    angle: f64,
    distance: f64,
    smooth_duration: i32,
    use_raw_input: bool,
) -> Result<()> {
    run_blocking(move || {
        let radians = angle.to_radians();
        let dx = (distance * radians.cos()) as i32;
        let dy = -(distance * radians.sin()) as i32;
        move_relative_impl(dx, dy, smooth_duration, use_raw_input)
    })
    .await
}

#[napi(js_name = "setPosition")]
pub async fn set_position(
    x: i32,
    y: i32,
    smooth_duration: i32,
    window_title: Option<String>,
) -> Result<()> {
    run_blocking(move || set_position_impl(x, y, smooth_duration, window_title.unwrap_or_default()))
        .await
}

fn click_message_impl(
    x: i32,
    y: i32,
    hold_for: u32,
    window_title: &str,
    message_type: &str,
) -> Result<()> {
    init_dpi_awareness();
    if window_title.is_empty() {
        return Err(error("windowTitle is required"));
    }
    let hwnd = find_window(window_title)?;
    let lparam = point_lparam(x, y);

    unsafe {
        if message_type == "post" {
            let _ = PostMessageA(hwnd, WM_LBUTTONDOWN, 1 as WPARAM, lparam);
            sleep_ms(hold_for as i32);
            let _ = PostMessageA(hwnd, WM_LBUTTONUP, 0, lparam);
        } else {
            SendMessageA(hwnd, WM_LBUTTONDOWN, 1 as WPARAM, lparam);
            sleep_ms(hold_for as i32);
            SendMessageA(hwnd, WM_LBUTTONUP, 0, lparam);
        }
    }
    Ok(())
}

fn get_position_impl() -> Result<MousePosition> {
    init_dpi_awareness();
    let mut point = POINT { x: 0, y: 0 };
    if unsafe { GetCursorPos(&mut point) } == 0 {
        return Err(error("Failed to get cursor position"));
    }
    Ok(MousePosition {
        x: point.x,
        y: point.y,
    })
}

fn hold_impl(x: Option<i32>, y: Option<i32>, button: &str) -> Result<()> {
    init_dpi_awareness();
    if let (Some(x), Some(y)) = (x, y) {
        unsafe {
            let _ = SetCursorPos(x, y);
        }
    }
    send_mouse_button(button, true);
    Ok(())
}

fn release_impl(button: &str) -> Result<()> {
    init_dpi_awareness();
    send_mouse_button(button, false);
    Ok(())
}

fn click_impl(
    x: Option<i32>,
    y: Option<i32>,
    button: &str,
    hold_for: u32,
    window_title: String,
) -> Result<()> {
    init_dpi_awareness();
    if !window_title.is_empty() {
        let hwnd = find_window(&window_title)?;
        let (x, y) = match (x, y) {
            (Some(x), Some(y)) => (x, y),
            _ => return Err(error("x and y are required when windowTitle is provided")),
        };
        let mut point = POINT { x, y };
        unsafe {
            if ClientToScreen(hwnd, &mut point) == 0 {
                return Err(error("ClientToScreen failed"));
            }
            let _ = SetCursorPos(point.x, point.y);
        }
    } else if let (Some(x), Some(y)) = (x, y) {
        unsafe {
            let _ = SetCursorPos(x, y);
        }
    }

    send_mouse_button(button, true);
    sleep_ms(hold_for as i32);
    send_mouse_button(button, false);
    Ok(())
}

fn move_relative_impl(dx: i32, dy: i32, smooth_duration: i32, use_raw_input: bool) -> Result<()> {
    init_dpi_awareness();
    let duration = smooth_duration.max(0);
    if duration == 0 {
        return move_relative_step(dx, dy, use_raw_input);
    }

    let steps = calculate_steps(duration);
    let delay = duration / steps;
    let mut last_x = 0;
    let mut last_y = 0;
    let start = if use_raw_input {
        None
    } else {
        Some(get_position_impl()?)
    };

    for step in 1..=steps {
        let t = f64::from(step) / f64::from(steps);
        let eased = ease_in_out_cubic(t);
        let current_x = (f64::from(dx) * eased) as i32;
        let current_y = (f64::from(dy) * eased) as i32;

        if use_raw_input {
            move_relative_step(current_x - last_x, current_y - last_y, true)?;
        } else if let Some(start) = &start {
            unsafe {
                let _ = SetCursorPos(start.x + current_x, start.y + current_y);
            }
        }

        last_x = current_x;
        last_y = current_y;
        sleep_ms(delay);
    }
    Ok(())
}

fn set_position_impl(x: i32, y: i32, smooth_duration: i32, window_title: String) -> Result<()> {
    init_dpi_awareness();
    let mut target = POINT { x, y };
    if !window_title.is_empty() {
        let hwnd = find_window(&window_title)?;
        unsafe {
            if ClientToScreen(hwnd, &mut target) == 0 {
                return Err(error("ClientToScreen failed"));
            }
        }
    }

    let duration = smooth_duration.max(0);
    if duration == 0 {
        unsafe {
            let _ = SetCursorPos(target.x, target.y);
        }
        return Ok(());
    }

    let start = get_position_impl()?;
    let steps = calculate_steps(duration);
    let delay = duration / steps;
    for step in 1..=steps {
        let t = f64::from(step) / f64::from(steps);
        let eased = ease_in_out_cubic(t);
        let current_x = f64::from(start.x) + f64::from(target.x - start.x) * eased;
        let current_y = f64::from(start.y) + f64::from(target.y - start.y) * eased;
        unsafe {
            let _ = SetCursorPos(current_x as i32, current_y as i32);
        }
        sleep_ms(delay);
    }
    Ok(())
}

fn send_mouse_button(button: &str, down: bool) -> bool {
    let flags = if button == "right" {
        if down {
            MOUSEEVENTF_RIGHTDOWN
        } else {
            MOUSEEVENTF_RIGHTUP
        }
    } else if down {
        MOUSEEVENTF_LEFTDOWN
    } else {
        MOUSEEVENTF_LEFTUP
    };
    send_mouse(flags, 0, 0)
}

fn move_relative_step(dx: i32, dy: i32, use_raw_input: bool) -> Result<()> {
    if use_raw_input {
        send_mouse(MOUSEEVENTF_MOVE, dx, dy);
    } else {
        let pos = get_position_impl()?;
        unsafe {
            let _ = SetCursorPos(pos.x + dx, pos.y + dy);
        }
    }
    Ok(())
}

fn send_mouse(flags: u32, dx: i32, dy: i32) -> bool {
    let input = INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx,
                dy,
                mouseData: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    unsafe { SendInput(1, &input, std::mem::size_of::<INPUT>() as i32) == 1 }
}

fn point_lparam(x: i32, y: i32) -> LPARAM {
    ((y & 0xFFFF) << 16 | (x & 0xFFFF)) as LPARAM
}
