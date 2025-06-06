#include <napi.h>
#include <windows.h>
#include <string>
#include <memory>
#include "common.h"

using namespace cashew;

// Clipboardy (npm package) crashes when an image is read, so we use this to avoid the error
// We can just wrap it in a try catch though... I don't know why I wrote this tbh. This was so unnecessary.

// AsyncWorker for reading clipboard
class ReadClipboardWorker : public Napi::AsyncWorker {
public:
    ReadClipboardWorker(const Napi::Env& env)
        : Napi::AsyncWorker(env) {}

    void Execute() override {
        if (!OpenClipboard(NULL)) {
            SetError("Failed to open clipboard");
            return;
        }

        HANDLE hData = GetClipboardData(CF_TEXT);
        if (hData == NULL) {
            CloseClipboard();
            SetError("No text data in clipboard");
            return;
        }

        char *pchData = static_cast<char*>(GlobalLock(hData));
        if (pchData == NULL) {
            CloseClipboard();
            SetError("Failed to lock clipboard data");
            return;
        }

        clipboardText_ = std::string(pchData);

        GlobalUnlock(hData);
        CloseClipboard();
        hasText_ = true;
    }

    void OnOK() override {
        Napi::HandleScope scope(Env());
        if (hasText_) {
            deferred_.Resolve(Napi::String::New(Env(), clipboardText_));
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
    std::string clipboardText_;
    bool hasText_ = false;
};

// AsyncWorker for writing to clipboard
class WriteClipboardWorker : public Napi::AsyncWorker {
public:
    WriteClipboardWorker(const Napi::Env& env, const std::string& text)
        : Napi::AsyncWorker(env), text_(text) {}

    void Execute() override {
        if (!OpenClipboard(NULL)) {
            SetError("Failed to open clipboard");
            return;
        }

        if (!EmptyClipboard()) {
            CloseClipboard();
            SetError("Failed to empty clipboard");
            return;
        }

        HGLOBAL hData = GlobalAlloc(GMEM_MOVEABLE, text_.size() + 1);
        if (hData == NULL) {
            CloseClipboard();
            SetError("Failed to allocate global memory");
            return;
        }

        char *pchData = static_cast<char*>(GlobalLock(hData));
        if (pchData == NULL) {
            GlobalFree(hData);
            CloseClipboard();
            SetError("Failed to lock global memory");
            return;
        }

        memcpy(pchData, text_.c_str(), text_.size() + 1);
        GlobalUnlock(hData);

        if (!SetClipboardData(CF_TEXT, hData)) {
            GlobalFree(hData);
            CloseClipboard();
            SetError("Failed to set clipboard data");
            return;
        }

        CloseClipboard();
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
    std::string text_;
    bool success_ = false;
};

// AsyncWorker for clipboard paste
class ClipboardPasteWorker : public Napi::AsyncWorker {
public:
    ClipboardPasteWorker(const Napi::Env& env)
        : Napi::AsyncWorker(env) {}

    void Execute() override {
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
            SetError("Failed to send input events");
            return;
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
    bool success_ = false;
};

Napi::Value ReadClipboard(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    auto* worker = new ReadClipboardWorker(env);
    worker->Queue();
    return worker->GetPromise();
}

Napi::Value WriteClipboard(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::Error::New(env, "Expected string as first argument").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string text = info[0].As<Napi::String>().Utf8Value();

    auto* worker = new WriteClipboardWorker(env, text);
    worker->Queue();
    return worker->GetPromise();
}

Napi::Value ClipboardPaste(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    auto* worker = new ClipboardPasteWorker(env);
    worker->Queue();
    return worker->GetPromise();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "ReadClipboard"), Napi::Function::New(env, ReadClipboard));
    exports.Set(Napi::String::New(env, "WriteClipboard"), Napi::Function::New(env, WriteClipboard));
    exports.Set(Napi::String::New(env, "ClipboardPaste"), Napi::Function::New(env, ClipboardPaste));
    return exports;
}

CASHEW_MODULE_INIT(clipboard, Init)
// todo clipboard.paste into application