#include <napi.h>
#include <windows.h>
#include <string>
#include <memory>
#include "common.h"

using namespace cashew;

// AsyncWorker for SetForegroundWindow
class SetForegroundWindowWorker : public Napi::AsyncWorker {
public:
    SetForegroundWindowWorker(const Napi::Env& env, const std::string& windowTitle)
        : Napi::AsyncWorker(env), windowTitle_(windowTitle), success_(false) {}

    void Execute() override {
        // Find the window handle by title
        HWND hwnd = FindWindowA(NULL, windowTitle_.c_str());
        
        if (hwnd == NULL) {
            SetError("Window not found: " + windowTitle_);
            return;
        }

        // Attempt to set the window as foreground
        success_ = ::SetForegroundWindow(hwnd) != 0;
        
        if (!success_) {
            SetError("Failed to set window as foreground");
        }
    }

    void OnOK() override {
        Napi::HandleScope scope(Env());
        deferred_.Resolve(Napi::Boolean::New(Env(), success_));
    }

    void OnError(const Napi::Error& error) override {
        deferred_.Reject(error.Value());
    }

    Napi::Promise GetPromise() { return deferred_.Promise(); }

private:
    Napi::Promise::Deferred deferred_ = Napi::Promise::Deferred::New(Env());
    std::string windowTitle_;
    bool success_;
};

// AsyncWorker for GetForegroundWindowTitle
class GetForegroundWindowTitleWorker : public Napi::AsyncWorker {
public:
    GetForegroundWindowTitleWorker(const Napi::Env& env)
        : Napi::AsyncWorker(env), hasTitle_(false) {}

    void Execute() override {
        // Get the foreground window handle
        HWND hwnd = GetForegroundWindow();
        if (hwnd == NULL) {
            SetError("No foreground window found");
            return;
        }

        // Get the window title
        char title[256];
        int length = GetWindowTextA(hwnd, title, sizeof(title));
        
        if (length == 0) {
            // If GetWindowText fails or window has no title
            SetError("Failed to get window title or window has no title");
            return;
        }

        title_ = std::string(title);
        hasTitle_ = true;
    }

    void OnOK() override {
        Napi::HandleScope scope(Env());
        if (hasTitle_) {
            deferred_.Resolve(Napi::String::New(Env(), title_));
        } else {
            deferred_.Resolve(Env().Null());
        }
    }

    void OnError(const Napi::Error& error) override {
        deferred_.Reject(error.Value());
    }

    Napi::Promise GetPromise() { return deferred_.Promise(); }

private:
    Napi::Promise::Deferred deferred_ = Napi::Promise::Deferred::New(Env());
    std::string title_;
    bool hasTitle_;
};

Napi::Value SetForegroundWindowWrapper(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Check if we received the window title parameter
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Window title (string) expected").ThrowAsJavaScriptException();
        return env.Null();
    }

    // Get the window title from the parameter
    std::string windowTitle = info[0].As<Napi::String>().Utf8Value();

    auto* worker = new SetForegroundWindowWorker(env, windowTitle);
    worker->Queue();
    return worker->GetPromise();
}

Napi::Value GetForegroundWindowTitle(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    auto* worker = new GetForegroundWindowTitleWorker(env);
    worker->Queue();
    return worker->GetPromise();
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

CASHEW_MODULE_INIT(misc, Init)