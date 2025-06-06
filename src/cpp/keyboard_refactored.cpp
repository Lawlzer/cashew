#include "common.h"
#include "input_utils.h"
#include <vector>

using namespace cashew;
using namespace cashew::input;

// Simplified HoldKey worker
class HoldKeyWorker : public BaseAsyncWorker<void> {
private:
    WORD keyCode_;
    std::string windowTitle_;

public:
    HoldKeyWorker(const Napi::Env& env, WORD keyCode, const std::string& windowTitle)
        : BaseAsyncWorker(env), keyCode_(keyCode), windowTitle_(windowTitle) {}

    void Execute() override {
        WindowInputSender sender(windowTitle_);
        if (!sender.isValid() && !windowTitle_.empty()) {
            SetError(sender.getError());
            return;
        }

        InputBatcher batcher;
        if (!batcher.addKey(keyCode_, true).send()) {
            SetError(constants::ERR_SENDINPUT_FAILED);
        }
    }
};

// Simplified ReleaseKey worker
class ReleaseKeyWorker : public BaseAsyncWorker<void> {
private:
    WORD keyCode_;
    std::string windowTitle_;

public:
    ReleaseKeyWorker(const Napi::Env& env, WORD keyCode, const std::string& windowTitle)
        : BaseAsyncWorker(env), keyCode_(keyCode), windowTitle_(windowTitle) {}

    void Execute() override {
        WindowInputSender sender(windowTitle_);
        if (!sender.isValid() && !windowTitle_.empty()) {
            SetError(sender.getError());
            return;
        }

        InputBatcher batcher;
        if (!batcher.addKey(keyCode_, false).send()) {
            SetError(constants::ERR_SENDINPUT_FAILED);
        }
    }
};

// Simplified IsKeyPressed worker
class IsKeyPressedWorker : public BaseAsyncWorker<bool> {
private:
    int keyCode_;
    bool isPressed_ = false;

public:
    IsKeyPressedWorker(const Napi::Env& env, int keyCode)
        : BaseAsyncWorker(env), keyCode_(keyCode) {}

    void Execute() override {
        isPressed_ = (GetAsyncKeyState(keyCode_) & constants::KEY_PRESSED_MASK) != 0;
    }

    void OnOK() override {
        Napi::HandleScope scope(Env());
        deferred_.Resolve(Napi::Boolean::New(Env(), isPressed_));
    }
};

// Simplified Type worker
class TypeWorker : public BaseAsyncWorker<bool> {
private:
    std::vector<WORD> keyCodes_;
    std::string windowTitle_;
    int delayPerKey_;
    bool success_ = false;

public:
    TypeWorker(const Napi::Env& env, const std::vector<WORD>& keyCodes,
               const std::string& windowTitle, int delayPerKey)
        : BaseAsyncWorker(env), keyCodes_(keyCodes),
          windowTitle_(windowTitle), delayPerKey_(delayPerKey) {}

    void Execute() override {
        WindowInputSender sender(windowTitle_);
        if (!sender.isValid()) {
            SetError(sender.getError());
            return;
        }

        // Send characters via window messages
        for (WORD keyCode : keyCodes_) {
            if (!sender.sendChar(keyCode)) {
                SetError("Failed to send character");
                return;
            }
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
};

// Simplified TapKey worker
class TapKeyWorker : public BaseAsyncWorker<void> {
private:
    WORD keyCode_;
    std::string windowTitle_;

public:
    TapKeyWorker(const Napi::Env& env, WORD keyCode, const std::string& windowTitle)
        : BaseAsyncWorker(env), keyCode_(keyCode), windowTitle_(windowTitle) {}

    void Execute() override {
        WindowInputSender sender(windowTitle_);
        if (!sender.isValid() && !windowTitle_.empty()) {
            SetError(sender.getError());
            return;
        }

        InputBatcher batcher;
        if (!batcher.addKey(keyCode_, true)
                   .addKey(keyCode_, false)
                   .send()) {
            SetError(constants::ERR_SENDINPUT_FAILED);
        }
    }
};

// Simplified HoldKeyForDuration worker
class HoldKeyForDurationWorker : public BaseAsyncWorker<void> {
private:
    WORD keyCode_;
    int duration_;

public:
    HoldKeyForDurationWorker(const Napi::Env& env, WORD keyCode, int duration)
        : BaseAsyncWorker(env), keyCode_(keyCode), duration_(duration) {}

    void Execute() override {
        InputBatcher batcher;
        
        // Send key down
        if (!batcher.addKey(keyCode_, true).send()) {
            SetError(constants::ERR_SENDINPUT_FAILED);
            return;
        }

        // Hold for duration
        std::this_thread::sleep_for(std::chrono::milliseconds(duration_));

        // Send key up
        batcher.clear();
        if (!batcher.addKey(keyCode_, false).send()) {
            SetError(constants::ERR_SENDINPUT_FAILED);
        }
    }
};

// API Functions with improved validation
Napi::Value HoldKey(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (!validation::requireNumber(info, 0, "keyCode")) {
        return env.Null();
    }

    WORD keyCode = info[0].As<Napi::Number>().Uint32Value();
    std::string windowTitle;
    
    if (info.Length() >= 2 && info[1].IsString()) {
        windowTitle = info[1].As<Napi::String>().Utf8Value();
    }

    auto* worker = new HoldKeyWorker(env, keyCode, windowTitle);
    worker->Queue();
    return worker->GetPromise();
}

Napi::Value ReleaseKey(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (!validation::requireNumber(info, 0, "keyCode")) {
        return env.Null();
    }

    WORD keyCode = info[0].As<Napi::Number>().Uint32Value();
    std::string windowTitle;
    
    if (info.Length() >= 2 && info[1].IsString()) {
        windowTitle = info[1].As<Napi::String>().Utf8Value();
    }

    auto* worker = new ReleaseKeyWorker(env, keyCode, windowTitle);
    worker->Queue();
    return worker->GetPromise();
}

Napi::Value IsKeyPressed(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (!validation::requireNumber(info, 0, "keyCode")) {
        return env.Null();
    }

    int keyCode = info[0].As<Napi::Number>().Int32Value();

    auto* worker = new IsKeyPressedWorker(env, keyCode);
    worker->Queue();
    return worker->GetPromise();
}

Napi::Value Type(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() != 3) {
        Napi::Error::New(env, "Expected exactly 3 arguments: keycodesArray, windowTitle, delayPerKey")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    if (!info[0].IsArray() || 
        !validation::requireString(info, 1, "windowTitle") ||
        !validation::requireNumber(info, 2, "delayPerKey")) {
        return env.Null();
    }

    Napi::Array keyArray = info[0].As<Napi::Array>();
    std::string windowTitle = info[1].As<Napi::String>().Utf8Value();
    int delay = info[2].As<Napi::Number>().Uint32Value();

    // Extract key codes from array
    std::vector<WORD> keyCodes;
    keyCodes.reserve(keyArray.Length());
    
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

    if (!validation::requireNumber(info, 0, "keyCode")) {
        return env.Null();
    }

    WORD keyCode = info[0].As<Napi::Number>().Uint32Value();
    std::string windowTitle;
    
    if (info.Length() >= 2 && info[1].IsString()) {
        windowTitle = info[1].As<Napi::String>().Utf8Value();
    }

    auto* worker = new TapKeyWorker(env, keyCode, windowTitle);
    worker->Queue();
    return worker->GetPromise();
}

Napi::Value HoldKeyForDuration(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() != 2 ||
        !validation::requireNumber(info, 0, "keyCode") ||
        !validation::requireNumber(info, 1, "duration")) {
        return env.Null();
    }

    WORD keyCode = info[0].As<Napi::Number>().Uint32Value();
    int duration = info[1].As<Napi::Number>().Uint32Value();

    auto* worker = new HoldKeyForDurationWorker(env, keyCode, duration);
    worker->Queue();
    return worker->GetPromise();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("holdKey", Napi::Function::New(env, HoldKey));
    exports.Set("releaseKey", Napi::Function::New(env, ReleaseKey));
    exports.Set("isKeyPressed", Napi::Function::New(env, IsKeyPressed));
    exports.Set("type", Napi::Function::New(env, Type));
    exports.Set("tapKey", Napi::Function::New(env, TapKey));
    exports.Set("holdKeyForDuration", Napi::Function::New(env, HoldKeyForDuration));
    return exports;
}

CASHEW_MODULE_INIT(keyboardAsync, Init) 