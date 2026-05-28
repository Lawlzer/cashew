use napi::bindgen_prelude::Buffer;
use napi::Result;
use napi_derive::napi;
use windows_sys::Win32::Graphics::Gdi::{
    BitBlt, GetDIBits, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ, RGBQUAD,
    SRCCOPY,
};
use windows_sys::Win32::Storage::Xps::PrintWindow;
use windows_sys::Win32::UI::WindowsAndMessaging::GetDesktopWindow;

use crate::common::{
    error, find_window, init_dpi_awareness, is_null_handle, run_blocking, Bitmap, CompatibleDc,
    SelectGuard, WindowDc,
};

const PW_RENDERFULLCONTENT: u32 = 0x0000_0002;

#[napi(js_name = "getWindowPixels")]
pub async fn get_window_pixels(
    window_title: String,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<Buffer> {
    run_blocking(move || capture_window_pixels(&window_title, x, y, width, height)).await
}

#[napi(js_name = "getScreenPixels")]
pub async fn get_screen_pixels(x: i32, y: i32, width: i32, height: i32) -> Result<Buffer> {
    run_blocking(move || capture_screen_pixels(x, y, width, height)).await
}

fn capture_window_pixels(
    window_title: &str,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<Buffer> {
    init_dpi_awareness();
    validate_region(width, height)?;
    if x < 0 || y < 0 {
        return Err(error("Window capture x and y must be non-negative"));
    }

    let hwnd = find_window(window_title)?;
    let dc = WindowDc::new(hwnd)?;
    let mem_dc = CompatibleDc::new(dc.get())?;
    let bmp_width = x + width;
    let bmp_height = y + height;
    if bmp_width <= 0 || bmp_height <= 0 {
        return Err(error("Invalid capture dimensions"));
    }

    let bitmap = Bitmap::new(dc.get(), bmp_width, bmp_height)?;
    let _select = SelectGuard::new(mem_dc.get(), bitmap.get() as HGDIOBJ)?;

    if unsafe { PrintWindow(hwnd, mem_dc.get(), PW_RENDERFULLCONTENT) } == 0 {
        return Err(error("PrintWindow failed"));
    }

    let mut full = vec![0u32; (bmp_width * bmp_height) as usize];
    read_bitmap(mem_dc.get(), bitmap.get(), bmp_width, bmp_height, &mut full)?;

    let mut pixels = vec![0u32; (width * height) as usize];
    for row in 0..height {
        for col in 0..width {
            let src = ((row + y) * bmp_width + (col + x)) as usize;
            let dst = (row * width + col) as usize;
            pixels[dst] = full[src];
        }
    }

    convert_bgra_to_rgba(&mut pixels);
    Ok(u32_pixels_to_buffer(pixels))
}

fn capture_screen_pixels(x: i32, y: i32, width: i32, height: i32) -> Result<Buffer> {
    init_dpi_awareness();
    validate_region(width, height)?;
    let hwnd = unsafe { GetDesktopWindow() };
    if is_null_handle(hwnd) {
        return Err(error("Failed to get desktop window"));
    }

    let dc = WindowDc::new(hwnd)?;
    let mem_dc = CompatibleDc::new(dc.get())?;
    let bitmap = Bitmap::new(dc.get(), width, height)?;
    let _select = SelectGuard::new(mem_dc.get(), bitmap.get() as HGDIOBJ)?;

    if unsafe { BitBlt(mem_dc.get(), 0, 0, width, height, dc.get(), x, y, SRCCOPY) } == 0 {
        return Err(error("BitBlt failed"));
    }

    let mut pixels = vec![0u32; (width * height) as usize];
    read_bitmap(mem_dc.get(), bitmap.get(), width, height, &mut pixels)?;
    convert_bgra_to_rgba(&mut pixels);
    Ok(u32_pixels_to_buffer(pixels))
}

fn validate_region(width: i32, height: i32) -> Result<()> {
    if width <= 0 || height <= 0 {
        return Err(error("width and height must be positive"));
    }
    Ok(())
}

fn read_bitmap(
    hdc: windows_sys::Win32::Graphics::Gdi::HDC,
    bitmap: windows_sys::Win32::Graphics::Gdi::HBITMAP,
    width: i32,
    height: i32,
    pixels: &mut [u32],
) -> Result<()> {
    let mut info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            biHeight: -height,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB,
            biSizeImage: 0,
            biXPelsPerMeter: 0,
            biYPelsPerMeter: 0,
            biClrUsed: 0,
            biClrImportant: 0,
        },
        bmiColors: [RGBQUAD {
            rgbBlue: 0,
            rgbGreen: 0,
            rgbRed: 0,
            rgbReserved: 0,
        }],
    };

    let read = unsafe {
        GetDIBits(
            hdc,
            bitmap,
            0,
            height as u32,
            pixels.as_mut_ptr().cast(),
            &mut info,
            DIB_RGB_COLORS,
        )
    };
    if read == 0 {
        return Err(error("GetDIBits failed"));
    }
    Ok(())
}

fn convert_bgra_to_rgba(pixels: &mut [u32]) {
    for pixel in pixels {
        let value = *pixel;
        let r = (value & 0x00FF0000) >> 16;
        let b = (value & 0x000000FF) << 16;
        *pixel = (value & 0xFF00FF00) | r | b;
    }
}

fn u32_pixels_to_buffer(pixels: Vec<u32>) -> Buffer {
    let mut bytes = Vec::with_capacity(pixels.len() * 4);
    for pixel in pixels {
        bytes.extend_from_slice(&pixel.to_ne_bytes());
    }
    bytes.into()
}
