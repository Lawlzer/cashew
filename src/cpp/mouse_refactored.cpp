#include "common.h"
#include "input_utils.h"
#include <optional>
#include <cmath>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

using namespace cashew;
using namespace cashew::input;

// Simplified AsyncWorker for mouse click using window messages
class ClickMessageWorker : public BaseAsyncWorker<void> {
private:
    int x_, y_, holdFor_;
    std::string windowTitle_, messageType_;

public:
    ClickMessageWorker(const Napi::Env& env, int x, int y, int holdFor,
                      const std::string& windowTitle, const std::string& messageType)
        : BaseAsyncWorker(env), x_(x), y_(y), holdFor_(holdFor),
          windowTitle_(windowTitle), messageType_(messageType) {}

    void Execute() override {
        WindowInputSender sender(windowTitle_);
        if (!sender.isValid()) {
            SetError(sender.getError());
            return;
        }

        HWND targetHwnd = sender.getHandle();
        LPARAM lParam = MAKELPARAM(x_, y_);
        WPARAM wParam = 0;

        if (messageType_ == "send") {
            SendMessage(targetHwnd, WM_LBUTTONDOWN, wParam, lParam);
            std::this_thread::sleep_for(std::chrono::milliseconds(holdFor_));
            SendMessage(targetHwnd, WM_LBUTTONUP, wParam, lParam);
        } else {
            PostMessage(targetHwnd, WM_LBUTTONDOWN, wParam, lParam);
            std::this_thread::sleep_for(std::chrono::milliseconds(holdFor_));
            PostMessage(targetHwnd, WM_LBUTTONUP, wParam, lParam);
        }
    }
};

// Simplified GetPosition worker
class GetPositionWorker : public BaseAsyncWorker<Napi::Object> {
private:
    POINT pos_;

public:
    explicit GetPositionWorker(const Napi::Env& env) : BaseAsyncWorker(env) {}

    void Execute() override {
        if (!GetCursorPos(&pos_)) {
            SetError("Failed to get cursor position");
        }
    }

    void OnOK() override {
        Napi::HandleScope scope(Env());
        Napi::Object result = Napi::Object::New(Env());
        result.Set("x", Napi::Number::New(Env(), pos_.x));
        result.Set("y", Napi::Number::New(Env(), pos_.y));
        deferred_.Resolve(result);
    }
};

// Simplified Hold worker
class HoldWorker : public BaseAsyncWorker<void> {
private:
    std::optional<POINT> pos_;
    MouseButton button_;

public:
    HoldWorker(const Napi::Env& env, std::optional<POINT> pos, MouseButton button)
        : BaseAsyncWorker(env), pos_(pos), button_(button) {}

    void Execute() override {
        if (pos_.has_value()) {
            SetCursorPos(pos_.value().x, pos_.value().y);
        }

        InputBatcher batcher;
        if (!batcher.addMouseButton(button_, true).send()) {
            SetError(constants::ERR_SENDINPUT_FAILED);
        }
    }
};

// Simplified Release worker
class ReleaseWorker : public BaseAsyncWorker<void> {
private:
    MouseButton button_;

public:
    ReleaseWorker(const Napi::Env& env, MouseButton button)
        : BaseAsyncWorker(env), button_(button) {}

    void Execute() override {
        InputBatcher batcher;
        if (!batcher.addMouseButton(button_, false).send()) {
            SetError(constants::ERR_SENDINPUT_FAILED);
        }
    }
};

// Simplified Click worker
class ClickWorker : public BaseAsyncWorker<void> {
private:
    std::optional<POINT> targetPos_;
    MouseButton button_;
    int holdFor_;
    std::string windowTitle_;

public:
    ClickWorker(const Napi::Env& env, std::optional<POINT> pos,
                MouseButton button, int holdFor, const std::string& windowTitle)
        : BaseAsyncWorker(env), targetPos_(pos), button_(button),
          holdFor_(holdFor), windowTitle_(windowTitle) {}

    void Execute() override {
        // Handle window-specific coordinates
        if (!windowTitle_.empty()) {
            WindowInputSender sender(windowTitle_);
            if (!sender.isValid()) {
                SetError(sender.getError());
                return;
            }

            if (!targetPos_.has_value()) {
                SetError("Position (x, y) must be provided when windowTitle is specified");
                return;
            }

            POINT screenPt = targetPos_.value();
            if (ClientToScreen(sender.getHandle(), &screenPt)) {
                targetPos_ = screenPt;
            }
        }

        // Move cursor if position specified
        if (targetPos_.has_value()) {
            SetCursorPos(targetPos_.value().x, targetPos_.value().y);
        }

        // Perform click
        InputBatcher batcher;
        if (!batcher.addMouseButton(button_, true).send()) {
            SetError(constants::ERR_SENDINPUT_FAILED);
            return;
        }

        std::this_thread::sleep_for(std::chrono::milliseconds(holdFor_));

        if (!batcher.addMouseButton(button_, false).send()) {
            SetError(constants::ERR_SENDINPUT_FAILED);
        }
    }
};

// Simplified MoveRelative worker
class MoveRelativeWorker : public BaseAsyncWorker<void> {
private:
    double dx_, dy_;
    int smoothDuration_;
    bool useRawInput_;

public:
    MoveRelativeWorker(const Napi::Env& env, double dx, double dy,
                       int smoothDuration, bool useRawInput)
        : BaseAsyncWorker(env), dx_(dx), dy_(dy),
          smoothDuration_(smoothDuration), useRawInput_(useRawInput) {}

    void Execute() override {
        SmoothMovement mover(smoothDuration_);
        mover.moveRelative(dx_, dy_, useRawInput_);
    }
};

// Simplified MoveRelativePolar worker
class MoveRelativePolarWorker : public BaseAsyncWorker<void> {
private:
    double angleDegrees_, distance_;
    int smoothDuration_;
    bool useRawInput_;

public:
    MoveRelativePolarWorker(const Napi::Env& env, double angleDegrees,
                           double distance, int smoothDuration, bool useRawInput)
        : BaseAsyncWorker(env), angleDegrees_(angleDegrees), distance_(distance),
          smoothDuration_(smoothDuration), useRawInput_(useRawInput) {}

    void Execute() override {
        double angleRadians = angleDegrees_ * M_PI / 180.0;
        double dx = distance_ * cos(angleRadians);
        double dy = -distance_ * sin(angleRadians); // Negative because Y increases downward

        SmoothMovement mover(smoothDuration_);
        mover.moveRelative(dx, dy, useRawInput_);
    }
};

// API Functions with improved validation
Napi::Value clickMessageNapi(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 5 ||
        !validation::requireNumber(info, 0, "x") ||
        !validation::requireNumber(info, 1, "y") ||
        !validation::requireNumber(info, 2, "holdFor") ||
        !validation::requireString(info, 3, "windowTitle") ||
        !validation::requireString(info, 4, "messageType")) {
        return env.Null();
    }

    int x = info[0].As<Napi::Number>().Int32Value();
    int y = info[1].As<Napi::Number>().Int32Value();
    int holdFor = info[2].As<Napi::Number>().Int32Value();
    std::string windowTitle = info[3].As<Napi::String>().Utf8Value();
    std::string messageType = info[4].As<Napi::String>().Utf8Value();

    auto* worker = new ClickMessageWorker(env, x, y, holdFor, windowTitle, messageType);
    worker->Queue();
    return worker->GetPromise();
}

Napi::Value getPosition(const Napi::CallbackInfo& info) {
    auto* worker = new GetPositionWorker(info.Env());
    worker->Queue();
    return worker->GetPromise();
}

Napi::Value holdNapi(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    std::optional<POINT> pos;
    MouseButton button = MouseButton::Left;

    // Optional position
    if (info.Length() >= 2 && info[0].IsNumber() && info[1].IsNumber()) {
        pos = POINT{
            info[0].As<Napi::Number>().Int32Value(),
            info[1].As<Napi::Number>().Int32Value()
        };
    }

    // Optional button
    if (info.Length() >= 3 && info[2].IsString()) {
        button = parseMouseButton(info[2].As<Napi::String>().Utf8Value());
    }

    auto* worker = new HoldWorker(env, pos, button);
    worker->Queue();
    return worker->GetPromise();
}

Napi::Value releaseNapi(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    MouseButton button = MouseButton::Left;

    if (info.Length() >= 1 && info[0].IsString()) {
        button = parseMouseButton(info[0].As<Napi::String>().Utf8Value());
    }

    auto* worker = new ReleaseWorker(env, button);
    worker->Queue();
    return worker->GetPromise();
}

Napi::Value clickNapi(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    std::optional<POINT> pos;
    MouseButton button = MouseButton::Left;
    int holdFor = constants::DEFAULT_MOUSE_HOLD_MS;
    std::string windowTitle;

    // Parse position
    if (info.Length() >= 2 && info[0].IsNumber() && info[1].IsNumber()) {
        pos = POINT{
            info[0].As<Napi::Number>().Int32Value(),
            info[1].As<Napi::Number>().Int32Value()
        };
    }

    // Parse button
    if (info.Length() >= 3 && info[2].IsString()) {
        button = parseMouseButton(info[2].As<Napi::String>().Utf8Value());
    }

    // Parse holdFor
    if (info.Length() >= 4 && info[3].IsNumber()) {
        holdFor = info[3].As<Napi::Number>().Int32Value();
    }

    // Parse windowTitle
    if (info.Length() >= 5 && info[4].IsString()) {
        windowTitle = info[4].As<Napi::String>().Utf8Value();
    }

    auto* worker = new ClickWorker(env, pos, button, holdFor, windowTitle);
    worker->Queue();
    return worker->GetPromise();
}

Napi::Value moveRelative(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (!validation::requireNumber(info, 0, "dx") ||
        !validation::requireNumber(info, 1, "dy")) {
        return env.Null();
    }

    double dx = info[0].As<Napi::Number>().DoubleValue();
    double dy = info[1].As<Napi::Number>().DoubleValue();
    int smoothDuration = 0;
    bool useRawInput = false;

    if (info.Length() >= 3 && info[2].IsNumber()) {
        smoothDuration = info[2].As<Napi::Number>().Int32Value();
    }

    if (info.Length() >= 4 && info[3].IsBoolean()) {
        useRawInput = info[3].As<Napi::Boolean>().Value();
    }

    auto* worker = new MoveRelativeWorker(env, dx, dy, smoothDuration, useRawInput);
    worker->Queue();
    return worker->GetPromise();
}

Napi::Value moveRelativePolar(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (!validation::requireNumber(info, 0, "angleDegrees") ||
        !validation::requireNumber(info, 1, "distance")) {
        return env.Null();
    }

    double angleDegrees = info[0].As<Napi::Number>().DoubleValue();
    double distance = info[1].As<Napi::Number>().DoubleValue();
    int smoothDuration = 0;
    bool useRawInput = false;

    if (info.Length() >= 3 && info[2].IsNumber()) {
        smoothDuration = info[2].As<Napi::Number>().Int32Value();
    }

    if (info.Length() >= 4 && info[3].IsBoolean()) {
        useRawInput = info[3].As<Napi::Boolean>().Value();
    }

    auto* worker = new MoveRelativePolarWorker(env, angleDegrees, distance, 
                                              smoothDuration, useRawInput);
    worker->Queue();
    return worker->GetPromise();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("clickMessage", Napi::Function::New(env, clickMessageNapi));
    exports.Set("getPosition", Napi::Function::New(env, getPosition));
    exports.Set("hold", Napi::Function::New(env, holdNapi));
    exports.Set("release", Napi::Function::New(env, releaseNapi));
    exports.Set("click", Napi::Function::New(env, clickNapi));
    exports.Set("moveRelative", Napi::Function::New(env, moveRelative));
    exports.Set("moveRelativePolar", Napi::Function::New(env, moveRelativePolar));
    return exports;
}

CASHEW_MODULE_INIT(mouseAsync, Init) 