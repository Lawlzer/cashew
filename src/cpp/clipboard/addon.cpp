#include <napi.h>
#include <windows.h>
#include <string>

// Clipboardy (npm package) crashes when an image is read, so we use this to avoid the error
// We can just wrap it in a try catch though... I don't know why I wrote this tbh. This was so unnecessary.

Napi::Value ReadClipboard(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (!OpenClipboard(NULL)) {
        return env.Null();
    }

    HANDLE hData = GetClipboardData(CF_TEXT);
    if (hData == NULL) {
        CloseClipboard();
        return env.Null();
    }

    char *pchData = static_cast<char*>(GlobalLock(hData));
    if (pchData == NULL) {
        CloseClipboard();
        return env.Null();
    }

    std::string clipboardText(pchData);

    GlobalUnlock(hData);
    CloseClipboard();

    return Napi::String::New(env, clipboardText);
}

Napi::Value WriteClipboard(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (!OpenClipboard(NULL)) {
        return Napi::Boolean::New(env, false);
    }

    EmptyClipboard();

    std::string text = info[0].As<Napi::String>().Utf8Value();
    HGLOBAL hData = GlobalAlloc(GMEM_MOVEABLE, text.size() + 1);
    if (hData == NULL) {
        CloseClipboard();
        return Napi::Boolean::New(env, false);
    }

    char *pchData = static_cast<char*>(GlobalLock(hData));
    if (pchData == NULL) {
        GlobalFree(hData);
        CloseClipboard();
        return Napi::Boolean::New(env, false);
    }

    memcpy(pchData, text.c_str(), text.size() + 1);
    GlobalUnlock(hData);

    SetClipboardData(CF_TEXT, hData);
    CloseClipboard();

    return Napi::Boolean::New(env, true);
}

Napi::Value ClipboardPaste(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Simulate CTRL+V keypress
    INPUT inputs[4] = {};

    // CTRL down
    inputs[0].type = INPUT_KEYBOARD;
    inputs[0].ki.wVk = VK_CONTROL;

    // V down
    inputs[1].type = INPUT_KEYBOARD;
    inputs[1].ki.wVk = 'V';

    // V up
    inputs[2].type = INPUT_KEYBOARD;
    inputs[2].ki.wVk = 'V';
    inputs[2].ki.dwFlags = KEYEVENTF_KEYUP;

    // CTRL up
    inputs[3].type = INPUT_KEYBOARD;
    inputs[3].ki.wVk = VK_CONTROL;
    inputs[3].ki.dwFlags = KEYEVENTF_KEYUP;

    UINT uSent = SendInput(ARRAYSIZE(inputs), inputs, sizeof(INPUT));
    if (uSent != ARRAYSIZE(inputs)) {
        return Napi::Boolean::New(env, false);
    }

    return Napi::Boolean::New(env, true);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "ReadClipboard"), Napi::Function::New(env, ReadClipboard));
    exports.Set(Napi::String::New(env, "WriteClipboard"), Napi::Function::New(env, WriteClipboard));
    exports.Set(Napi::String::New(env, "ClipboardPaste"), Napi::Function::New(env, ClipboardPaste));
    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init);