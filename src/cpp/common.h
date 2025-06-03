#ifndef CASHEW_COMMON_H
#define CASHEW_COMMON_H

#include <napi.h>
#include <windows.h>
#include <memory>
#include <string>

namespace cashew {

// RAII wrapper for HDC
class DcHandle {
private:
    HDC hdc_;
    HWND hwnd_;
public:
    DcHandle(HWND hwnd) : hwnd_(hwnd), hdc_(GetDC(hwnd)) {}
    ~DcHandle() { if (hdc_) ReleaseDC(hwnd_, hdc_); }
    operator HDC() const { return hdc_; }
    HDC get() const { return hdc_; }
    DcHandle(const DcHandle&) = delete;
    DcHandle& operator=(const DcHandle&) = delete;
};

// RAII wrapper for HDC created with CreateCompatibleDC
class CompatibleDcHandle {
private:
    HDC hdc_;
public:
    explicit CompatibleDcHandle(HDC sourceDc) : hdc_(CreateCompatibleDC(sourceDc)) {}
    ~CompatibleDcHandle() { if (hdc_) DeleteDC(hdc_); }
    operator HDC() const { return hdc_; }
    HDC get() const { return hdc_; }
    CompatibleDcHandle(const CompatibleDcHandle&) = delete;
    CompatibleDcHandle& operator=(const CompatibleDcHandle&) = delete;
};

// RAII wrapper for HBITMAP
class BitmapHandle {
private:
    HBITMAP hbmp_;
public:
    BitmapHandle(HDC hdc, int width, int height) 
        : hbmp_(CreateCompatibleBitmap(hdc, width, height)) {}
    ~BitmapHandle() { if (hbmp_) DeleteObject(hbmp_); }
    operator HBITMAP() const { return hbmp_; }
    HBITMAP get() const { return hbmp_; }
    BitmapHandle(const BitmapHandle&) = delete;
    BitmapHandle& operator=(const BitmapHandle&) = delete;
};

// Initialize DPI awareness once
class DpiInitializer {
public:
    static void Initialize() {
        static bool initialized = false;
        if (!initialized) {
            SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_SYSTEM_AWARE);
            initialized = true;
        }
    }
};

// Convert BGRA to RGBA in-place
inline void ConvertBGRAtoRGBA(uint32_t* pixels, size_t count) {
    for (size_t i = 0; i < count; ++i) {
        uint32_t pixel = pixels[i];
        uint32_t r = (pixel & 0x00FF0000) >> 16;
        uint32_t b = (pixel & 0x000000FF) << 16;
        pixels[i] = (pixel & 0xFF00FF00) | r | b;
    }
}

// Common error handling
inline void ThrowWindowsError(const Napi::Env& env, const std::string& message) {
    DWORD error = GetLastError();
    std::string fullMessage = message + " (Error: " + std::to_string(error) + ")";
    Napi::Error::New(env, fullMessage).ThrowAsJavaScriptException();
}

// Find window with error handling
inline HWND FindWindowSafe(const Napi::Env& env, const std::string& title) {
    HWND hwnd = FindWindowA(NULL, title.c_str());
    if (hwnd == NULL) {
        Napi::Error::New(env, "Window not found: " + title).ThrowAsJavaScriptException();
    }
    return hwnd;
}

} // namespace cashew

// Module initialization macro
#define CASHEW_MODULE_INIT(name, initFunc) \
    Napi::Object CashewInit##name(Napi::Env env, Napi::Object exports) { \
        cashew::DpiInitializer::Initialize(); \
        return initFunc(env, exports); \
    } \
    NODE_API_MODULE(name, CashewInit##name)

#endif // CASHEW_COMMON_H 