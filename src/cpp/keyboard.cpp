#include "common.h"
#include <napi.h>
#include <windows.h>
#include <vector>
#include <thread> 
#include <chrono>
#include <string>
#include <memory>
#include <map>
#include <mutex>
#include <atomic>
#include <condition_variable>
#include <set>

using namespace cashew;

// Enhanced key state management
struct HeldKeyInfo {
    std::atomic<bool> isHeld{true};
    std::thread workerThread;
    HWND targetWindow{nullptr};
    std::chrono::steady_clock::time_point startTime;
};

// Global map to track held keys with their worker threads
std::map<WORD, std::unique_ptr<HeldKeyInfo>> heldKeys;
std::mutex heldKeysMutex;

// Function to check if a key is an extended key
static bool IsExtendedKey(WORD keyCode) {
    return keyCode == VK_LWIN || keyCode == VK_RWIN || 
           keyCode == VK_APPS || keyCode == VK_RCONTROL || 
           keyCode == VK_RMENU || keyCode == VK_INSERT || 
           keyCode == VK_DELETE || keyCode == VK_HOME || 
           keyCode == VK_END || keyCode == VK_PRIOR || 
           keyCode == VK_NEXT || keyCode == VK_LEFT || 
           keyCode == VK_UP || keyCode == VK_RIGHT || 
           keyCode == VK_DOWN || keyCode == VK_NUMLOCK ||
           keyCode == VK_CANCEL || keyCode == VK_SNAPSHOT ||
           keyCode == VK_DIVIDE;
}

// Worker thread function for continuous key holding
void KeyHoldWorker(WORD keyCode, HeldKeyInfo* info, HWND targetWindow) {
    // Get scan code
    UINT scanCode = MapVirtualKey(keyCode, MAPVK_VK_TO_VSC);
    
    // Prepare input structure
    INPUT input = {0};
    input.type = INPUT_KEYBOARD;
    input.ki.wVk = keyCode;
    input.ki.wScan = scanCode;
    input.ki.dwFlags = 0;
    
    if (::IsExtendedKey(keyCode)) {
        input.ki.dwFlags |= KEYEVENTF_EXTENDEDKEY;
    }
    
    // Send initial key down
    if (targetWindow) {
        // For specific window, try to activate it first
        SetForegroundWindow(targetWindow);
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
    
    SendInput(1, &input, sizeof(INPUT));
    
    // Keep sending key repeat events while held
    // Windows typically repeats keys at ~30Hz after initial delay
    const auto repeatDelay = std::chrono::milliseconds(500); // Initial delay before repeat
    const auto repeatInterval = std::chrono::milliseconds(33); // ~30Hz repeat rate
    
    auto lastSend = std::chrono::steady_clock::now();
    bool initialDelayPassed = false;
    
    while (info->isHeld.load()) {
        auto now = std::chrono::steady_clock::now();
        
        // Check if we should send a repeat
        if (!initialDelayPassed) {
            if (now - info->startTime >= repeatDelay) {
                initialDelayPassed = true;
            }
        }
        
        if (initialDelayPassed && now - lastSend >= repeatInterval) {
            // Some applications need WM_KEYDOWN messages for proper repeat
            if (targetWindow) {
                PostMessage(targetWindow, WM_KEYDOWN, keyCode, 
                           (scanCode << 16) | 0x40000001); // Repeat flag
            } else {
                // For global input, send another key down event
                SendInput(1, &input, sizeof(INPUT));
            }
            lastSend = now;
        }
        
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    
    // Send key up when done
    input.ki.dwFlags = KEYEVENTF_KEYUP;
    if (IsExtendedKey(keyCode)) {
        input.ki.dwFlags |= KEYEVENTF_EXTENDEDKEY;
    }
    SendInput(1, &input, sizeof(INPUT));
    
    // Also send WM_KEYUP to the window if targeted
    if (targetWindow) {
        PostMessage(targetWindow, WM_KEYUP, keyCode, 
                   (scanCode << 16) | 0xC0000001);
    }
}

// AsyncWorker for HoldKey - starts the hold operation
class HoldKeyWorker : public Napi::AsyncWorker {
public:
    HoldKeyWorker(const Napi::Env& env, WORD keyCode, const std::string& windowTitle)
        : Napi::AsyncWorker(env), keyCode_(keyCode), windowTitle_(windowTitle) {}

    void Execute() override {
        HWND hwnd = nullptr;
        if (!windowTitle_.empty()) {
            hwnd = GetTargetWindow(windowTitle_);
            if (!hwnd) {
                SetError("Window not found: " + windowTitle_);
                return;
            }
        }
        targetWindow_ = hwnd;
        
        // Check if key is already held
        {
            std::lock_guard<std::mutex> lock(heldKeysMutex);
            if (heldKeys.find(keyCode_) != heldKeys.end()) {
                SetError("Key is already being held");
                return;
            }
        }
        
        success_ = true;
    }

    void OnOK() override {
        Napi::HandleScope scope(Env());
        
        if (success_) {
            // Start the hold operation
            std::lock_guard<std::mutex> lock(heldKeysMutex);
            
            auto info = std::make_unique<HeldKeyInfo>();
            info->targetWindow = targetWindow_;
            info->startTime = std::chrono::steady_clock::now();
            
            // Start worker thread
            info->workerThread = std::thread(KeyHoldWorker, keyCode_, info.get(), targetWindow_);
            
            heldKeys[keyCode_] = std::move(info);
        }
        
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
    HWND targetWindow_ = nullptr;
    bool success_ = false;
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

        // If window specified, bring it to foreground
        if (hwnd) {
            SetForegroundWindow(hwnd);
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }

        // Get the scan code for the virtual key
        UINT scanCode = MapVirtualKey(keyCode_, MAPVK_VK_TO_VSC);
        
        INPUT input = {0};
        input.type = INPUT_KEYBOARD;
        input.ki.wVk = keyCode_;
        input.ki.wScan = scanCode;
        input.ki.dwFlags = KEYEVENTF_KEYUP; // Key up event
        
        // For extended keys, add the extended flag
        if (IsExtendedKey(keyCode_)) {
            input.ki.dwFlags |= KEYEVENTF_EXTENDEDKEY;
        }
        
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

        // If window specified, bring it to foreground
        if (hwnd) {
            SetForegroundWindow(hwnd);
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }

        // Get the scan code for the virtual key
        UINT scanCode = MapVirtualKey(keyCode_, MAPVK_VK_TO_VSC);
        
        INPUT inputs[2] = {0};
        
        inputs[0].type = INPUT_KEYBOARD;
        inputs[0].ki.wVk = keyCode_;
        inputs[0].ki.wScan = scanCode;
        inputs[0].ki.dwFlags = 0;
        
        inputs[1].type = INPUT_KEYBOARD;
        inputs[1].ki.wVk = keyCode_;
        inputs[1].ki.wScan = scanCode;
        inputs[1].ki.dwFlags = KEYEVENTF_KEYUP;
        
        // Add extended key flag if needed
        if (IsExtendedKey(keyCode_)) {
            inputs[0].ki.dwFlags |= KEYEVENTF_EXTENDEDKEY;
            inputs[1].ki.dwFlags |= KEYEVENTF_EXTENDEDKEY;
        }
        
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
        // Get the scan code for the virtual key
        UINT scanCode = MapVirtualKey(keyCode_, MAPVK_VK_TO_VSC);
        
        // Send key down
        INPUT input = {0};
        input.type = INPUT_KEYBOARD;
        input.ki.wVk = keyCode_;
        input.ki.wScan = scanCode;
        input.ki.dwFlags = 0;
        
        // Add extended key flag if needed
        if (IsExtendedKey(keyCode_)) {
            input.ki.dwFlags |= KEYEVENTF_EXTENDEDKEY;
        }
        
        if (SendInput(1, &input, sizeof(INPUT)) != 1) {
            SetError("Failed to send key down event");
            return;
        }

        // Hold for duration
        std::this_thread::sleep_for(std::chrono::milliseconds(duration_));

        // Send key up
        input.ki.dwFlags = KEYEVENTF_KEYUP;
        if (IsExtendedKey(keyCode_)) {
            input.ki.dwFlags |= KEYEVENTF_EXTENDEDKEY;
        }
        
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

    // Signal the worker thread to stop and clean up
    bool wasHeld = false;
    {
        std::lock_guard<std::mutex> lock(heldKeysMutex);
        auto it = heldKeys.find(keyCode);
        if (it != heldKeys.end()) {
            wasHeld = true;
            it->second->isHeld.store(false);
            
            // Wait for thread to finish
            if (it->second->workerThread.joinable()) {
                it->second->workerThread.join();
            }
            
            heldKeys.erase(it);
        }
    }
    
    // If key wasn't being held, still send a key up event just in case
    if (!wasHeld) {
        auto* worker = new ReleaseKeyWorker(env, keyCode, windowTitle);
        worker->Queue();
        return worker->GetPromise();
    }

    // Return a resolved promise for held keys that were cleaned up
    auto deferred = Napi::Promise::Deferred::New(env);
    deferred.Resolve(env.Undefined());
    return deferred.Promise();
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

Napi::Value StopAllHoldKeys(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    // Stop all worker threads and release keys
    std::vector<std::thread> threadsToJoin;
    
    {
        std::lock_guard<std::mutex> lock(heldKeysMutex);
        
        for (auto& pair : heldKeys) {
            // Signal thread to stop
            pair.second->isHeld.store(false);
            
            // Move thread to join list
            if (pair.second->workerThread.joinable()) {
                threadsToJoin.push_back(std::move(pair.second->workerThread));
            }
        }
        
        heldKeys.clear();
    }
    
    // Join all threads outside the lock
    for (auto& thread : threadsToJoin) {
        thread.join();
    }
    
    return env.Undefined();
}

// Hold multiple keys simultaneously
Napi::Value HoldKeys(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsArray()) {
        Napi::Error::New(env, "Expected array of keyCodes as first argument").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Array keyArray = info[0].As<Napi::Array>();
    std::vector<WORD> keyCodes;
    
    for (uint32_t i = 0; i < keyArray.Length(); i++) {
        Napi::Maybe<Napi::Value> maybeVal = keyArray.Get(i);
        if (maybeVal.IsNothing()) {
            Napi::Error::New(env, "Failed to get array element").ThrowAsJavaScriptException();
            return env.Null();
        }
        Napi::Value val = maybeVal.Unwrap();
        
        if (!val.IsNumber()) {
            Napi::Error::New(env, "All key codes must be numbers").ThrowAsJavaScriptException();
            return env.Null();
        }
        keyCodes.push_back(val.As<Napi::Number>().Uint32Value());
    }
    
    std::string windowTitle = "";
    if (info.Length() >= 2 && info[1].IsString()) {
        windowTitle = info[1].As<Napi::String>().Utf8Value();
    }
    
    HWND hwnd = nullptr;
    if (!windowTitle.empty()) {
        hwnd = GetTargetWindow(windowTitle);
        if (!hwnd) {
            Napi::Error::New(env, "Window not found: " + windowTitle).ThrowAsJavaScriptException();
            return env.Null();
        }
    }
    
    // Hold all keys
    std::vector<Napi::Promise> promises;
    for (WORD keyCode : keyCodes) {
        auto* worker = new HoldKeyWorker(env, keyCode, windowTitle);
        worker->Queue();
        promises.push_back(worker->GetPromise());
    }
    
    // Return the first promise (they all resolve similarly)
    return promises.empty() ? env.Undefined() : promises[0];
}

// Release multiple keys simultaneously
Napi::Value ReleaseKeys(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsArray()) {
        Napi::Error::New(env, "Expected array of keyCodes as first argument").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Array keyArray = info[0].As<Napi::Array>();
    std::vector<WORD> keyCodes;
    
    for (uint32_t i = 0; i < keyArray.Length(); i++) {
        Napi::Maybe<Napi::Value> maybeVal = keyArray.Get(i);
        if (maybeVal.IsNothing()) {
            Napi::Error::New(env, "Failed to get array element").ThrowAsJavaScriptException();
            return env.Null();
        }
        Napi::Value val = maybeVal.Unwrap();
        
        if (!val.IsNumber()) {
            Napi::Error::New(env, "All key codes must be numbers").ThrowAsJavaScriptException();
            return env.Null();
        }
        keyCodes.push_back(val.As<Napi::Number>().Uint32Value());
    }
    
    // Release all keys
    for (WORD keyCode : keyCodes) {
        std::lock_guard<std::mutex> lock(heldKeysMutex);
        auto it = heldKeys.find(keyCode);
        if (it != heldKeys.end()) {
            it->second->isHeld.store(false);
            
            // Don't join here to avoid blocking
            if (it->second->workerThread.joinable()) {
                it->second->workerThread.detach();
            }
            
            heldKeys.erase(it);
        }
    }
    
    return env.Undefined();
}


Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "holdKey"), Napi::Function::New(env, HoldKey));
    exports.Set(Napi::String::New(env, "releaseKey"), Napi::Function::New(env, ReleaseKey));
    exports.Set(Napi::String::New(env, "holdKeys"), Napi::Function::New(env, HoldKeys));
    exports.Set(Napi::String::New(env, "releaseKeys"), Napi::Function::New(env, ReleaseKeys));
    exports.Set(Napi::String::New(env, "isKeyPressed"), Napi::Function::New(env, IsKeyPressed));
    exports.Set(Napi::String::New(env, "type"), Napi::Function::New(env, Type));
    exports.Set(Napi::String::New(env, "tapKey"), Napi::Function::New(env, TapKey));
    exports.Set(Napi::String::New(env, "holdKeyForDuration"), Napi::Function::New(env, HoldKeyForDuration));
    exports.Set(Napi::String::New(env, "stopAllHoldKeys"), Napi::Function::New(env, StopAllHoldKeys));
    return exports;
}

CASHEW_MODULE_INIT(keyboard, Init);
