#ifndef CASHEW_INPUT_UTILS_H
#define CASHEW_INPUT_UTILS_H

#include "common.h"
#include <vector>
#include <optional>

namespace cashew {
namespace input {

// Helper class for batching and sending input events
class InputBatcher {
private:
    std::vector<INPUT> inputs_;
    
public:
    InputBatcher() { inputs_.reserve(10); }
    
    // Add mouse movement
    InputBatcher& addMouseMove(int dx, int dy, bool absolute = false) {
        INPUT input = {0};
        input.type = INPUT_MOUSE;
        input.mi.dx = dx;
        input.mi.dy = dy;
        input.mi.dwFlags = MOUSEEVENTF_MOVE;
        if (absolute) {
            input.mi.dwFlags |= MOUSEEVENTF_ABSOLUTE;
        }
        inputs_.push_back(input);
        return *this;
    }
    
    // Add mouse button press
    InputBatcher& addMouseButton(MouseButton button, bool press) {
        INPUT input = {0};
        input.type = INPUT_MOUSE;
        auto [downFlag, upFlag] = getMouseButtonFlags(button);
        input.mi.dwFlags = press ? downFlag : upFlag;
        inputs_.push_back(input);
        return *this;
    }
    
    // Add key press
    InputBatcher& addKey(WORD keyCode, bool press) {
        INPUT input = {0};
        input.type = INPUT_KEYBOARD;
        input.ki.wVk = keyCode;
        if (!press) {
            input.ki.dwFlags = KEYEVENTF_KEYUP;
        }
        inputs_.push_back(input);
        return *this;
    }
    
    // Send all batched inputs
    bool send() {
        if (inputs_.empty()) return true;
        UINT sent = SendInput(static_cast<UINT>(inputs_.size()), 
                            inputs_.data(), sizeof(INPUT));
        bool success = sent == inputs_.size();
        inputs_.clear();
        return success;
    }
    
    void clear() { inputs_.clear(); }
    size_t size() const { return inputs_.size(); }
};

// Smooth movement controller
class SmoothMovement {
private:
    int duration_;
    int steps_;
    double stepDelay_;
    
public:
    SmoothMovement(int durationMs) 
        : duration_(std::max(0, durationMs)),
          steps_(interpolation::calculateSteps(duration_)),
          stepDelay_(duration_ > 0 ? static_cast<double>(duration_) / steps_ : 0) {}
    
    // Execute smooth movement with custom interpolation
    template<typename Func>
    void execute(Func&& moveFunc) {
        if (duration_ <= 0) {
            moveFunc(1.0);
            return;
        }
        
        for (int i = 1; i <= steps_; i++) {
            double progress = static_cast<double>(i) / steps_;
            double easedProgress = interpolation::easeInOutCubic(progress);
            
            moveFunc(easedProgress);
            
            if (i < steps_) {
                std::this_thread::sleep_for(
                    std::chrono::microseconds(static_cast<int>(stepDelay_ * 1000)));
            }
        }
    }
    
    // Execute smooth movement between two points
    void moveAbsolute(double startX, double startY, double endX, double endY) {
        double lastX = startX;
        double lastY = startY;
        
        execute([&](double progress) {
            double currentX = interpolation::lerp(startX, endX, progress);
            double currentY = interpolation::lerp(startY, endY, progress);
            SetCursorPos(static_cast<int>(currentX), static_cast<int>(currentY));
            lastX = currentX;
            lastY = currentY;
        });
    }
    
    // Execute smooth relative movement
    void moveRelative(double dx, double dy, bool useRawInput = false) {
        if (useRawInput) {
            double lastProgress = 0;
            execute([&](double progress) {
                INPUT input = {0};
                input.type = INPUT_MOUSE;
                input.mi.dwFlags = MOUSEEVENTF_MOVE;
                
                double currentDx = dx * (progress - lastProgress);
                double currentDy = dy * (progress - lastProgress);
                
                input.mi.dx = static_cast<LONG>(currentDx);
                input.mi.dy = static_cast<LONG>(currentDy);
                
                SendInput(1, &input, sizeof(INPUT));
                lastProgress = progress;
            });
        } else {
            POINT start;
            GetCursorPos(&start);
            moveAbsolute(start.x, start.y, start.x + dx, start.y + dy);
        }
    }
};

// Window-specific input sender
class WindowInputSender {
private:
    HWND hwnd_;
    std::string windowTitle_;
    
public:
    explicit WindowInputSender(const std::string& title = "") 
        : windowTitle_(title), hwnd_(nullptr) {
        if (!title.empty()) {
            hwnd_ = GetTargetWindow(title);
        }
    }
    
    bool isValid() const {
        return windowTitle_.empty() || hwnd_ != nullptr;
    }
    
    HWND getHandle() const {
        return hwnd_ ? hwnd_ : GetForegroundWindow();
    }
    
    std::string getError() const {
        if (!isValid()) {
            return constants::ERR_WINDOW_NOT_FOUND + windowTitle_;
        }
        return "";
    }
    
    // Send character to window
    bool sendChar(WPARAM ch) {
        return SendMessage(getHandle(), WM_CHAR, ch, 0) != 0;
    }
    
    // Send mouse click via window message
    bool sendClick(int x, int y, MouseButton button = MouseButton::Left) {
        LPARAM lParam = MAKELPARAM(x, y);
        WPARAM wParam = 0;
        
        auto [downMsg, upMsg] = button == MouseButton::Right ? 
            std::make_pair(WM_RBUTTONDOWN, WM_RBUTTONUP) :
            std::make_pair(WM_LBUTTONDOWN, WM_LBUTTONUP);
        
        SendMessage(getHandle(), downMsg, wParam, lParam);
        SendMessage(getHandle(), upMsg, wParam, lParam);
        return true;
    }
};

} // namespace input
} // namespace cashew

#endif // CASHEW_INPUT_UTILS_H 