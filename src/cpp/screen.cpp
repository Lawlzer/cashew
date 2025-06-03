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

#include "common.h"

using namespace cashew;

HWND FindWindowByTitle(const std::string& title) {
    HWND hwnd = FindWindowA(NULL, title.c_str());
    if (hwnd == NULL) {
        std::cout << "Window not found: " << title << std::endl;
    }
    return hwnd;
}

// Helper function to capture pixels from a specific area
Napi::Buffer<uint32_t> CapturePixels(const Napi::CallbackInfo& info, HWND hwnd, 
                                     int x, int y, int width, int height, 
                                     bool useWindowCapture) {
    Napi::Env env = info.Env();
    
    DcHandle hDc(hwnd);
    if (!hDc.get()) {
        ThrowWindowsError(env, "Failed to get device context");
        return Napi::Buffer<uint32_t>::New(env, 0);
    }
    
    CompatibleDcHandle hDcMem(hDc);
    if (!hDcMem.get()) {
        ThrowWindowsError(env, "Failed to create compatible DC");
        return Napi::Buffer<uint32_t>::New(env, 0);
    }
    
    // Create bitmap with appropriate size
    int bmpWidth = useWindowCapture ? (x + width) : width;
    int bmpHeight = useWindowCapture ? (y + height) : height;
    BitmapHandle hBmp(hDc, bmpWidth, bmpHeight);
    if (!hBmp.get()) {
        ThrowWindowsError(env, "Failed to create bitmap");
        return Napi::Buffer<uint32_t>::New(env, 0);
    }
    
    SelectObject(hDcMem, hBmp);
    
    // Capture the screen/window content
    if (useWindowCapture) {
        // Use PrintWindow for background windows
        if (!PrintWindow(hwnd, hDcMem, PW_RENDERFULLCONTENT)) {
            ThrowWindowsError(env, "PrintWindow failed");
            return Napi::Buffer<uint32_t>::New(env, 0);
        }
    } else {
        // Use BitBlt for screen capture
        if (!BitBlt(hDcMem, 0, 0, width, height, hDc, x, y, SRCCOPY)) {
            ThrowWindowsError(env, "BitBlt failed");
            return Napi::Buffer<uint32_t>::New(env, 0);
        }
    }
    
    // Setup bitmap info
    BITMAPINFO bmi{};
    bmi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    bmi.bmiHeader.biWidth = bmpWidth;
    bmi.bmiHeader.biHeight = -bmpHeight; // Top-down bitmap
    bmi.bmiHeader.biPlanes = 1;
    bmi.bmiHeader.biBitCount = 32;
    bmi.bmiHeader.biCompression = BI_RGB;

    // Create buffer for the result
    Napi::Buffer<uint32_t> buffer = Napi::Buffer<uint32_t>::New(env, width * height);
    uint32_t* imageData = buffer.Data();

    if (useWindowCapture) {
        // For window capture, we need to extract the relevant portion
        std::vector<uint32_t> fullImageData(bmpWidth * bmpHeight);
        if (!GetDIBits(hDcMem, hBmp, 0, bmpHeight, fullImageData.data(), &bmi, DIB_RGB_COLORS)) {
            ThrowWindowsError(env, "GetDIBits failed");
            return Napi::Buffer<uint32_t>::New(env, 0);
        }

        // Copy the relevant portion
        for (int row = 0; row < height; ++row) {
            for (int col = 0; col < width; ++col) {
                int srcIndex = (row + y) * bmpWidth + (col + x);
                int destIndex = row * width + col;
                imageData[destIndex] = fullImageData[srcIndex];
            }
        }
    } else {
        // For screen capture, get the data directly
        if (!GetDIBits(hDcMem, hBmp, 0, height, imageData, &bmi, DIB_RGB_COLORS)) {
            ThrowWindowsError(env, "GetDIBits failed");
            return Napi::Buffer<uint32_t>::New(env, 0);
        }
    }

    // Convert BGRA to RGBA
    ConvertBGRAtoRGBA(imageData, width * height);

    return buffer;
}

Napi::Value GetWindowPixels(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Validate arguments
    if (info.Length() != 5) {
        Napi::Error::New(env, "Expected 5 arguments: windowTitle, x, y, width, height")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    if (!info[0].IsString() || !info[1].IsNumber() || !info[2].IsNumber() || 
        !info[3].IsNumber() || !info[4].IsNumber()) {
        Napi::Error::New(env, "Invalid argument types. Expected: string, number, number, number, number")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string windowTitle = info[0].As<Napi::String>().Utf8Value();
    int x = info[1].As<Napi::Number>().Int32Value();
    int y = info[2].As<Napi::Number>().Int32Value();
    int width = info[3].As<Napi::Number>().Int32Value();
    int height = info[4].As<Napi::Number>().Int32Value();
    
    HWND hwnd = FindWindowSafe(env, windowTitle);
    if (!hwnd) return env.Null();
    
    return CapturePixels(info, hwnd, x, y, width, height, true);
}

Napi::Value GetScreenPixels(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Validate arguments
    if (info.Length() != 4) {
        Napi::Error::New(env, "Expected 4 arguments: x, y, width, height")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    if (!info[0].IsNumber() || !info[1].IsNumber() || 
        !info[2].IsNumber() || !info[3].IsNumber()) {
        Napi::Error::New(env, "Invalid argument types. Expected: number, number, number, number")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    int x = info[0].As<Napi::Number>().Int32Value();
    int y = info[1].As<Napi::Number>().Int32Value();
    int width = info[2].As<Napi::Number>().Int32Value();
    int height = info[3].As<Napi::Number>().Int32Value();
    
    HWND hwnd = GetDesktopWindow();
    if (!hwnd) {
        Napi::Error::New(env, "Failed to get desktop window").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    return CapturePixels(info, hwnd, x, y, width, height, false);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "getWindowPixels"),
                Napi::Function::New(env, GetWindowPixels));
    exports.Set(Napi::String::New(env, "getScreenPixels"),
                Napi::Function::New(env, GetScreenPixels));
    return exports;
}

CASHEW_MODULE_INIT(screen, Init)

