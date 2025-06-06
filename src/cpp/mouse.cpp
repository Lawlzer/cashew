#include "common.h"
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
#include <memory>

// Define M_PI if it's not defined (common on Windows)
#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

using std::string;
using namespace cashew;

struct rgb {
    unsigned int r, g, b;
};

// Structure for interpolation data
struct InterpolationData {
    double startX, startY;
    double targetX, targetY;
    int steps;
    int delayPerStep;
};

// Helper function to calculate smooth interpolation using easing
double easeInOutCubic(double t) {
    if (t < 0.5) {
        return 4 * t * t * t;
    } else {
        double p = 2 * t - 2;
        return 1 + p * p * p / 2;
    }
}

// AsyncWorker for ClickMessage
class ClickMessageWorker : public Napi::AsyncWorker {
public:
    ClickMessageWorker(const Napi::Env& env,
                      int x, int y, int holdFor,
                      const std::string& windowTitle,
                      const std::string& messageType)
        : Napi::AsyncWorker(env),
          x_(x), y_(y), holdFor_(holdFor),
          windowTitle_(windowTitle), messageType_(messageType) {}

    void Execute() override {
        HWND targetHwnd = FindWindowA(NULL, windowTitle_.c_str());
        if (!targetHwnd) {
            SetError("Window not found: " + windowTitle_);
            return;
        }

        LPARAM lParam = MAKELPARAM(x_, y_);
        WPARAM wParam = 0;

        if (messageType_ == "send") {
            SendMessage(targetHwnd, WM_LBUTTONDOWN, wParam, lParam);
            std::this_thread::sleep_for(std::chrono::milliseconds(holdFor_));
            SendMessage(targetHwnd, WM_LBUTTONUP, wParam, lParam);
        } else { // post
            PostMessage(targetHwnd, WM_LBUTTONDOWN, wParam, lParam);
            std::this_thread::sleep_for(std::chrono::milliseconds(holdFor_));
            PostMessage(targetHwnd, WM_LBUTTONUP, wParam, lParam);
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
    int x_, y_, holdFor_;
    std::string windowTitle_, messageType_;
};

// AsyncWorker for GetPosition
class GetPositionWorker : public Napi::AsyncWorker {
public:
    GetPositionWorker(const Napi::Env& env)
        : Napi::AsyncWorker(env), x_(0), y_(0) {}

    void Execute() override {
        POINT p;
        if (!GetCursorPos(&p)) {
            SetError("Failed to get cursor position");
            return;
        }
        x_ = p.x;
        y_ = p.y;
    }

    void OnOK() override {
        Napi::HandleScope scope(Env());
        Napi::Object result = Napi::Object::New(Env());
        result.Set("x", Napi::Number::New(Env(), x_));
        result.Set("y", Napi::Number::New(Env(), y_));
        deferred_.Resolve(result);
    }

    void OnError(const Napi::Error& error) override {
        deferred_.Reject(error.Value());
    }

    Napi::Promise GetPromise() { return deferred_.Promise(); }

private:
    Napi::Promise::Deferred deferred_ = Napi::Promise::Deferred::New(Env());
    int x_, y_;
};

// AsyncWorker for Hold
class HoldWorker : public Napi::AsyncWorker {
public:
    HoldWorker(const Napi::Env& env,
               std::optional<POINT> pos,
               const std::string& button)
        : Napi::AsyncWorker(env), pos_(pos), button_(button) {}

    void Execute() override {
        INPUT input = {0};
        input.type = INPUT_MOUSE;
        DWORD downFlag = (button_ == "right") ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_LEFTDOWN;
        input.mi.dwFlags = downFlag;

        // If position is specified, move cursor first
        if (pos_.has_value()) {
            SetCursorPos(pos_.value().x, pos_.value().y);
        }

        if (SendInput(1, &input, sizeof(INPUT)) != 1) {
            SetError("Failed to send mouse down event");
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
    std::optional<POINT> pos_;
    std::string button_;
};

// AsyncWorker for Release
class ReleaseWorker : public Napi::AsyncWorker {
public:
    ReleaseWorker(const Napi::Env& env,
                  std::optional<POINT> pos,
                  const std::string& button)
        : Napi::AsyncWorker(env), pos_(pos), button_(button) {}

    void Execute() override {
        INPUT input = {0};
        input.type = INPUT_MOUSE;
        DWORD upFlag = (button_ == "right") ? MOUSEEVENTF_RIGHTUP : MOUSEEVENTF_LEFTUP;
        input.mi.dwFlags = upFlag;

        // Optional: Move cursor before releasing? Generally not needed.
        if (pos_.has_value()) {
            // Uncomment if needed
            // SetCursorPos(pos_.value().x, pos_.value().y);
        }

        if (SendInput(1, &input, sizeof(INPUT)) != 1) {
            SetError("Failed to send mouse up event");
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
    std::optional<POINT> pos_;
    std::string button_;
};

// AsyncWorker for Click
class ClickWorker : public Napi::AsyncWorker {
public:
    ClickWorker(const Napi::Env& env,
                std::optional<POINT> clientPos,
                const std::string& button,
                int holdFor,
                const std::string& windowTitle)
        : Napi::AsyncWorker(env),
          clientPos_(clientPos), button_(button),
          holdFor_(holdFor), windowTitle_(windowTitle) {}

    void Execute() override {
        HWND targetHwnd = NULL;
        std::optional<POINT> screenPos;

        // Check for window title
        if (!windowTitle_.empty()) {
            targetHwnd = FindWindowA(NULL, windowTitle_.c_str());
            if (!targetHwnd) {
                SetError("Window not found: " + windowTitle_);
                return;
            }
        }

        // Determine screen coordinates
        if (targetHwnd != NULL) {
            // Window title provided: x, y MUST be provided (client coordinates)
            if (!clientPos_.has_value()) {
                SetError("Position (x, y) must be provided when windowTitle is specified.");
                return;
            }
            POINT screenPt = clientPos_.value();
            if (ClientToScreen(targetHwnd, &screenPt)) {
                screenPos = screenPt;
            }
        } else {
            // No window title: use provided coordinates as screen coordinates
            if (clientPos_.has_value()) {
                screenPos = clientPos_.value();
            }
        }

        // Set cursor position if coordinates were determined
        if (screenPos.has_value()) {
            SetCursorPos(screenPos.value().x, screenPos.value().y);
        }

        DWORD downFlag = (button_ == "right") ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_LEFTDOWN;
        DWORD upFlag = (button_ == "right") ? MOUSEEVENTF_RIGHTUP : MOUSEEVENTF_LEFTUP;

        INPUT inputs[2] = {0};
        inputs[0].type = INPUT_MOUSE;
        inputs[0].mi.dwFlags = downFlag;
        inputs[1].type = INPUT_MOUSE;
        inputs[1].mi.dwFlags = upFlag;

        if (SendInput(1, &inputs[0], sizeof(INPUT)) != 1) {
            SetError("Failed to send mouse down event");
            return;
        }
        
        std::this_thread::sleep_for(std::chrono::milliseconds(holdFor_));
        
        if (SendInput(1, &inputs[1], sizeof(INPUT)) != 1) {
            SetError("Failed to send mouse up event");
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
    std::optional<POINT> clientPos_;
    std::string button_;
    int holdFor_;
    std::string windowTitle_;
};

// AsyncWorker for MoveRelative
class MoveRelativeWorker : public Napi::AsyncWorker {
public:
    MoveRelativeWorker(const Napi::Env& env,
                       double dx, double dy,
                       int smoothDuration,
                       bool useRawInput)
        : Napi::AsyncWorker(env),
          dx_(dx), dy_(dy),
          smoothDuration_(smoothDuration),
          useRawInput_(useRawInput) {}

    void Execute() override {
        if (smoothDuration_ < 0) smoothDuration_ = 0;

        // Get current cursor position
        POINT currentPos;
        if (!GetCursorPos(&currentPos)) {
            SetError("Failed to get current cursor position");
            return;
        }

        if (useRawInput_) {
            // Use raw input for FPS games where cursor is locked
            INPUT input = {0};
            input.type = INPUT_MOUSE;
            input.mi.dwFlags = MOUSEEVENTF_MOVE;
            
            if (smoothDuration_ <= 0) {
                // Instant movement
                input.mi.dx = static_cast<LONG>(dx_);
                input.mi.dy = static_cast<LONG>(dy_);
                SendInput(1, &input, sizeof(INPUT));
            } else {
                // Smooth interpolation for raw input
                int steps = std::max(smoothDuration_ / 5, 1); // 5ms per step minimum
                double stepDelay = static_cast<double>(smoothDuration_) / steps;
                
                for (int i = 1; i <= steps; i++) {
                    double progress = static_cast<double>(i) / steps;
                    double easedProgress = easeInOutCubic(progress);
                    
                    double currentDx = dx_ * easedProgress - dx_ * (i > 1 ? easeInOutCubic(static_cast<double>(i - 1) / steps) : 0);
                    double currentDy = dy_ * easedProgress - dy_ * (i > 1 ? easeInOutCubic(static_cast<double>(i - 1) / steps) : 0);
                    
                    input.mi.dx = static_cast<LONG>(currentDx);
                    input.mi.dy = static_cast<LONG>(currentDy);
                    
                    SendInput(1, &input, sizeof(INPUT));
                    
                    if (i < steps) {
                        std::this_thread::sleep_for(std::chrono::microseconds(static_cast<int>(stepDelay * 1000)));
                    }
                }
            }
        } else {
            // Use absolute positioning (SetCursorPos)
            double targetX = currentPos.x + dx_;
            double targetY = currentPos.y + dy_;

            if (smoothDuration_ <= 0) {
                // Instant movement
                SetCursorPos(static_cast<int>(targetX), static_cast<int>(targetY));
            } else {
                // Smooth interpolation
                int steps = std::max(smoothDuration_ / 5, 1); // 5ms per step minimum
                double stepDelay = static_cast<double>(smoothDuration_) / steps;
                
                for (int i = 1; i <= steps; i++) {
                    double progress = static_cast<double>(i) / steps;
                    double easedProgress = easeInOutCubic(progress);
                    
                    int newX = static_cast<int>(currentPos.x + dx_ * easedProgress);
                    int newY = static_cast<int>(currentPos.y + dy_ * easedProgress);
                    
                    SetCursorPos(newX, newY);
                    
                    if (i < steps) {
                        std::this_thread::sleep_for(std::chrono::microseconds(static_cast<int>(stepDelay * 1000)));
                    }
                }
            }
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
    double dx_, dy_;
    int smoothDuration_;
    bool useRawInput_;
};

// AsyncWorker for MoveRelativePolar
class MoveRelativePolarWorker : public Napi::AsyncWorker {
public:
    MoveRelativePolarWorker(const Napi::Env& env,
                           double angleDegrees, double distance,
                           int smoothDuration, bool useRawInput)
        : Napi::AsyncWorker(env),
          angleDegrees_(angleDegrees), distance_(distance),
          smoothDuration_(smoothDuration), useRawInput_(useRawInput) {}

    void Execute() override {
        // Convert angle to radians and calculate dx, dy
        double angleRadians = angleDegrees_ * M_PI / 180.0;
        double dx = distance_ * cos(angleRadians);
        double dy = -distance_ * sin(angleRadians); // Negative because Y increases downward

        if (smoothDuration_ < 0) smoothDuration_ = 0;

        // Get current cursor position
        POINT currentPos;
        if (!GetCursorPos(&currentPos)) {
            SetError("Failed to get current cursor position");
            return;
        }

        if (useRawInput_) {
            // Use raw input for FPS games where cursor is locked
            INPUT input = {0};
            input.type = INPUT_MOUSE;
            input.mi.dwFlags = MOUSEEVENTF_MOVE;
            
            if (smoothDuration_ <= 0) {
                // Instant movement
                input.mi.dx = static_cast<LONG>(dx);
                input.mi.dy = static_cast<LONG>(dy);
                SendInput(1, &input, sizeof(INPUT));
            } else {
                // Smooth interpolation for raw input
                int steps = std::max(smoothDuration_ / 5, 1);
                double stepDelay = static_cast<double>(smoothDuration_) / steps;
                
                for (int i = 1; i <= steps; i++) {
                    double progress = static_cast<double>(i) / steps;
                    double easedProgress = easeInOutCubic(progress);
                    
                    double currentDx = dx * easedProgress - dx * (i > 1 ? easeInOutCubic(static_cast<double>(i - 1) / steps) : 0);
                    double currentDy = dy * easedProgress - dy * (i > 1 ? easeInOutCubic(static_cast<double>(i - 1) / steps) : 0);
                    
                    input.mi.dx = static_cast<LONG>(currentDx);
                    input.mi.dy = static_cast<LONG>(currentDy);
                    
                    SendInput(1, &input, sizeof(INPUT));
                    
                    if (i < steps) {
                        std::this_thread::sleep_for(std::chrono::microseconds(static_cast<int>(stepDelay * 1000)));
                    }
                }
            }
        } else {
            // Use absolute positioning (SetCursorPos)
            double targetX = currentPos.x + dx;
            double targetY = currentPos.y + dy;

            if (smoothDuration_ <= 0) {
                // Instant movement
                SetCursorPos(static_cast<int>(targetX), static_cast<int>(targetY));
            } else {
                // Smooth interpolation
                int steps = std::max(smoothDuration_ / 5, 1);
                double stepDelay = static_cast<double>(smoothDuration_) / steps;
                
                for (int i = 1; i <= steps; i++) {
                    double progress = static_cast<double>(i) / steps;
                    double easedProgress = easeInOutCubic(progress);
                    
                    int newX = static_cast<int>(currentPos.x + dx * easedProgress);
                    int newY = static_cast<int>(currentPos.y + dy * easedProgress);
                    
                    SetCursorPos(newX, newY);
                    
                    if (i < steps) {
                        std::this_thread::sleep_for(std::chrono::microseconds(static_cast<int>(stepDelay * 1000)));
                    }
                }
            }
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
    double angleDegrees_, distance_;
    int smoothDuration_;
    bool useRawInput_;
};

/**
 * Windows doesn't seem to allow you to click on background applications, without bringing them to the foregorund first.
 * Merged click logic directly into Napi function.
 */

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

    auto* worker = new ClickMessageWorker(env, x, y, holdFor, windowTitle, messageType);
    worker->Queue();
    return worker->GetPromise();
}

Napi::Value getPosition(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() != 0) {
        Napi::Error::New(env, "Expected 0 arguments").ThrowAsJavaScriptException();
        return env.Null();
    }

    auto* worker = new GetPositionWorker(env);
    worker->Queue();
    return worker->GetPromise();
}

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

    auto* worker = new HoldWorker(env, posOpt, button);
    worker->Queue();
    return worker->GetPromise();
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

    auto* worker = new ReleaseWorker(env, posOpt, button);
    worker->Queue();
    return worker->GetPromise();
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

    // Check for windowTitle (arg 4)
    if (info.Length() == 5 && info[4].IsString()) {
        windowTitle = info[4].As<Napi::String>().Utf8Value();
    }

    auto* worker = new ClickWorker(env, clientPosOpt, button, holdFor, windowTitle);
    worker->Queue();
    return worker->GetPromise();
}

// New function for relative mouse movement with smooth interpolation
Napi::Value moveRelative(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Expected args: dx(num), dy(num), smoothDuration(num), useRawInput(bool)
    if (info.Length() != 4) {
        Napi::Error::New(env, "Expected 4 arguments: dx, dy, smoothDuration, useRawInput").ThrowAsJavaScriptException();
        return env.Null();
    }
    if (!info[0].IsNumber() || !info[1].IsNumber() || !info[2].IsNumber() || !info[3].IsBoolean()) {
        Napi::Error::New(env, "Invalid argument types. Expected: number, number, number, boolean").ThrowAsJavaScriptException();
        return env.Null();
    }

    double dx = info[0].As<Napi::Number>().DoubleValue();
    double dy = info[1].As<Napi::Number>().DoubleValue();
    int smoothDuration = info[2].As<Napi::Number>().Int32Value();
    bool useRawInput = info[3].As<Napi::Boolean>().Value();

    auto* worker = new MoveRelativeWorker(env, dx, dy, smoothDuration, useRawInput);
    worker->Queue();
    return worker->GetPromise();
}

// Function to move mouse by angle and distance (polar coordinates)
Napi::Value moveRelativePolar(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Expected args: angle(degrees), distance(pixels), smoothDuration(num), useRawInput(bool)
    if (info.Length() != 4) {
        Napi::Error::New(env, "Expected 4 arguments: angle, distance, smoothDuration, useRawInput").ThrowAsJavaScriptException();
        return env.Null();
    }
    if (!info[0].IsNumber() || !info[1].IsNumber() || !info[2].IsNumber() || !info[3].IsBoolean()) {
        Napi::Error::New(env, "Invalid argument types. Expected: number, number, number, boolean").ThrowAsJavaScriptException();
        return env.Null();
    }

    double angleDegrees = info[0].As<Napi::Number>().DoubleValue();
    double distance = info[1].As<Napi::Number>().DoubleValue();
    int smoothDuration = info[2].As<Napi::Number>().Int32Value();
    bool useRawInput = info[3].As<Napi::Boolean>().Value();

    auto* worker = new MoveRelativePolarWorker(env, angleDegrees, distance, smoothDuration, useRawInput);
    worker->Queue();
    return worker->GetPromise();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "clickMessage"), Napi::Function::New(env, clickMessageNapi));
    exports.Set(Napi::String::New(env, "getPosition"), Napi::Function::New(env, getPosition));
    exports.Set(Napi::String::New(env, "hold"), Napi::Function::New(env, holdNapi));
    exports.Set(Napi::String::New(env, "release"), Napi::Function::New(env, releaseNapi));
    exports.Set(Napi::String::New(env, "click"), Napi::Function::New(env, clickNapi)); // Renamed export
    exports.Set(Napi::String::New(env, "moveRelative"), Napi::Function::New(env, moveRelative));
    exports.Set(Napi::String::New(env, "moveRelativePolar"), Napi::Function::New(env, moveRelativePolar));
    return exports;
}

CASHEW_MODULE_INIT(mouse, Init)
