#include <napi.h>
#include <windows.h>
#include <thread>
#include <atomic>
#include <mutex>
#include <unordered_map>
#include <vector>
#include <memory>
#include "common.h"

using namespace cashew;

// Callback information structure
struct CallbackInfo {
    Napi::ThreadSafeFunction tsfn;
    std::vector<WORD> keyCodes;  // Empty means listen to all keys
    bool triggerOnce;
    std::unordered_map<WORD, bool> keyStates;  // Track key states for triggerOnce
};

// Global variables
static std::mutex g_callbackMutex;
static std::vector<std::shared_ptr<CallbackInfo>> g_callbacks;
static HHOOK g_keyboardHook = NULL;
static std::atomic<bool> g_hookActive(false);
static std::thread g_hookThread;

// Low-level keyboard hook procedure
LRESULT CALLBACK LowLevelKeyboardProc(int nCode, WPARAM wParam, LPARAM lParam) {
    if (nCode >= 0) {
        KBDLLHOOKSTRUCT* pKeyboard = (KBDLLHOOKSTRUCT*)lParam;
        WORD keyCode = static_cast<WORD>(pKeyboard->vkCode);
        bool isKeyDown = (wParam == WM_KEYDOWN || wParam == WM_SYSKEYDOWN);
        bool isKeyUp = (wParam == WM_KEYUP || wParam == WM_SYSKEYUP);
        
        if (isKeyDown || isKeyUp) {
            std::lock_guard<std::mutex> lock(g_callbackMutex);
            
            for (auto& callbackInfo : g_callbacks) {
                // Check if this callback is interested in this key
                bool shouldTrigger = false;
                
                if (callbackInfo->keyCodes.empty()) {
                    // Listening to all keys
                    shouldTrigger = true;
                } else {
                    // Check if this key is in the list
                    for (WORD targetKey : callbackInfo->keyCodes) {
                        if (targetKey == keyCode) {
                            shouldTrigger = true;
                            break;
                        }
                    }
                }
                
                if (shouldTrigger && isKeyDown) {
                    // Check triggerOnce logic
                    if (callbackInfo->triggerOnce) {
                        bool wasPressed = callbackInfo->keyStates[keyCode];
                        if (wasPressed) {
                            continue;  // Skip if already pressed
                        }
                        callbackInfo->keyStates[keyCode] = true;
                    }
                    
                    // Prepare data to pass to JavaScript
                    auto callback = [keyCode, timestamp = pKeyboard->time](Napi::Env env, Napi::Function jsCallback) {
                        Napi::Object event = Napi::Object::New(env);
                        event.Set("keyCode", Napi::Number::New(env, keyCode));
                        event.Set("timestamp", Napi::Number::New(env, timestamp));
                        
                        jsCallback.Call({event});
                    };
                    
                    // Queue the callback to be called on the JavaScript thread
                    callbackInfo->tsfn.NonBlockingCall(callback);
                } else if (shouldTrigger && isKeyUp && callbackInfo->triggerOnce) {
                    // Reset key state on key up
                    callbackInfo->keyStates[keyCode] = false;
                }
            }
        }
    }
    
    return CallNextHookEx(g_keyboardHook, nCode, wParam, lParam);
}

// Message loop thread for the hook
void HookMessageLoop() {
    // Install the low-level keyboard hook
    g_keyboardHook = SetWindowsHookEx(
        WH_KEYBOARD_LL,
        LowLevelKeyboardProc,
        GetModuleHandle(NULL),
        0
    );
    
    if (!g_keyboardHook) {
        return;
    }
    
    // Message loop - required for hooks to work
    MSG msg;
    while (g_hookActive.load() && GetMessage(&msg, NULL, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }
    
    // Cleanup
    if (g_keyboardHook) {
        UnhookWindowsHookEx(g_keyboardHook);
        g_keyboardHook = NULL;
    }
}

// Ensure hook is started
void EnsureHookStarted() {
    std::lock_guard<std::mutex> lock(g_callbackMutex);
    
    if (!g_hookActive.load()) {
        g_hookActive.store(true);
        g_hookThread = std::thread(HookMessageLoop);
        
        // Give the hook thread time to start
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
}

// Register a keyboard listener
Napi::Value RegisterKeyListener(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    // Validate arguments
    if (info.Length() < 3) {
        Napi::Error::New(env, "Expected 3 arguments: keyCodes, callback, options").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    if (!info[0].IsArray() || !info[1].IsFunction() || !info[2].IsObject()) {
        Napi::Error::New(env, "Invalid arguments: expected (array, function, object)").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    // Parse key codes
    std::vector<WORD> keyCodes;
    Napi::Array keyArray = info[0].As<Napi::Array>();
    for (uint32_t i = 0; i < keyArray.Length(); i++) {
        Napi::Maybe<Napi::Value> maybeVal = keyArray.Get(i);
        if (maybeVal.IsNothing()) continue;
        
        Napi::Value val = maybeVal.Unwrap();
        if (val.IsNumber()) {
            keyCodes.push_back(static_cast<WORD>(val.As<Napi::Number>().Uint32Value()));
        }
    }
    
    // Parse options
    Napi::Object options = info[2].As<Napi::Object>();
    bool triggerOnce = true;  // Default
    
    Napi::Maybe<Napi::Value> maybeTriggerOnce = options.Get("triggerOnce");
    if (!maybeTriggerOnce.IsNothing()) {
        Napi::Value triggerOnceVal = maybeTriggerOnce.Unwrap();
        if (triggerOnceVal.IsBoolean()) {
            triggerOnce = triggerOnceVal.As<Napi::Boolean>().Value();
        }
    }
    
    // Create ThreadSafeFunction
    Napi::Function callback = info[1].As<Napi::Function>();
    auto tsfn = Napi::ThreadSafeFunction::New(
        env,
        callback,
        "KeyboardHookCallback",
        0,  // Unlimited queue
        1   // Initial thread count
    );
    
    // Create callback info
    auto callbackInfo = std::make_shared<CallbackInfo>();
    callbackInfo->tsfn = tsfn;
    callbackInfo->keyCodes = keyCodes;
    callbackInfo->triggerOnce = triggerOnce;
    
    // Add to callbacks list
    {
        std::lock_guard<std::mutex> lock(g_callbackMutex);
        g_callbacks.push_back(callbackInfo);
    }
    
    // Ensure hook is running
    EnsureHookStarted();
    
    // Return a function that can be called to unregister
    auto unregisterFunc = Napi::Function::New(env, [callbackInfo](const Napi::CallbackInfo& info) {
        std::lock_guard<std::mutex> lock(g_callbackMutex);
        
        // Remove this callback from the list
        g_callbacks.erase(
            std::remove(g_callbacks.begin(), g_callbacks.end(), callbackInfo),
            g_callbacks.end()
        );
        
        // Release the ThreadSafeFunction
        callbackInfo->tsfn.Release();
        
        // If no more callbacks, we could stop the hook thread
        // But keeping it running is fine for performance
    });
    
    return unregisterFunc;
}

// Stop all keyboard hooks
Napi::Value StopAllKeyboardHooks(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    {
        std::lock_guard<std::mutex> lock(g_callbackMutex);
        
        // Release all ThreadSafeFunctions
        for (auto& callbackInfo : g_callbacks) {
            callbackInfo->tsfn.Release();
        }
        
        g_callbacks.clear();
    }
    
    // Stop the hook thread
    if (g_hookActive.load()) {
        g_hookActive.store(false);
        
        // Post a quit message to break the message loop
        if (g_hookThread.joinable()) {
            PostThreadMessage(GetThreadId(g_hookThread.native_handle()), WM_QUIT, 0, 0);
            g_hookThread.join();
        }
    }
    
    return env.Undefined();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("registerKeyListener", Napi::Function::New(env, RegisterKeyListener));
    exports.Set("stopAllKeyboardHooks", Napi::Function::New(env, StopAllKeyboardHooks));
    
    return exports;
}

CASHEW_MODULE_INIT(keyboardHooks, Init) 