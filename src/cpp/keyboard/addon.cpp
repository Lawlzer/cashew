#include <napi.h>
#include <windows.h>
#include <vector>
#include <thread> 
#include <chrono>
#include <string>

// Function that waits for a key press and returns true if the key is pressed
bool IsKeyPressed(int key) {
    if (GetAsyncKeyState(key) & 0x8000) { // 0x8000 is the bit flag for a key currently pressed
        // Key is pressed; return true
        return true;
    }
    return false;
}

void holdKey(WORD keyCode, const std::string& windowTitle = "") {
    HWND hwnd = GetForegroundWindow();
    
    if (!windowTitle.empty()) {
        hwnd = FindWindowA(nullptr, windowTitle.c_str());
        if (!hwnd) {
            return;
        }
    }
    
    // Create and send a key press input
    INPUT input = {0};
    input.type = INPUT_KEYBOARD;
    input.ki.wVk = keyCode;
    
    SendInput(1, &input, sizeof(INPUT));
}

void releaseKey(WORD keyCode, const std::string& windowTitle = "") {
    HWND hwnd = GetForegroundWindow();
    
    if (!windowTitle.empty()) {
        hwnd = FindWindowA(nullptr, windowTitle.c_str());
        if (!hwnd) {
            return;
        }
    }
    
    // Create and send a key release input
    INPUT input = {0};
    input.type = INPUT_KEYBOARD;
    input.ki.wVk = keyCode;
    input.ki.dwFlags = KEYEVENTF_KEYUP;
    
    SendInput(1, &input, sizeof(INPUT));
}

void typeKeysWithDelay(const std::vector<WORD>& keyCodes, int delayPerKey) {
    for (WORD keyCode : keyCodes) {
        holdKey(keyCode);
        releaseKey(keyCode);
        std::this_thread::sleep_for(std::chrono::milliseconds(delayPerKey));
    }
}

void tapKey(WORD keyCode, const std::string& windowTitle = "") {
    HWND hwnd = GetForegroundWindow();
    
    if (!windowTitle.empty()) {
        hwnd = FindWindowA(nullptr, windowTitle.c_str());
        if (!hwnd) {
            return;
        }
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
}

Napi::Value HoldKey(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::Error::New(env, "Expected keyCode as first argument").ThrowAsJavaScriptException();
        return env.Null();
    }

    WORD keyCode = info[0].As<Napi::Number>().Uint32Value();
    std::string windowTitle = "";
    
    if (info.Length() > 1 && info[1].IsString()) {
        windowTitle = info[1].As<Napi::String>().Utf8Value();
        
        // Check if window exists before calling holdKey
        HWND hwnd = FindWindowA(nullptr, windowTitle.c_str());
        if (!hwnd) {
            Napi::Error::New(env, "Window not found").ThrowAsJavaScriptException();
            return env.Null();
        }
    }

    holdKey(keyCode, windowTitle);
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
    
    if (info.Length() > 1 && info[1].IsString()) {
        windowTitle = info[1].As<Napi::String>().Utf8Value();
        
        // Add window existence check
        HWND hwnd = FindWindowA(nullptr, windowTitle.c_str());
        if (!hwnd) {
            Napi::Error::New(env, "Window not found").ThrowAsJavaScriptException();
            return env.Null();
        }
    }

    releaseKey(keyCode, windowTitle);
    return env.Null();
}

Napi::Value IsKeyPressedMain(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Check number of arguments
    if (info.Length() < 1) {
        Napi::Error::New(env, "Key code expected").ThrowAsJavaScriptException();
    }

    if (!info[0].IsNumber()) {
        Napi::Error::New(env, "Key code must be a number").ThrowAsJavaScriptException();
    }

    int keyToDetect = info[0].As<Napi::Number>().Int32Value();

    bool keyIsPressed = IsKeyPressed(keyToDetect);

    return Napi::Boolean::New(env, keyIsPressed);
}

// todo PostMesge -> SendMessage
void SendVirtualKey(HWND hWnd, UINT vkCode, int delay) {
    SendMessage(hWnd, WM_KEYDOWN, vkCode, 0);
    std::this_thread::sleep_for(std::chrono::milliseconds(delay)); // Use the specified delay
    SendMessage(hWnd, WM_KEYUP, vkCode, 0);
}

void SendText(HWND hWnd, const std::vector<WORD>& keyCodes, int delay) {
    for (WORD keyCode : keyCodes) {
        SendMessage(hWnd, WM_CHAR, keyCode, 0);
    }
}

Napi::Value Type(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Expect 3 arguments: keycodesArray, windowTitle, and delay
    if (info.Length() != 3) {
        Napi::Error::New(env, "Expected exactly 3 arguments").ThrowAsJavaScriptException();
    }

    if (!info[0].IsArray() || !info[1].IsString() || !info[2].IsNumber()) {
        Napi::Error::New(env, "Expected arguments: keycodesArray (array), windowTitle (string), delayPerKey (number)").ThrowAsJavaScriptException();
    }

    Napi::Array keyArray = info[0].As<Napi::Array>();
    std::string windowTitle = info[1].As<Napi::String>().Utf8Value();
    int delay = info[2].As<Napi::Number>().Uint32Value(); // Parse the delay as an integer

    std::vector<WORD> keyCodes;
    for (uint32_t i = 0; i < keyArray.Length(); i++) {
        Napi::Maybe<Napi::Value> maybeKeyValue = keyArray.Get(i);
        if (maybeKeyValue.IsNothing() || !maybeKeyValue.Unwrap().IsNumber()) {
            Napi::Error::New(env, "Key code must be a number").ThrowAsJavaScriptException();
        }
        keyCodes.push_back(maybeKeyValue.Unwrap().As<Napi::Number>().Uint32Value());
    }

    HWND hwnd;
    if (!windowTitle.empty()) {
        hwnd = FindWindowA(nullptr, windowTitle.c_str());
        if (!hwnd) {
            return Napi::Boolean::New(env, false);
        }
    } else {
        hwnd = GetForegroundWindow();
    }

    SendText(hwnd, keyCodes, delay);

    return Napi::Boolean::New(env, true);
}

Napi::Value TapKey(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::Error::New(env, "Expected keyCode as first argument").ThrowAsJavaScriptException();
    }

    WORD keyCode = info[0].As<Napi::Number>().Uint32Value();
    std::string windowTitle = "";
    
    if (info.Length() > 1 && info[1].IsString()) {
        windowTitle = info[1].As<Napi::String>().Utf8Value();
        
        // Add window existence check
        HWND hwnd = FindWindowA(nullptr, windowTitle.c_str());
        if (!hwnd) {
            Napi::Error::New(env, "Window not found").ThrowAsJavaScriptException();
            return env.Null();
        }
    }

    tapKey(keyCode, windowTitle);
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
