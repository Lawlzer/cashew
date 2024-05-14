#include <napi.h>
#include <windows.h>
#include <vector>

// Function that waits for a key press and returns true if the key is pressed
bool IsKeyPressed(int key) {
    if (GetAsyncKeyState(key) & 0x8000) { // 0x8000 is the bit flag for a key currently pressed
        // Key is pressed; return true
        return true;
    }
    return false;
}

void holdKey(WORD keyCode) {
    INPUT input = { 0 };
    input.type = INPUT_KEYBOARD;
    input.ki.wVk = keyCode;
    input.ki.dwFlags = 0;

    SendInput(1, &input, sizeof(INPUT));
}

void releaseKey(WORD keyCode) {
    INPUT input = { 0 };
    input.type = INPUT_KEYBOARD;
    input.ki.wVk = keyCode;
    input.ki.dwFlags = KEYEVENTF_KEYUP;

    SendInput(1, &input, sizeof(INPUT));
}

void typeKeys(const std::vector<WORD>& keyCodes) {
    for (WORD keyCode : keyCodes) {
        holdKey(keyCode);
        releaseKey(keyCode);
    }
}

Napi::Value HoldKey(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    WORD keyCode = info[0].As<Napi::Number>().Uint32Value();
    holdKey(keyCode);

    return env.Null();
}

Napi::Value ReleaseKey(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    WORD keyCode = info[0].As<Napi::Number>().Uint32Value();
    releaseKey(keyCode);

    return env.Null();
}

Napi::Value IsKeyPressedMain(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Check number of arguments
    if (info.Length() < 1) {
        Napi::TypeError::New(env, "Key code expected").ThrowAsJavaScriptException();
        return env.Null();
    }

    if (!info[0].IsNumber()) {
        Napi::TypeError::New(env, "Key code must be a number").ThrowAsJavaScriptException();
        return env.Null();
    }

    int keyToDetect = info[0].As<Napi::Number>().Int32Value();

    bool keyIsPressed = IsKeyPressed(keyToDetect);

    return Napi::Boolean::New(env, keyIsPressed);
}

Napi::Value Type(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsArray()) {
        Napi::TypeError::New(env, "Array of key codes expected").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Array keyArray = info[0].As<Napi::Array>();
    std::vector<WORD> keyCodes;

    for (uint32_t i = 0; i < keyArray.Length(); i++) {
        Napi::Maybe<Napi::Value> maybeKeyValue = keyArray.Get(i);
        if (maybeKeyValue.IsNothing() || !maybeKeyValue.Unwrap().IsNumber()) {
            Napi::TypeError::New(env, "Key code must be a number").ThrowAsJavaScriptException();
            return env.Null();
        }
        keyCodes.push_back(maybeKeyValue.Unwrap().As<Napi::Number>().Uint32Value());
    }

    typeKeys(keyCodes);

    return env.Null();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "holdKey"), Napi::Function::New(env, HoldKey));
    exports.Set(Napi::String::New(env, "releaseKey"), Napi::Function::New(env, ReleaseKey));
    exports.Set(Napi::String::New(env, "isKeyPressed"), Napi::Function::New(env, IsKeyPressedMain));
    exports.Set(Napi::String::New(env, "type"), Napi::Function::New(env, Type));
    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init);