#include <iostream>
#include <napi.h>
#include <windows.h>
#include <vector>
#include <thread>
#include <chrono>
#include <fstream>
#include <cmath>
#include <map>
#include <algorithm>
#include <optional>
#include <deque>
#include <cstring>
#include <string>

using std::string;

struct rgb {
    unsigned int r, g, b;
};

/**
 * Windows doesn't seem to allow you to click on background applications, without bringing them to the foregorund first.
 * Merged click logic directly into Napi function.
 */
// bool click(Napi::Env env, int x, int y, int holdFor, int delayAfter, int clickCount, const string& button) { ... } // Removed

// Function to send or post WM_LBUTTONDOWN/UP messages to a window
Napi::Value clickMessageNapi(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Expected args: x(num), y(num), holdFor(num), windowTitle(str), messageType(str: 'send'|'post')
    if (info.Length() != 5) {
        Napi::Error::New(env, "Expected 5 arguments: x, y, holdFor, windowTitle, messageType").ThrowAsJavaScriptException();
        return env.Null();
    }
    if (!info[0].IsNumber() || !info[1].IsNumber() || !info[2].IsNumber() || !info[3].IsString() || !info[4].IsString()) {
        Napi::Error::New(env, "Invalid argument types. Expected: number, number, number, string, string").ThrowAsJavaScriptException();
        return env.Null();
    }

    int x = info[0].As<Napi::Number>().Int32Value();
    int y = info[1].As<Napi::Number>().Int32Value();
    int holdFor = info[2].As<Napi::Number>().Int32Value();
    std::string windowTitle = info[3].As<Napi::String>().Utf8Value();
    std::string messageType = info[4].As<Napi::String>().Utf8Value();

    if (windowTitle.empty()) {
        Napi::Error::New(env, "windowTitle cannot be empty for clickMessage").ThrowAsJavaScriptException();
        return env.Null();
    }
    if (messageType != "send" && messageType != "post") {
         Napi::Error::New(env, "messageType must be either 'send' or 'post'").ThrowAsJavaScriptException();
         return env.Null();
    }

    HWND targetHwnd = FindWindowA(NULL, windowTitle.c_str());
    if (targetHwnd == NULL) {
        std::string errorMsg = "Window with title '" + windowTitle + "' not found.";
        Napi::Error::New(env, errorMsg).ThrowAsJavaScriptException();
        return env.Null();
    }

    LPARAM lParam = MAKELPARAM(x, y); // Pack coordinates for the message
    WPARAM wParam = 0; // Typically 0 for basic button messages, can add MK_SHIFT etc. if needed

    BOOL resultDown = FALSE;
    BOOL resultUp = FALSE;

    if (messageType == "send") {
        resultDown = SendMessage(targetHwnd, WM_LBUTTONDOWN, wParam, lParam);
        std::this_thread::sleep_for(std::chrono::milliseconds(holdFor));
        resultUp = SendMessage(targetHwnd, WM_LBUTTONUP, wParam, lParam);
    } else { // post
        resultDown = PostMessage(targetHwnd, WM_LBUTTONDOWN, wParam, lParam);
        std::this_thread::sleep_for(std::chrono::milliseconds(holdFor));
        resultUp = PostMessage(targetHwnd, WM_LBUTTONUP, wParam, lParam);
    }

    // PostMessage returns non-zero for success posting, SendMessage varies.
    // We might add more robust error checking based on GetLastError if needed.
    // For now, just return null indicating execution (or error was thrown).
    return env.Null();
}

Napi::Value getPosition(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() != 0) {
        Napi::Error::New(env, "Expected 0 arguments").ThrowAsJavaScriptException();
    }

    POINT p;
    if (GetCursorPos(&p)) {
        // Return absolute screen coordinates
        Napi::Object result = Napi::Object::New(env);
        result.Set("x", Napi::Number::New(env, p.x));
        result.Set("y", Napi::Number::New(env, p.y));
        return result;
    } else {
        Napi::Error::New(env, "Failed to get cursor position").ThrowAsJavaScriptException();
        return env.Null(); // Return null on failure
    }
}

// void hold(int x, int y, const string& button) { ... } // Removed

// void release(int x, int y, const string& button) { ... } // Removed

Napi::Value holdNapi(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Args: x (num|null|undef), y (num|null|undef), button (string)
    if (info.Length() != 3) {
        Napi::Error::New(env, "Expected 3 arguments: x, y, button").ThrowAsJavaScriptException();
        return env.Null();
    }

    // Validate types for x and y (Number, Null, or Undefined)
    bool xOk = info[0].IsNumber() || info[0].IsNull() || info[0].IsUndefined();
    bool yOk = info[1].IsNumber() || info[1].IsNull() || info[1].IsUndefined();
    if (!xOk || !yOk || !info[2].IsString()) {
         Napi::Error::New(env, "Invalid argument types. Expected: x(num|null|undef), y(num|null|undef), button(string)").ThrowAsJavaScriptException();
         return env.Null();
    }

    std::optional<POINT> posOpt;
    if(info[0].IsNumber() && info[1].IsNumber()) {
        posOpt = { info[0].As<Napi::Number>().Int32Value(), info[1].As<Napi::Number>().Int32Value() };
    }
    string button = info[2].As<Napi::String>().Utf8Value();

    // Merged logic from hold function
    INPUT input = {0};
    input.type = INPUT_MOUSE;
    DWORD downFlag = (button == "right") ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_LEFTDOWN;
    input.mi.dwFlags = downFlag;

    // If position is specified, move cursor first
    if (posOpt.has_value()) {
        SetCursorPos(posOpt.value().x, posOpt.value().y);
    }

    SendInput(1, &input, sizeof(INPUT));
    // hold(x, y, button); // Removed call to original function
    return env.Null();
}

Napi::Value releaseNapi(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Args: x (num|null|undef), y (num|null|undef), button (string)
    if (info.Length() != 3) {
        Napi::Error::New(env, "Expected 3 arguments: x, y, button").ThrowAsJavaScriptException();
        return env.Null();
    }

    // Validate types for x and y (Number, Null, or Undefined)
    bool xOk = info[0].IsNumber() || info[0].IsNull() || info[0].IsUndefined();
    bool yOk = info[1].IsNumber() || info[1].IsNull() || info[1].IsUndefined();
    if (!xOk || !yOk || !info[2].IsString()) {
         Napi::Error::New(env, "Invalid argument types. Expected: x(num|null|undef), y(num|null|undef), button(string)").ThrowAsJavaScriptException();
         return env.Null();
    }

    std::optional<POINT> posOpt;
    if(info[0].IsNumber() && info[1].IsNumber()) {
        posOpt = { info[0].As<Napi::Number>().Int32Value(), info[1].As<Napi::Number>().Int32Value() };
    }
    string button = info[2].As<Napi::String>().Utf8Value();

    // Merged logic from release function
    INPUT input = {0};
    input.type = INPUT_MOUSE;
    DWORD upFlag = (button == "right") ? MOUSEEVENTF_RIGHTUP : MOUSEEVENTF_LEFTUP;
    input.mi.dwFlags = upFlag;

    // Optional: Move cursor before releasing? Generally not needed.
    if (posOpt.has_value()) {
        // If you uncomment this, make sure it aligns with desired behavior.
        // SetCursorPos(posOpt.value().x, posOpt.value().y);
    }

    SendInput(1, &input, sizeof(INPUT));
    // release(x, y, button); // Removed call to original function
    return env.Null();
}

// N-API wrapper for clickDesktop
// Renamed to clickNapi
Napi::Value clickNapi(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Expect 4 or 5 arguments: x, y, button, holdFor, [windowTitle]
    if (info.Length() < 4 || info.Length() > 5) {
        Napi::Error::New(env, "Expected 4 or 5 arguments: x, y, button, holdFor, [windowTitle]").ThrowAsJavaScriptException();
        return env.Null();
    }

    // Validate types: x/y (num|null|undef), button(str), holdFor(num), windowTitle(str|null|undef)
    bool xOk = info[0].IsNumber() || info[0].IsNull() || info[0].IsUndefined();
    bool yOk = info[1].IsNumber() || info[1].IsNull() || info[1].IsUndefined();
    bool titleOk = info.Length() < 5 || info[4].IsString() || info[4].IsNull() || info[4].IsUndefined(); // Arg 5 is optional

    if (!xOk || !yOk || !info[2].IsString() || !info[3].IsNumber() || !titleOk) {
        Napi::Error::New(env, "Invalid argument types. Expected: x(num|null|undef), y(num|null|undef), button(string), holdFor(number), [windowTitle(string|null|undef)]").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::optional<POINT> clientPosOpt;
    if(info[0].IsNumber() && info[1].IsNumber()) {
        clientPosOpt = { info[0].As<Napi::Number>().Int32Value(), info[1].As<Napi::Number>().Int32Value() };
    }

    std::string button = info[2].As<Napi::String>().Utf8Value();
    int holdFor = info[3].As<Napi::Number>().Int32Value();
    std::string windowTitle = "";
    HWND targetHwnd = NULL; // Window handle

    // Check for windowTitle (arg 4)
    if (info.Length() == 5 && info[4].IsString()) {
        windowTitle = info[4].As<Napi::String>().Utf8Value();
        if (!windowTitle.empty()) {
            targetHwnd = FindWindowA(NULL, windowTitle.c_str());
            if (targetHwnd == NULL) {
                std::string errorMsg = "Window with title '" + windowTitle + "' not found.";
                Napi::Error::New(env, errorMsg).ThrowAsJavaScriptException();
                return env.Null();
            }
        }
    }

    // Merged logic from clickDesktop
    INPUT inputs[2] = {0};

    // Determine screen coordinates for SetCursorPos
    std::optional<POINT> screenPosOpt;
    if (targetHwnd != NULL) {
        // Window title provided: x, y MUST be numbers (client coordinates)
        if (!clientPosOpt.has_value()) {
            Napi::Error::New(env, "Position (x, y) must be provided when windowTitle is specified.").ThrowAsJavaScriptException();
            return env.Null();
        }
        POINT screenPos = clientPosOpt.value(); // Start with client coords
        if (ClientToScreen(targetHwnd, &screenPos)) { // Convert to screen coords
             screenPosOpt = screenPos;
        } else {
             // Handle potential error during coordinate conversion if needed
             // GetLastError() could provide details. Maybe throw error?
             // For now, proceed without setting position if conversion fails.
        }
    } else {
        // No window title: x, y are optional absolute screen coordinates
        if (clientPosOpt.has_value()) {
            screenPosOpt = clientPosOpt.value(); // Use provided screen coords directly
        }
    }

    // Only set cursor position if valid coordinates are provided (not -1)
    // AND if we are either clicking globally or found the target window successfully
    // (We might refine the x=-1, y=-1 behavior later if needed for window-relative clicks)
    // Set cursor position IF screen coordinates were determined
    if (screenPosOpt.has_value()) {
        SetCursorPos(screenPosOpt.value().x, screenPosOpt.value().y);
    }

    DWORD downFlag = (button == "right") ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_LEFTDOWN;
    DWORD upFlag = (button == "right") ? MOUSEEVENTF_RIGHTUP : MOUSEEVENTF_LEFTUP;

    // Mouse button down
    inputs[0].type = INPUT_MOUSE;
    inputs[0].mi.dwFlags = downFlag;

    // Mouse button up
    inputs[1].type = INPUT_MOUSE;
    inputs[1].mi.dwFlags = upFlag;

    SendInput(1, &inputs[0], sizeof(INPUT)); // Send down event
    std::this_thread::sleep_for(std::chrono::milliseconds(holdFor)); // Wait
    SendInput(1, &inputs[1], sizeof(INPUT)); // Send up event
    // clickDesktop(x, y, button, holdFor); // Removed call to original function
    return env.Null();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    // exports.Set(Napi::String::New(env, "click"), Napi::Function::New(env, clickNapi)); // Removed
    exports.Set(Napi::String::New(env, "clickMessage"), Napi::Function::New(env, clickMessageNapi));
    exports.Set(Napi::String::New(env, "getPosition"), Napi::Function::New(env, getPosition));
    exports.Set(Napi::String::New(env, "hold"), Napi::Function::New(env, holdNapi));
    exports.Set(Napi::String::New(env, "release"), Napi::Function::New(env, releaseNapi));
    exports.Set(Napi::String::New(env, "click"), Napi::Function::New(env, clickNapi)); // Renamed export
    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)
