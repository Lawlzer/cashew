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
        std::cout << "Window not found" << std::endl;
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
    HBITMAP const hBmp = CreateCompatibleBitmap(hDc, width, height);
    SelectObject(hDcmem, hBmp);
      
    BITMAPINFO bmi{};
    bmi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    bmi.bmiHeader.biWidth = width;
    bmi.bmiHeader.biHeight = -height; // Negative to indicate a top-down DIB
    bmi.bmiHeader.biPlanes = 1;
    bmi.bmiHeader.biBitCount = 32;
    bmi.bmiHeader.biCompression = BI_RGB;

    Napi::Buffer<uint32_t> buffer = Napi::Buffer<uint32_t>::New(env, width * height);
    uint32_t* imageData = buffer.Data();

    // Use PrintWindow to capture the window content even if it's in the background
    if (!PrintWindow(hwnd, hDcmem, PW_RENDERFULLCONTENT)) {
        throw Napi::Error::New(env, "PrintWindow failed");
    }

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

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "getScreenPixels"),
                Napi::Function::New(env, GetScreenPixelsMain));
    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)