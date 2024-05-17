#include <napi.h>
#include <iostream>
#include <windows.h>
#include <vector>
#include <thread>
#include <chrono>
#include <fstream>
#include <cmath>
#include <map>
#include <algorithm>
#include <optional>
#include <deque>

#include <algorithm> // For std::transform
#include <stdint.h>  // For uint32_t

HWND FindWindowByTitle(const std::string& title) {
    HWND hwnd = FindWindowA(NULL, title.c_str());
    if (hwnd == NULL) {
        std::cout << "Window not found: " << title << std::endl;
    }
    return hwnd;
}

Napi::Buffer<uint32_t> getWindowPixels(const Napi::CallbackInfo& info, const std::string& windowTitle, int x, int y, int width, int height) {
    Napi::Env env = info.Env();
    
    HWND hwnd = FindWindowByTitle(windowTitle);
    if (hwnd == NULL) {
        throw Napi::Error::New(env, "Window not found");
    }
    
    HDC const hDc = GetDC(hwnd);
    HDC const hDcmem = CreateCompatibleDC(hDc);
    HBITMAP const hBmp = CreateCompatibleBitmap(hDc, x + width, y + height);
    SelectObject(hDcmem, hBmp);
    
    // We have to use PrintWindow here, because BitBlt doesn't work for background windows
    if (!PrintWindow(hwnd, hDcmem, PW_RENDERFULLCONTENT)) {
        throw Napi::Error::New(env, "PrintWindow failed");
    }
    
    BITMAPINFO bmi{};
    bmi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    bmi.bmiHeader.biWidth = x + width;
    bmi.bmiHeader.biHeight = -(y + height); // fuck you fuck you fuck you
    bmi.bmiHeader.biPlanes = 1;
    bmi.bmiHeader.biBitCount = 32;
    bmi.bmiHeader.biCompression = BI_RGB;

    // Create a buffer to hold the entire captured image
    std::vector<uint32_t> fullImageData((x + width) * (y + height));
    if (!GetDIBits(hDcmem, hBmp, 0, y + height, fullImageData.data(), &bmi, DIB_RGB_COLORS)) {
        throw Napi::Error::New(env, "GetDIBits failed");
    }

    // Create a buffer to hold the requested portion of the image
    Napi::Buffer<uint32_t> buffer = Napi::Buffer<uint32_t>::New(env, width * height);
    uint32_t* imageData = buffer.Data();

    // Copy the relevant portion of the image data, taking stride into account
	// This wouldn't be necessary, if we just used BitBlt -- but that doesn't work for background windows.
    int fullStride = x + width;
    for (int row = 0; row < height; ++row) {
        for (int col = 0; col < width; ++col) {
            int srcIndex = (row + y) * fullStride + (col + x);
            int destIndex = row * width + col;
            imageData[destIndex] = fullImageData[srcIndex];
        }
    }

    // We are given BGRA format, so we must swap it ourselves
    for (int i = 0; i < width * height; i++) {
        uint32_t pixel = imageData[i];
        uint32_t r = (pixel & 0x00FF0000) >> 16;
        uint32_t b = (pixel & 0x000000FF) << 16;
        imageData[i] = (pixel & 0xFF00FF00) | r | b;
    }

    DeleteObject(hBmp);
    DeleteDC(hDcmem);
    ReleaseDC(hwnd, hDc);

    return buffer;
}

Napi::Value GetWindowPixelsMain(const Napi::CallbackInfo& info) {
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_SYSTEM_AWARE);
    Napi::Env env = info.Env();

    // Expecting 5 parameters: windowTitle, x, y, width, height
    if (info.Length() != 5) {
        throw Napi::TypeError::New(env, "Expected 5 arguments");
    }

    std::string windowTitle = info[0].As<Napi::String>().Utf8Value();
    int x = info[1].As<Napi::Number>().Int32Value();
    int y = info[2].As<Napi::Number>().Int32Value();
    int width = info[3].As<Napi::Number>().Int32Value();
    int height = info[4].As<Napi::Number>().Int32Value();
    
    auto colors = getWindowPixels(info, windowTitle, x, y, width, height);

    return colors;
}


Napi::Buffer<uint32_t> getScreenPixels(const Napi::CallbackInfo& info, int x, int y, int width, int height) {
    Napi::Env env = info.Env();
    
    HWND hwnd = GetDesktopWindow(); // todo questionmark this hsouldn't be the issue but maybe?
	// https://github.com/Lawlzer/macros/blob/f8205121cc21534d1eb9c49f7d193d49d67915b1/src/cpp/getScreenPixels/index.cpp

    if (hwnd == NULL) {
        throw Napi::Error::New(env, "Window not found");
    }
    
    HDC const hDc = GetDC(hwnd);
    HDC const hDcmem = CreateCompatibleDC(hDc);
    HBITMAP const hBmp = CreateCompatibleBitmap(hDc, width, height);
    SelectObject(hDcmem, hBmp);
      
    BITMAPINFO bmi{};
    bmi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    bmi.bmiHeader.biWidth = width;
    bmi.bmiHeader.biHeight = -height; // fuck you fuck you fuck you fuck you
    bmi.bmiHeader.biPlanes = 1;
    bmi.bmiHeader.biBitCount = 32;
    bmi.bmiHeader.biCompression = BI_RGB;

	Napi::Buffer<uint32_t> buffer = Napi::Buffer<uint32_t>::New(env, width * height);
    uint32_t* imageData = buffer.Data();

    BitBlt(hDcmem, 0, 0, width, height, hDc, x, y, SRCCOPY);

    if (!GetDIBits(hDcmem, hBmp, 0, height, imageData, &bmi, DIB_RGB_COLORS)) {
        throw Napi::Error::New(env, "GetDIBits failed");
    }

	// We are given BGRA format, so we must swap it ourselves
    for (int i = 0; i < width * height; i++) {
        uint32_t pixel = imageData[i];
        uint32_t r = (pixel & 0x00FF0000) >> 16;
        uint32_t b = (pixel & 0x000000FF) << 16;
        imageData[i] = (pixel & 0xFF00FF00) | r | b;
    }

    DeleteObject(hBmp);
    DeleteDC(hDcmem);
    ReleaseDC(hwnd, hDc);

    return buffer;
}

Napi::Value GetScreenPixelsMain(const Napi::CallbackInfo& info) {
	SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_SYSTEM_AWARE);
    Napi::Env env = info.Env();

    if (info.Length() != 4) {
        throw Napi::TypeError::New(env, "Expected 4 arguments");
    }

    int x = info[0].As<Napi::Number>().Int32Value();
    int y = info[1].As<Napi::Number>().Int32Value();
    int width = info[2].As<Napi::Number>().Int32Value();
    int height = info[3].As<Napi::Number>().Int32Value();
    
    auto colors = getScreenPixels(info, x, y, width, height);

    return colors;
}


Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "getWindowPixels"),
                Napi::Function::New(env, GetWindowPixelsMain));
    exports.Set(Napi::String::New(env, "getScreenPixels"),
                Napi::Function::New(env, GetScreenPixelsMain));
    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)

