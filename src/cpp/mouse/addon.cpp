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

bool click(int x, int y, const string& windowTitle, int holdFor, int delayAfter, int clickCount, const string& button) {
    HWND hwnd;
    if (windowTitle.empty()) {
        hwnd = GetDesktopWindow();
    } else {
        hwnd = FindWindowA(nullptr, windowTitle.c_str());
        if (!hwnd) {
            std::cout << "Window not found: " << windowTitle << std::endl;
            return false;
        }
    }

    POINT pt = {x, y};
    ClientToScreen(hwnd, &pt);
    WPARAM wParam = (button == "right") ? MK_RBUTTON : MK_LBUTTON;
    LPARAM lParam = MAKELPARAM(pt.x, pt.y);
    UINT downMsg = (button == "right") ? WM_RBUTTONDOWN : WM_LBUTTONDOWN;
    UINT upMsg = (button == "right") ? WM_RBUTTONUP : WM_LBUTTONUP;
    
    for (int i = 0; i < clickCount; i++) {
        PostMessage(hwnd, downMsg, wParam, lParam);
        std::this_thread::sleep_for(std::chrono::milliseconds(holdFor));
        PostMessage(hwnd, upMsg, wParam, lParam);
        std::this_thread::sleep_for(std::chrono::milliseconds(delayAfter));
    }
    return true;
}

Napi::Value clickNapi(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 7) {
        throw Napi::TypeError::New(env, "Expected 7 arguments");
    }

    int x = info[0].As<Napi::Number>().Int32Value();
    int y = info[1].As<Napi::Number>().Int32Value();
    string windowTitle = info[2].As<Napi::String>().Utf8Value();
    int holdFor = info[3].As<Napi::Number>().Int32Value();
    int delayAfter = info[4].As<Napi::Number>().Int32Value();
    int clickCount = info[5].As<Napi::Number>().Int32Value();
    string button = info[6].As<Napi::String>().Utf8Value();

    bool result = click(x, y, windowTitle, holdFor, delayAfter, clickCount, button); 

    return Napi::Boolean::New(env, result);
}

Napi::Value getPosition(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    POINT p;
    if (GetCursorPos(&p)) {
        Napi::Object result = Napi::Object::New(env);
        result.Set("x", Napi::Number::New(env, p.x));
        result.Set("y", Napi::Number::New(env, p.y));
        return result;
    } else {
        return env.Null();
    }
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "click"), Napi::Function::New(env, clickNapi));
    exports.Set(Napi::String::New(env, "getPosition"), Napi::Function::New(env, getPosition));
    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)