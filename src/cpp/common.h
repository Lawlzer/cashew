#ifndef CASHEW_COMMON_H
#define CASHEW_COMMON_H

// Prevent Windows.h from defining min/max macros that conflict with std::min/std::max
#ifndef NOMINMAX
#define NOMINMAX
#endif

#include <napi.h>
#include <windows.h>
#include <memory>
#include <string>
#include <functional>
#include <chrono>
#include <thread>
#include <algorithm>

namespace cashew {

// Common constants to replace magic numbers
namespace constants {
    constexpr int DEFAULT_KEY_DELAY_MS = 50;
    constexpr int DEFAULT_MOUSE_HOLD_MS = 10;
    constexpr int MIN_SMOOTH_STEP_MS = 5;
    constexpr DWORD KEY_PRESSED_MASK = 0x8000;
    
    // Error messages
    constexpr const char* ERR_WINDOW_NOT_FOUND = "Window not found: ";
    constexpr const char* ERR_INVALID_ARGS = "Invalid arguments provided";
    constexpr const char* ERR_SENDINPUT_FAILED = "Failed to send input event";
}

// Base template class for all async workers
template<typename ResultType>
class BaseAsyncWorker : public Napi::AsyncWorker {
protected:
    Napi::Promise::Deferred deferred_;
    
public:
    explicit BaseAsyncWorker(const Napi::Env& env)
        : Napi::AsyncWorker(env), 
          deferred_(Napi::Promise::Deferred::New(env)) {}
    
    virtual ~BaseAsyncWorker() = default;
    
    Napi::Promise GetPromise() { return deferred_.Promise(); }
    
    void OnError(const Napi::Error& error) override {
        Napi::HandleScope scope(Env());
        deferred_.Reject(error.Value());
    }
    
    // Derived classes should implement Execute() and OnOK()
};

// Specialized base for void return type
template<>
class BaseAsyncWorker<void> : public Napi::AsyncWorker {
protected:
    Napi::Promise::Deferred deferred_;
    
public:
    explicit BaseAsyncWorker(const Napi::Env& env)
        : Napi::AsyncWorker(env), 
          deferred_(Napi::Promise::Deferred::New(env)) {}
    
    virtual ~BaseAsyncWorker() = default;
    
    Napi::Promise GetPromise() { return deferred_.Promise(); }
    
    void OnOK() override {
        Napi::HandleScope scope(Env());
        deferred_.Resolve(Env().Undefined());
    }
    
    void OnError(const Napi::Error& error) override {
        Napi::HandleScope scope(Env());
        deferred_.Reject(error.Value());
    }
};

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

// Get target window (empty title = foreground window)
inline HWND GetTargetWindow(const std::string& windowTitle) {
    if (windowTitle.empty()) {
        return GetForegroundWindow();
    }
    return FindWindowA(nullptr, windowTitle.c_str());
}

// Interpolation functions for smooth movement
namespace interpolation {
    // Ease in-out cubic function for smooth animation
    inline double easeInOutCubic(double t) {
        if (t < 0.5) {
            return 4 * t * t * t;
        } else {
            double p = 2 * t - 2;
            return 1 + p * p * p / 2;
        }
    }
    
    // Linear interpolation
    inline double lerp(double start, double end, double t) {
        return start + (end - start) * t;
    }
    
    // Calculate number of steps for smooth movement
    inline int calculateSteps(int duration, int minStepMs = constants::MIN_SMOOTH_STEP_MS) {
        return std::max(duration / minStepMs, 1);
    }
}

// Input validation helpers
namespace validation {
    template<typename T>
    inline bool checkArgument(const Napi::CallbackInfo& info, size_t index, 
                            bool (Napi::Value::*checker)() const) {
        return info.Length() > index && (info[index].*checker)();
    }
    
    inline bool requireNumber(const Napi::CallbackInfo& info, size_t index, 
                            const std::string& argName) {
        if (!checkArgument<Napi::Number>(info, index, &Napi::Value::IsNumber)) {
            std::string msg = argName + " must be a number";
            Napi::Error::New(info.Env(), msg).ThrowAsJavaScriptException();
            return false;
        }
        return true;
    }
    
    inline bool requireString(const Napi::CallbackInfo& info, size_t index, 
                            const std::string& argName) {
        if (!checkArgument<Napi::String>(info, index, &Napi::Value::IsString)) {
            std::string msg = argName + " must be a string";
            Napi::Error::New(info.Env(), msg).ThrowAsJavaScriptException();
            return false;
        }
        return true;
    }
}

// Mouse button enum for type safety
enum class MouseButton {
    Left,
    Right,
    Middle
};

// Convert string to MouseButton
inline MouseButton parseMouseButton(const std::string& button) {
    if (button == "right") return MouseButton::Right;
    if (button == "middle") return MouseButton::Middle;
    return MouseButton::Left;
}

// Get mouse button flags
inline std::pair<DWORD, DWORD> getMouseButtonFlags(MouseButton button) {
    switch (button) {
        case MouseButton::Right:
            return {MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP};
        case MouseButton::Middle:
            return {MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP};
        default:
            return {MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP};
    }
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