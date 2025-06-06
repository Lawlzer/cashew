#include "common.h"
#include <napi.h>
#include <windows.h>
#include <vector>
#include <thread> 
#include <chrono>
#include <string>
#include <memory>

using namespace cashew;

// AsyncWorker for HoldKey
class HoldKeyWorker : public Napi::AsyncWorker {
public:
    HoldKeyWorker(const Napi::Env& env, WORD keyCode, const std::string& windowTitle)
        : Napi::AsyncWorker(env), keyCode_(keyCode), windowTitle_(windowTitle) {}

    void Execute() override {
        HWND hwnd = GetTargetWindow(windowTitle_);
        if (!hwnd && !windowTitle_.empty()) {
            SetError("Window not found: " + windowTitle_);
            return;
        }

        INPUT input = {0};
        input.type = INPUT_KEYBOARD;
        input.ki.wVk = keyCode_;
        
        if (SendInput(1, &input, sizeof(INPUT)) != 1) {
            SetError("Failed to send key down event");
        }
    }

    void OnOK() override {
        Napi::HandleScope scope(Env());
        deferred_.Resolve(Env().Undefined());
    }

    void OnError(const Napi::Error& error) override {
        deferred_.Reject(error.Value());
    }

    Napi::Promise GetPromise() { return deferred_.Promise(); }

private:
    Napi::Promise::Deferred deferred_ = Napi::Promise::Deferred::New(Env());
    WORD keyCode_;
    std::string windowTitle_;
};

// AsyncWorker for ReleaseKey
class ReleaseKeyWorker : public Napi::AsyncWorker {
public:
    ReleaseKeyWorker(const Napi::Env& env, WORD keyCode, const std::string& windowTitle)
        : Napi::AsyncWorker(env), keyCode_(keyCode), windowTitle_(windowTitle) {}

    void Execute() override {
        HWND hwnd = GetTargetWindow(windowTitle_);
        if (!hwnd && !windowTitle_.empty()) {
            SetError("Window not found: " + windowTitle_);
            return;
        }

        INPUT input = {0};
        input.type = INPUT_KEYBOARD;
        input.ki.wVk = keyCode_;
        input.ki.dwFlags = KEYEVENTF_KEYUP;
        
        if (SendInput(1, &input, sizeof(INPUT)) != 1) {
            SetError("Failed to send key up event");
        }
    }

    void OnOK() override {
        Napi::HandleScope scope(Env());
        deferred_.Resolve(Env().Undefined());
    }

    void OnError(const Napi::Error& error) override {
        deferred_.Reject(error.Value());
    }

    Napi::Promise GetPromise() { return deferred_.Promise(); }

private:
    Napi::Promise::Deferred deferred_ = Napi::Promise::Deferred::New(Env());
    WORD keyCode_;
    std::string windowTitle_;
};

// AsyncWorker for IsKeyPressed
class IsKeyPressedWorker : public Napi::AsyncWorker {
public:
    IsKeyPressedWorker(const Napi::Env& env, int keyCode)
        : Napi::AsyncWorker(env), keyCode_(keyCode), isPressed_(false) {}

    void Execute() override {
        isPressed_ = (GetAsyncKeyState(keyCode_) & 0x8000) != 0;
    }

    void OnOK() override {
        Napi::HandleScope scope(Env());
        deferred_.Resolve(Napi::Boolean::New(Env(), isPressed_));
    }

    void OnError(const Napi::Error& error) override {
        deferred_.Reject(error.Value());
    }

    Napi::Promise GetPromise() { return deferred_.Promise(); }

private:
    Napi::Promise::Deferred deferred_ = Napi::Promise::Deferred::New(Env());
    int keyCode_;
    bool isPressed_;
};

// AsyncWorker for Type
class TypeWorker : public Napi::AsyncWorker {
public:
    TypeWorker(const Napi::Env& env,
               const std::vector<WORD>& keyCodes,
               const std::string& windowTitle,
               int delayPerKey)
        : Napi::AsyncWorker(env),
          keyCodes_(keyCodes),
          windowTitle_(windowTitle),
          delayPerKey_(delayPerKey) {}

    void Execute() override {
        HWND hwnd = GetTargetWindow(windowTitle_);
        if (!hwnd && !windowTitle_.empty()) {
            SetError("Window not found: " + windowTitle_);
            return;
        }

        // Send characters to window
        for (WORD keyCode : keyCodes_) {
            SendMessage(hwnd, WM_CHAR, keyCode, 0);
            if (delayPerKey_ > 0) {
                std::this_thread::sleep_for(std::chrono::milliseconds(delayPerKey_));
            }
        }

        success_ = true;
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
    std::vector<WORD> keyCodes_;
    std::string windowTitle_;
    int delayPerKey_;
    bool success_ = false;
};

// AsyncWorker for TapKey
class TapKeyWorker : public Napi::AsyncWorker {
public:
    TapKeyWorker(const Napi::Env& env, WORD keyCode, const std::string& windowTitle)
        : Napi::AsyncWorker(env), keyCode_(keyCode), windowTitle_(windowTitle) {}

    void Execute() override {
        HWND hwnd = GetTargetWindow(windowTitle_);
        if (!hwnd && !windowTitle_.empty()) {
            SetError("Window not found: " + windowTitle_);
            return;
        }

        INPUT inputs[2] = {0};
        
        inputs[0].type = INPUT_KEYBOARD;
        inputs[0].ki.wVk = keyCode_;
        
        inputs[1].type = INPUT_KEYBOARD;
        inputs[1].ki.wVk = keyCode_;
        inputs[1].ki.dwFlags = KEYEVENTF_KEYUP;
        
        if (SendInput(2, inputs, sizeof(INPUT)) != 2) {
            SetError("Failed to send tap key events");
        }
    }

    void OnOK() override {
        Napi::HandleScope scope(Env());
        deferred_.Resolve(Env().Undefined());
    }

    void OnError(const Napi::Error& error) override {
        deferred_.Reject(error.Value());
    }

    Napi::Promise GetPromise() { return deferred_.Promise(); }

private:
    Napi::Promise::Deferred deferred_ = Napi::Promise::Deferred::New(Env());
    WORD keyCode_;
    std::string windowTitle_;
};

// AsyncWorker for holding a key for a specific duration
class HoldKeyForDurationWorker : public Napi::AsyncWorker {
public:
    HoldKeyForDurationWorker(const Napi::Env& env, WORD keyCode, int duration)
        : Napi::AsyncWorker(env), keyCode_(keyCode), duration_(duration) {}

    void Execute() override {
        // Send key down
        INPUT input = {0};
        input.type = INPUT_KEYBOARD;
        input.ki.wVk = keyCode_;
        
        if (SendInput(1, &input, sizeof(INPUT)) != 1) {
            SetError("Failed to send key down event");
            return;
        }

        // Hold for duration
        std::this_thread::sleep_for(std::chrono::milliseconds(duration_));

        // Send key up
        input.ki.dwFlags = KEYEVENTF_KEYUP;
        if (SendInput(1, &input, sizeof(INPUT)) != 1) {
            SetError("Failed to send key up event");
            return;
        }
    }

    void OnOK() override {
        Napi::HandleScope scope(Env());
        deferred_.Resolve(Env().Undefined());
    }

    void OnError(const Napi::Error& error) override {
        deferred_.Reject(error.Value());
    }

    Napi::Promise GetPromise() { return deferred_.Promise(); }

private:
    Napi::Promise::Deferred deferred_ = Napi::Promise::Deferred::New(Env());
    WORD keyCode_;
    int duration_;
};

// Function implementations
Napi::Value HoldKey(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::Error::New(env, "Expected keyCode as first argument").ThrowAsJavaScriptException();
        return env.Null();
    }

    WORD keyCode = info[0].As<Napi::Number>().Uint32Value();
    std::string windowTitle = "";
    
    if (info.Length() >= 2 && info[1].IsString()) {
        windowTitle = info[1].As<Napi::String>().Utf8Value();
    }

    auto* worker = new HoldKeyWorker(env, keyCode, windowTitle);
    worker->Queue();
    return worker->GetPromise();
}

Napi::Value ReleaseKey(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::Error::New(env, "Expected keyCode as first argument").ThrowAsJavaScriptException();
        return env.Null();
    }

    WORD keyCode = info[0].As<Napi::Number>().Uint32Value();
    std::string windowTitle = "";
    
    if (info.Length() >= 2 && info[1].IsString()) {
        windowTitle = info[1].As<Napi::String>().Utf8Value();
    }

    auto* worker = new ReleaseKeyWorker(env, keyCode, windowTitle);
    worker->Queue();
    return worker->GetPromise();
}

Napi::Value IsKeyPressed(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::Error::New(env, "Key code must be a number").ThrowAsJavaScriptException();
        return env.Null();
    }

    int keyToDetect = info[0].As<Napi::Number>().Int32Value();

    auto* worker = new IsKeyPressedWorker(env, keyToDetect);
    worker->Queue();
    return worker->GetPromise();
}

Napi::Value Type(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Expect 3 arguments: keycodesArray, windowTitle, and delay
    if (info.Length() != 3) {
        Napi::Error::New(env, "Expected exactly 3 arguments: keycodesArray, windowTitle, delayPerKey")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    if (!info[0].IsArray() || !info[1].IsString() || !info[2].IsNumber()) {
        Napi::Error::New(env, "Expected arguments: keycodesArray (array), windowTitle (string), delayPerKey (number)")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Array keyArray = info[0].As<Napi::Array>();
    std::string windowTitle = info[1].As<Napi::String>().Utf8Value();
    int delay = info[2].As<Napi::Number>().Uint32Value();

    // Extract key codes from array
    std::vector<WORD> keyCodes;
    for (uint32_t i = 0; i < keyArray.Length(); i++) {
        Napi::Maybe<Napi::Value> maybeVal = keyArray.Get(i);
        if (maybeVal.IsNothing()) {
            Napi::Error::New(env, "Failed to get array element").ThrowAsJavaScriptException();
            return env.Null(); 
        }
        Napi::Value val = maybeVal.Unwrap();

        if (!val.IsNumber()) {
            Napi::Error::New(env, "Key code must be a number").ThrowAsJavaScriptException();
            return env.Null();
        }
        keyCodes.push_back(val.As<Napi::Number>().Uint32Value());
    }

    auto* worker = new TypeWorker(env, keyCodes, windowTitle, delay);
    worker->Queue();
    return worker->GetPromise();
}

Napi::Value TapKey(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::Error::New(env, "Expected keyCode as first argument").ThrowAsJavaScriptException();
        return env.Null();
    }

    WORD keyCode = info[0].As<Napi::Number>().Uint32Value();
    std::string windowTitle = "";
    
    if (info.Length() >= 2 && info[1].IsString()) {
        windowTitle = info[1].As<Napi::String>().Utf8Value();
    }

    auto* worker = new TapKeyWorker(env, keyCode, windowTitle);
    worker->Queue();
    return worker->GetPromise();
}

Napi::Value HoldKeyForDuration(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() != 2) {
        Napi::Error::New(env, "Expected 2 arguments: keyCode, duration")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    if (!info[0].IsNumber() || !info[1].IsNumber()) {
        Napi::Error::New(env, "Expected arguments: keyCode (number), duration (number)")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    WORD keyCode = info[0].As<Napi::Number>().Uint32Value();
    int duration = info[1].As<Napi::Number>().Uint32Value();

    auto* worker = new HoldKeyForDurationWorker(env, keyCode, duration);
    worker->Queue();
    return worker->GetPromise();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "holdKey"), Napi::Function::New(env, HoldKey));
    exports.Set(Napi::String::New(env, "releaseKey"), Napi::Function::New(env, ReleaseKey));
    exports.Set(Napi::String::New(env, "isKeyPressed"), Napi::Function::New(env, IsKeyPressed));
    exports.Set(Napi::String::New(env, "type"), Napi::Function::New(env, Type));
    exports.Set(Napi::String::New(env, "tapKey"), Napi::Function::New(env, TapKey));
    exports.Set(Napi::String::New(env, "holdKeyForDuration"), Napi::Function::New(env, HoldKeyForDuration));
    return exports;
}

CASHEW_MODULE_INIT(keyboard, Init);
