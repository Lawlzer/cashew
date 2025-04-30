#include <napi.h>
#include <windows.h>
#include <vector>
#include <thread> 
#include <chrono>
#include <string>

Napi::Value HoldKey(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::Error::New(env, "Expected keyCode as first argument").ThrowAsJavaScriptException();
        return env.Null();
    }

    WORD keyCode = info[0].As<Napi::Number>().Uint32Value();
    std::string windowTitle = "";
    HWND hwnd = GetForegroundWindow(); // Default to foreground window
    
    if (info.Length() > 1 && info[1].IsString()) {
        windowTitle = info[1].As<Napi::String>().Utf8Value();
        hwnd = FindWindowA(nullptr, windowTitle.c_str());
        if (!hwnd) {
            Napi::Error::New(env, "Window not found").ThrowAsJavaScriptException();
            return env.Null();
        }
    }

    // Create and send a key press input
    INPUT input = {0};
    input.type = INPUT_KEYBOARD;
    input.ki.wVk = keyCode;
    
    SendInput(1, &input, sizeof(INPUT));
    return env.Null();
}

Napi::Value ReleaseKey(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::Error::New(env, "Expected keyCode as first argument").ThrowAsJavaScriptException();
        return env.Null();
    }

    WORD keyCode = info[0].As<Napi::Number>().Uint32Value();
    std::string windowTitle = "";
    HWND hwnd = GetForegroundWindow(); // Default to foreground window

    if (info.Length() > 1 && info[1].IsString()) {
        windowTitle = info[1].As<Napi::String>().Utf8Value();
        hwnd = FindWindowA(nullptr, windowTitle.c_str());
        if (!hwnd) {
             // If a window title was provided but not found, throw an error
            Napi::Error::New(env, "Window not found").ThrowAsJavaScriptException();
            return env.Null();
        }
        // No need to SetForegroundWindow for release
    }

    // Create and send a key release input
    INPUT input = {0};
    input.type = INPUT_KEYBOARD;
    input.ki.wVk = keyCode;
    input.ki.dwFlags = KEYEVENTF_KEYUP;
    
    SendInput(1, &input, sizeof(INPUT));
    return env.Null();
}

Napi::Value IsKeyPressedMain(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Check number of arguments
    if (info.Length() < 1) {
        Napi::Error::New(env, "Key code expected").ThrowAsJavaScriptException();
        return env.Null(); // Return null on error
    }

    if (!info[0].IsNumber()) {
        Napi::Error::New(env, "Key code must be a number").ThrowAsJavaScriptException();
        return env.Null(); // Return null on error
    }

    int keyToDetect = info[0].As<Napi::Number>().Int32Value();

    // Directly use GetAsyncKeyState
    bool keyIsPressed = (GetAsyncKeyState(keyToDetect) & 0x8000) != 0;

    return Napi::Boolean::New(env, keyIsPressed);
}

// todo PostMesge -> SendMessage
// Removed SendVirtualKey function (as it wasn't exported or used by exported functions)

// Removed SendText function

Napi::Value Type(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Expect 3 arguments: keycodesArray, windowTitle, and delay (delay is currently unused but kept for API compatibility)
    if (info.Length() != 3) {
        Napi::Error::New(env, "Expected exactly 3 arguments: keycodesArray, windowTitle, delayPerKey").ThrowAsJavaScriptException();
        return env.Null();
    }

    if (!info[0].IsArray() || !info[1].IsString() || !info[2].IsNumber()) {
        Napi::Error::New(env, "Expected arguments: keycodesArray (array), windowTitle (string), delayPerKey (number)").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Array keyArray = info[0].As<Napi::Array>();
    std::string windowTitle = info[1].As<Napi::String>().Utf8Value();
    int delay = info[2].As<Napi::Number>().Uint32Value(); // Parse the delay, though it's not used here

    std::vector<WORD> keyCodes;
    for (uint32_t i = 0; i < keyArray.Length(); i++) {
        // Correct Napi::Maybe handling
        Napi::Maybe<Napi::Value> maybeVal = keyArray.Get(i);
        if (maybeVal.IsNothing()) {
             // Handle the case where getting the element failed, maybe log or throw
             Napi::Error::New(env, "Failed to get array element").ThrowAsJavaScriptException();
             return env.Null(); 
        }
        Napi::Value val = maybeVal.Unwrap(); // Unwrap the value now that we know it's safe

        if (!val.IsNumber()) {
             Napi::Error::New(env, "Key code must be a number").ThrowAsJavaScriptException();
             return env.Null(); // Return null on error
        }
        keyCodes.push_back(val.As<Napi::Number>().Uint32Value());
    }

    HWND hwnd;
    if (!windowTitle.empty()) {
        hwnd = FindWindowA(nullptr, windowTitle.c_str());
        if (!hwnd) {
            // Return false if window not found, consistent with original behavior
            return Napi::Boolean::New(env, false); 
        }
    } else {
        hwnd = GetForegroundWindow();
    }

    // Integrate SendText logic here
    for (WORD keyCode : keyCodes) {
        // Using SendMessage with WM_CHAR as SendText did. 
        // Note: This sends characters, not virtual key presses/releases.
        // It also doesn't use the 'delay' parameter.
        SendMessage(hwnd, WM_CHAR, keyCode, 0); 
        // If a delay IS needed between WM_CHAR messages, it could be added here:
        // if (delay > 0) {
        //    std::this_thread::sleep_for(std::chrono::milliseconds(delay));
        // }
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
    std::string windowTitle = "";
    HWND hwnd = GetForegroundWindow(); // Default to foreground window
    
    if (info.Length() > 1 && info[1].IsString()) {
        windowTitle = info[1].As<Napi::String>().Utf8Value();
        hwnd = FindWindowA(nullptr, windowTitle.c_str());
        if (!hwnd) {
            // If a window title was provided but not found, throw an error
            Napi::Error::New(env, "Window not found").ThrowAsJavaScriptException();
            return env.Null();
        }
         // Optionally bring the target window to the foreground
         // SetForegroundWindow(hwnd);
    }
    
    
    INPUT inputs[2] = {0};
    
    // Key press
    inputs[0].type = INPUT_KEYBOARD;
    inputs[0].ki.wVk = keyCode;
    
    // Key release
    inputs[1].type = INPUT_KEYBOARD;
    inputs[1].ki.wVk = keyCode;
    inputs[1].ki.dwFlags = KEYEVENTF_KEYUP;
    
    SendInput(2, inputs, sizeof(INPUT));
    return env.Null();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "holdKey"), Napi::Function::New(env, HoldKey));
    exports.Set(Napi::String::New(env, "releaseKey"), Napi::Function::New(env, ReleaseKey));
    exports.Set(Napi::String::New(env, "isKeyPressed"), Napi::Function::New(env, IsKeyPressedMain));
    exports.Set(Napi::String::New(env, "type"), Napi::Function::New(env, Type));
    exports.Set(Napi::String::New(env, "tapKey"), Napi::Function::New(env, TapKey));
    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init);
