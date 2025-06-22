#include "common.h"
#include <napi.h>
#include <windows.h>
#include <vector>
#include <unordered_map>

using namespace cashew;

// Track which keys have been initialized to handle first-call edge cases
static std::unordered_map<int, bool> keyInitialized;
static bool globalInitDone = false;

// Initialize function to clear all key states on startup
void InitializeKeyStates() {
    if (!globalInitDone) {
        // Clear the state of all keys on first use
        for (int i = 0; i < 256; i++) {
            GetAsyncKeyState(i);
        }
        globalInitDone = true;
        Sleep(10); // Give time for states to settle
    }
}

// Synchronous version of IsKeyPressed - no AsyncWorker overhead
Napi::Value IsKeyPressedSync(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::Error::New(env, "Key code must be a number").ThrowAsJavaScriptException();
        return env.Null();
    }

    int keyCode = info[0].As<Napi::Number>().Int32Value();
    
    // Initialize on first use
    InitializeKeyStates();
    
    // For each specific key, clear its state on first access
    if (keyInitialized.find(keyCode) == keyInitialized.end()) {
        GetAsyncKeyState(keyCode); // Clear toggle bit
        keyInitialized[keyCode] = true;
        Sleep(1); // Brief pause
    }
    
    // Now get the actual current state
    SHORT keyState = GetAsyncKeyState(keyCode);
    bool isPressed = (keyState & 0x8000) != 0;
    
    return Napi::Boolean::New(env, isPressed);
}

// Batch check multiple keys at once to reduce function call overhead
Napi::Value AreKeysPressed(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsArray()) {
        Napi::Error::New(env, "Expected array of key codes").ThrowAsJavaScriptException();
        return env.Null();
    }

    // Initialize on first use
    InitializeKeyStates();

    Napi::Array keyArray = info[0].As<Napi::Array>();
    Napi::Array result = Napi::Array::New(env, keyArray.Length());

    for (uint32_t i = 0; i < keyArray.Length(); i++) {
        Napi::Maybe<Napi::Value> maybeVal = keyArray.Get(i);
        if (maybeVal.IsNothing()) continue;
        
        Napi::Value val = maybeVal.Unwrap();
        if (!val.IsNumber()) continue;
        
        int keyCode = val.As<Napi::Number>().Int32Value();
        
        // Initialize each key on first access
        if (keyInitialized.find(keyCode) == keyInitialized.end()) {
            GetAsyncKeyState(keyCode); // Clear toggle bit
            keyInitialized[keyCode] = true;
            Sleep(1);
        }
        
        // Get current state
        SHORT keyState = GetAsyncKeyState(keyCode);
        bool isPressed = (keyState & 0x8000) != 0;
        
        result.Set(i, Napi::Boolean::New(env, isPressed));
    }

    return result;
}

// Get all currently pressed keys (useful for combo detection)
Napi::Value GetPressedKeys(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    // Initialize on first use
    InitializeKeyStates();
    
    Napi::Array pressedKeys = Napi::Array::New(env);
    uint32_t index = 0;

    // Check common keys (0-255)
    for (int vk = 0; vk < 256; vk++) {
        if (GetAsyncKeyState(vk) & 0x8000) {
            pressedKeys.Set(index++, Napi::Number::New(env, vk));
        }
    }

    return pressedKeys;
}

// Diagnostic function to get raw key state
Napi::Value GetRawKeyState(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::Error::New(env, "Key code must be a number").ThrowAsJavaScriptException();
        return env.Null();
    }

    int keyCode = info[0].As<Napi::Number>().Int32Value();
    
    // Get the raw state from GetAsyncKeyState
    SHORT asyncState = GetAsyncKeyState(keyCode);
    
    // Also try GetKeyboardState for comparison
    BYTE keyboardState[256];
    GetKeyboardState(keyboardState);
    BYTE kbState = keyboardState[keyCode];
    
    // Create result object with diagnostic info
    Napi::Object result = Napi::Object::New(env);
    result.Set("asyncState", Napi::Number::New(env, asyncState));
    result.Set("asyncStateHex", Napi::String::New(env, std::to_string(asyncState)));
    result.Set("isPressed", Napi::Boolean::New(env, (asyncState & 0x8000) != 0));
    result.Set("wasPressed", Napi::Boolean::New(env, (asyncState & 0x0001) != 0));
    result.Set("keyboardState", Napi::Number::New(env, kbState));
    result.Set("kbStatePressed", Napi::Boolean::New(env, (kbState & 0x80) != 0));
    
    return result;
}

// Alternative implementation using GetKeyboardState
Napi::Value IsKeyPressedAlt(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::Error::New(env, "Key code must be a number").ThrowAsJavaScriptException();
        return env.Null();
    }

    int keyCode = info[0].As<Napi::Number>().Int32Value();
    
    // Alternative approach: Call GetAsyncKeyState twice to ensure clean state
    GetAsyncKeyState(keyCode); // Clear any toggle bit
    Sleep(1); // Brief pause
    SHORT keyState = GetAsyncKeyState(keyCode);
    bool isPressed = (keyState & 0x8000) != 0;
    
    return Napi::Boolean::New(env, isPressed);
}

// Batch send multiple key events efficiently
Napi::Value SendKeyBatch(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsArray()) {
        Napi::Error::New(env, "Expected array of key events").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Array eventArray = info[0].As<Napi::Array>();
    std::vector<INPUT> inputs;
    inputs.reserve(eventArray.Length());

    for (uint32_t i = 0; i < eventArray.Length(); i++) {
        Napi::Maybe<Napi::Value> maybeVal = eventArray.Get(i);
        if (maybeVal.IsNothing()) continue;
        
        Napi::Value val = maybeVal.Unwrap();
        if (!val.IsObject()) continue;
        
        Napi::Object event = val.As<Napi::Object>();
        
        // Extract keyCode and isDown from event object
        Napi::Maybe<Napi::Value> maybeKeyCode = event.Get("keyCode");
        Napi::Maybe<Napi::Value> maybeIsDown = event.Get("isDown");
        
        if (maybeKeyCode.IsNothing() || maybeIsDown.IsNothing()) continue;
        
        Napi::Value keyCodeVal = maybeKeyCode.Unwrap();
        Napi::Value isDownVal = maybeIsDown.Unwrap();
        
        if (!keyCodeVal.IsNumber() || !isDownVal.IsBoolean()) continue;
        
        INPUT input = {0};
        input.type = INPUT_KEYBOARD;
        input.ki.wVk = keyCodeVal.As<Napi::Number>().Uint32Value();
        
        if (!isDownVal.As<Napi::Boolean>().Value()) {
            input.ki.dwFlags = KEYEVENTF_KEYUP;
        }
        
        inputs.push_back(input);
    }

    if (!inputs.empty()) {
        UINT sent = SendInput(static_cast<UINT>(inputs.size()), inputs.data(), sizeof(INPUT));
        return Napi::Boolean::New(env, sent == inputs.size());
    }

    return Napi::Boolean::New(env, true);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("isKeyPressedSync", Napi::Function::New(env, IsKeyPressedSync));
    exports.Set("areKeysPressed", Napi::Function::New(env, AreKeysPressed));
    exports.Set("getPressedKeys", Napi::Function::New(env, GetPressedKeys));
    exports.Set("sendKeyBatch", Napi::Function::New(env, SendKeyBatch));
    exports.Set("getRawKeyState", Napi::Function::New(env, GetRawKeyState));
    exports.Set("isKeyPressedAlt", Napi::Function::New(env, IsKeyPressedAlt));
    return exports;
}

NODE_API_MODULE(keyboardSync, Init) 