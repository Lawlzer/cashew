#include <napi.h>
#include <windows.h>
#include <thread>
#include <atomic>
#include <memory>
#include <cstdio>
#include <mutex>
#include "common.h"

using namespace cashew;

// Global variables for the hook
static std::mutex g_hookMutex;
static HHOOK g_keyboardHook = NULL;
static WORD g_panicKeyCode = 0;
static std::string g_panicKeyName = "";
static std::atomic<bool> g_hookActive(false);
static std::thread g_hookThread;

// Low-level keyboard hook procedure
LRESULT CALLBACK LowLevelKeyboardProc(int nCode, WPARAM wParam, LPARAM lParam) {
    if (nCode >= 0 && wParam == WM_KEYDOWN) {
        KBDLLHOOKSTRUCT* pKeyboard = (KBDLLHOOKSTRUCT*)lParam;
        
        // Check if the panic key was pressed
        if (pKeyboard->vkCode == g_panicKeyCode && g_hookActive.load()) {
            // Output message to stdout before terminating
            // Using printf and fflush to ensure it's written immediately
            printf("\nShutting down because %s was pressed!\n", g_panicKeyName.c_str());
            fflush(stdout);
            
            // Small delay to ensure the message is visible
            Sleep(50);
            
            // Force terminate the process immediately
            // This will work even if JavaScript is stuck in an infinite loop
            TerminateProcess(GetCurrentProcess(), 1);
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

// AsyncWorker for EnablePanicShutdown
class EnablePanicShutdownWorker : public Napi::AsyncWorker {
public:
    EnablePanicShutdownWorker(const Napi::Env& env, WORD keyCode, const std::string& keyName)
        : Napi::AsyncWorker(env), keyCode_(keyCode), keyName_(keyName), success_(false) {}

    void Execute() override {
        std::lock_guard<std::mutex> lock(g_hookMutex);
        
        // Only allow setting up once
        if (g_hookActive.load()) {
            // Already active
            success_ = true;
            return;
        }
        
        // Set the panic key
        g_panicKeyCode = keyCode_;
        g_panicKeyName = keyName_;
        g_hookActive.store(true);
        
        // Start the hook thread - this is non-blocking
        try {
            g_hookThread = std::thread(HookMessageLoop);
            success_ = true;
        } catch (const std::exception& e) {
            g_hookActive.store(false);
            SetError("Failed to start hook thread: " + std::string(e.what()));
        }
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
    WORD keyCode_;
    std::string keyName_;
    bool success_;
};

// Enable panic shutdown with a specific key
Napi::Value EnablePanicShutdown(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsString()) {
        Napi::TypeError::New(env, "Expected a number (key code) and string (key name)").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    WORD keyCode = static_cast<WORD>(info[0].As<Napi::Number>().Uint32Value());
    std::string keyName = info[1].As<Napi::String>().Utf8Value();
    
    auto* worker = new EnablePanicShutdownWorker(env, keyCode, keyName);
    worker->Queue();
    return worker->GetPromise();
}



Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("enablePanicShutdown", Napi::Function::New(env, EnablePanicShutdown));
    
    return exports;
}

CASHEW_MODULE_INIT(panicShutdown, Init) 