#include <napi.h>
#include <windows.h>
#include <string>



Napi::Value SetForegroundWindowWrapper(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Check if we received the window title parameter
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Window title (string) expected").ThrowAsJavaScriptException();
        return env.Null();
    }

    // Get the window title from the parameter
    std::string windowTitle = info[0].As<Napi::String>().Utf8Value();

    // Find the window handle by title
    HWND hwnd = FindWindowA(NULL, windowTitle.c_str());
    
    if (hwnd == NULL) {
        return Napi::Boolean::New(env, false);
    }

    // Attempt to set the window as foreground
    bool success = ::SetForegroundWindow(hwnd) != 0;

    return Napi::Boolean::New(env, success);
}

Napi::Value GetForegroundWindowTitle(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Get the foreground window handle
    HWND hwnd = GetForegroundWindow();
    if (hwnd == NULL) {
        return env.Null();
    }

    // Get the window title
    char title[256];
    int length = GetWindowTextA(hwnd, title, sizeof(title));
    
    if (length == 0) {
        // If GetWindowText fails or window has no title
        return env.Null();
    }

    return Napi::String::New(env, title);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(
        Napi::String::New(env, "SetForegroundWindow"),
        Napi::Function::New(env, SetForegroundWindowWrapper)
    );
    exports.Set(
        Napi::String::New(env, "GetForegroundWindowTitle"),
        Napi::Function::New(env, GetForegroundWindowTitle)
    );
    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init);