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
 */
bool click(Napi::Env env, int x, int y, const string& windowTitle, int holdFor, int delayAfter, int clickCount, const string& button) {
    HWND hwnd = FindWindowA(nullptr, windowTitle.c_str());
    if (!hwnd) {
        Napi::Error::New(env, "Could not find the window: " + windowTitle).ThrowAsJavaScriptException();
        return false;
    }

    POINT pt = {x, y};
    ClientToScreen(hwnd, &pt);
    DWORD downFlag = (button == "right") ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_LEFTDOWN;
    DWORD upFlag = (button == "right") ? MOUSEEVENTF_RIGHTUP : MOUSEEVENTF_LEFTUP;
    
    for (int i = 0; i < clickCount; i++) {
        SetCursorPos(pt.x, pt.y);
        mouse_event(downFlag, 0, 0, 0, 0);
        std::this_thread::sleep_for(std::chrono::milliseconds(holdFor));
        mouse_event(upFlag, 0, 0, 0, 0);
        std::this_thread::sleep_for(std::chrono::milliseconds(delayAfter));
    }
    return true;
}

Napi::Value clickNapi(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 7) {
        Napi::Error::New(env, "Expected 7 arguments").ThrowAsJavaScriptException();
    }

    int x = info[0].As<Napi::Number>().Int32Value();
    int y = info[1].As<Napi::Number>().Int32Value();
    string windowTitle = info[2].As<Napi::String>().Utf8Value();
    int holdFor = info[3].As<Napi::Number>().Int32Value();
    int delayAfter = info[4].As<Napi::Number>().Int32Value();
    int clickCount = info[5].As<Napi::Number>().Int32Value();
    string button = info[6].As<Napi::String>().Utf8Value();

    bool result = click(env, x, y, windowTitle, holdFor, delayAfter, clickCount, button); 

    return Napi::Boolean::New(env, result);
}

bool clickDesktop(int x, int y, int holdFor, int delayAfter, int clickCount, const string& button) {
    HWND hwnd = GetDesktopWindow();
    POINT pt = {x, y};
    ClientToScreen(hwnd, &pt);
    DWORD downFlag = (button == "right") ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_LEFTDOWN;
    DWORD upFlag = (button == "right") ? MOUSEEVENTF_RIGHTUP : MOUSEEVENTF_LEFTUP;

    for (int i = 0; i < clickCount; i++) {
        SetCursorPos(pt.x, pt.y);
        mouse_event(downFlag, pt.x, pt.y, 0, 0);
        std::this_thread::sleep_for(std::chrono::milliseconds(holdFor));
        mouse_event(upFlag, pt.x, pt.y, 0, 0);
        std::this_thread::sleep_for(std::chrono::milliseconds(delayAfter));
    }
    return true;
}

Napi::Value clickDesktopNapi(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 6) {
        Napi::Error::New(env, "Expected 6 arguments").ThrowAsJavaScriptException();
    }

    int x = info[0].As<Napi::Number>().Int32Value();
    int y = info[1].As<Napi::Number>().Int32Value();
    int holdFor = info[2].As<Napi::Number>().Int32Value();
    int delayAfter = info[3].As<Napi::Number>().Int32Value();
    int clickCount = info[4].As<Napi::Number>().Int32Value();
    string button = info[5].As<Napi::String>().Utf8Value();

    bool result = clickDesktop(x, y, holdFor, delayAfter, clickCount, button);

    return Napi::Boolean::New(env, result);
}

Napi::Value getPosition(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1) {
        Napi::Error::New(env, "Expected 1 argument").ThrowAsJavaScriptException();
    }

    string windowTitle = info[0].As<Napi::String>().Utf8Value();
    HWND hwnd = FindWindowA(nullptr, windowTitle.c_str());
    if (!hwnd) {
        Napi::Error::New(env, "Could not find the window: " + windowTitle).ThrowAsJavaScriptException();
    }

    POINT p;
    if (GetCursorPos(&p)) {
        // Convert screen coordinates to client coordinates for the specific window
        ScreenToClient(hwnd, &p);
        Napi::Object result = Napi::Object::New(env);
        result.Set("x", Napi::Number::New(env, p.x));
        result.Set("y", Napi::Number::New(env, p.y));
        return result;
    } else {
        return env.Null();
    }
}

bool hold(Napi::Env env, int x, int y, const string& windowTitle, const string& button) {
    HWND hwnd = FindWindowA(nullptr, windowTitle.c_str());
    if (!hwnd) {
        Napi::Error::New(env, "Could not find the window: " + windowTitle).ThrowAsJavaScriptException();
    }

    POINT pt = {x, y};
    ClientToScreen(hwnd, &pt);
    WPARAM wParam = (button == "right") ? MK_RBUTTON : MK_LBUTTON;
    LPARAM lParam = MAKELPARAM(pt.x, pt.y);
    UINT downMsg = (button == "right") ? WM_RBUTTONDOWN : WM_LBUTTONDOWN;
    
    PostMessage(hwnd, downMsg, wParam, lParam);
    return true;
}

bool release(Napi::Env env, int x, int y, const string& windowTitle, const string& button) {
    HWND hwnd = FindWindowA(nullptr, windowTitle.c_str());
    if (!hwnd) {
        Napi::Error::New(env, "Could not find the window: " + windowTitle).ThrowAsJavaScriptException();
    }

    POINT pt = {x, y};
    ClientToScreen(hwnd, &pt);
    WPARAM wParam = (button == "right") ? MK_RBUTTON : MK_LBUTTON;
    LPARAM lParam = MAKELPARAM(pt.x, pt.y);
    UINT upMsg = (button == "right") ? WM_RBUTTONUP : WM_LBUTTONUP;
    
    PostMessage(hwnd, upMsg, wParam, lParam);
    return true;
}

Napi::Value holdNapi(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 4) {
        Napi::Error::New(env, "Expected 4 arguments").ThrowAsJavaScriptException();
    }

    int x = info[0].As<Napi::Number>().Int32Value();
    int y = info[1].As<Napi::Number>().Int32Value();
    string windowTitle = info[2].As<Napi::String>().Utf8Value();
    string button = info[3].As<Napi::String>().Utf8Value();

    bool result = hold(env, x, y, windowTitle, button);
    return Napi::Boolean::New(env, result);
}

Napi::Value releaseNapi(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 4) {
        Napi::Error::New(env, "Expected 4 arguments").ThrowAsJavaScriptException();
    }

    int x = info[0].As<Napi::Number>().Int32Value();
    int y = info[1].As<Napi::Number>().Int32Value();
    string windowTitle = info[2].As<Napi::String>().Utf8Value();
    string button = info[3].As<Napi::String>().Utf8Value();

    bool result = release(env, x, y, windowTitle, button);
    return Napi::Boolean::New(env, result);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "click"), Napi::Function::New(env, clickNapi));
    exports.Set(Napi::String::New(env, "getPosition"), Napi::Function::New(env, getPosition));
    exports.Set(Napi::String::New(env, "clickDesktop"), Napi::Function::New(env, clickDesktopNapi));
    exports.Set(Napi::String::New(env, "hold"), Napi::Function::New(env, holdNapi));
    exports.Set(Napi::String::New(env, "release"), Napi::Function::New(env, releaseNapi));
    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)
