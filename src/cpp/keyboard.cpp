#include "common.h"
#include <vector>
#include <thread> 
#include <chrono>
#include <string>

using namespace cashew;

// Helper function to validate and get window handle
HWND GetTargetWindow(const Napi::CallbackInfo& info, int argIndex) {
    if (argIndex < info.Length() && info[argIndex].IsString()) {
        std::string windowTitle = info[argIndex].As<Napi::String>().Utf8Value();
        if (!windowTitle.empty()) {
            return FindWindowSafe(info.Env(), windowTitle);
        }
    }
    return GetForegroundWindow();
}

// Helper function to send key input
void SendKeyInput(WORD keyCode, bool keyUp = false) {
    INPUT input = {0};
    input.type = INPUT_KEYBOARD;
    input.ki.wVk = keyCode;
    if (keyUp) {
        input.ki.dwFlags = KEYEVENTF_KEYUP;
    }
    SendInput(1, &input, sizeof(INPUT));
}

Napi::Value HoldKey(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::Error::New(env, "Expected keyCode as first argument").ThrowAsJavaScriptException();
        return env.Null();
    }

    WORD keyCode = info[0].As<Napi::Number>().Uint32Value();
    GetTargetWindow(info, 1); // Validate window if provided
    
    SendKeyInput(keyCode);
    return env.Null();
}

Napi::Value ReleaseKey(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::Error::New(env, "Expected keyCode as first argument").ThrowAsJavaScriptException();
        return env.Null();
    }

    WORD keyCode = info[0].As<Napi::Number>().Uint32Value();
    GetTargetWindow(info, 1); // Validate window if provided

    SendKeyInput(keyCode, true);
    return env.Null();
}

Napi::Value IsKeyPressed(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::Error::New(env, "Key code must be a number").ThrowAsJavaScriptException();
        return env.Null();
    }

    int keyToDetect = info[0].As<Napi::Number>().Int32Value();
    bool keyIsPressed = (GetAsyncKeyState(keyToDetect) & 0x8000) != 0;

    return Napi::Boolean::New(env, keyIsPressed);
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

    // Get target window
    HWND hwnd = windowTitle.empty() ? GetForegroundWindow() : FindWindowA(nullptr, windowTitle.c_str());
    if (!hwnd && !windowTitle.empty()) {
        return Napi::Boolean::New(env, false); 
    }

    // Send characters to window
    for (WORD keyCode : keyCodes) {
        SendMessage(hwnd, WM_CHAR, keyCode, 0);
        if (delay > 0) {
            std::this_thread::sleep_for(std::chrono::milliseconds(delay));
        }
    }

    return Napi::Boolean::New(env, true);
}

Napi::Value TapKey(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::Error::New(env, "Expected keyCode as first argument").ThrowAsJavaScriptException();
        return env.Null();
    }

    WORD keyCode = info[0].As<Napi::Number>().Uint32Value();
    GetTargetWindow(info, 1); // Validate window if provided
    
    // Send key press and release
    INPUT inputs[2] = {0};
    
    inputs[0].type = INPUT_KEYBOARD;
    inputs[0].ki.wVk = keyCode;
    
    inputs[1].type = INPUT_KEYBOARD;
    inputs[1].ki.wVk = keyCode;
    inputs[1].ki.dwFlags = KEYEVENTF_KEYUP;
    
    SendInput(2, inputs, sizeof(INPUT));
    return env.Null();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "holdKey"), Napi::Function::New(env, HoldKey));
    exports.Set(Napi::String::New(env, "releaseKey"), Napi::Function::New(env, ReleaseKey));
    exports.Set(Napi::String::New(env, "isKeyPressed"), Napi::Function::New(env, IsKeyPressed));
    exports.Set(Napi::String::New(env, "type"), Napi::Function::New(env, Type));
    exports.Set(Napi::String::New(env, "tapKey"), Napi::Function::New(env, TapKey));
    return exports;
}

CASHEW_MODULE_INIT(keyboard, Init);
