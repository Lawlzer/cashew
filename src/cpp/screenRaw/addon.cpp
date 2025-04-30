#define UNICODE
#define _UNICODE

#include <napi.h>
#include <windows.h>
#include <vector>
#include <thread>
#include <chrono>
#include <string>

// Global variables for the overlay window
HWND overlayWindow = NULL;
COLORREF currentColor = RGB(0, 0, 0);
RECT currentRect = {0, 0, 0, 0};
bool hasActiveSquare = false;

// Window procedure for the overlay window
LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    switch(msg) {
        case WM_PAINT: {
            PAINTSTRUCT ps;
            HDC hdc = BeginPaint(hwnd, &ps);
            
            // Fill entire window with the transparent color first
            RECT windowRect;
            GetClientRect(hwnd, &windowRect);
            HBRUSH transparentBrush = CreateSolidBrush(RGB(0, 0, 0));
            FillRect(hdc, &windowRect, transparentBrush);
            DeleteObject(transparentBrush);
            
            if (hasActiveSquare) {
                // Create a brush with the desired color
                HBRUSH brush = CreateSolidBrush(currentColor);
                
                // Draw only within the specified rectangle
                FillRect(hdc, &currentRect, brush);
                
                // Clean up
                DeleteObject(brush);
            }
            
            EndPaint(hwnd, &ps);
            return 0;
        }
        case WM_DESTROY:
            hasActiveSquare = false;
            return 0;
        default:
            return DefWindowProcW(hwnd, msg, wParam, lParam);
    }
}

// Function to create or update the overlay window
void EnsureOverlayWindow() {
    if (overlayWindow == NULL) {
        // Register the window class
        static bool registered = false;
        if (!registered) {
            WNDCLASSEXW wc = {0};
            wc.cbSize = sizeof(WNDCLASSEXW);
            wc.style = CS_HREDRAW | CS_VREDRAW;
            wc.lpfnWndProc = WndProc;
            wc.hInstance = GetModuleHandleW(NULL);
            wc.hCursor = LoadCursorW(NULL, IDC_ARROW);
            wc.lpszClassName = L"SquareOverlayClass";
            wc.hbrBackground = (HBRUSH)GetStockObject(BLACK_BRUSH); // Use black background
            
            RegisterClassExW(&wc);
            registered = true;
        }
        
        // Create the window - layered and topmost
        overlayWindow = CreateWindowExW(
            WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST,
            L"SquareOverlayClass",
            L"Square Overlay",
            WS_POPUP,
            0, 0, GetSystemMetrics(SM_CXSCREEN), GetSystemMetrics(SM_CYSCREEN),
            NULL, NULL, GetModuleHandleW(NULL), NULL
        );
        
        // Set the layered window attributes to make black (RGB 0,0,0) fully transparent
        SetLayeredWindowAttributes(overlayWindow, RGB(0, 0, 0), 0, LWA_COLORKEY);
        ShowWindow(overlayWindow, SW_SHOW);
    }
}

// Function to draw a colored square on the screen between two positions
void DrawSquare(int x, int y, int width, int height, int r, int g, int b) {
    // Create/ensure our overlay window exists
    EnsureOverlayWindow();
    
    // Store the current rectangle and color
    currentRect.left = x;
    currentRect.top = y;
    currentRect.right = x + width;
    currentRect.bottom = y + height;
    currentColor = RGB(r, g, b);
    hasActiveSquare = true;
    
    // Force a redraw of the window - the transparency settings will handle making only the rectangle visible
    InvalidateRect(overlayWindow, NULL, TRUE);
    UpdateWindow(overlayWindow);
}

Napi::Value SetSquare(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Check arguments
    if (info.Length() < 7 || !info[0].IsNumber() || !info[1].IsNumber() || 
        !info[2].IsNumber() || !info[3].IsNumber() ||
        !info[4].IsNumber() || !info[5].IsNumber() || !info[6].IsNumber()) {
        Napi::Error::New(env, "Expected 7 numbers: x, y, width, height, r, g, b").ThrowAsJavaScriptException();
        return env.Null();
    }

    // Get parameters
    int x = info[0].As<Napi::Number>().Int32Value();
    int y = info[1].As<Napi::Number>().Int32Value();
    int width = info[2].As<Napi::Number>().Int32Value();
    int height = info[3].As<Napi::Number>().Int32Value();
    int r = info[4].As<Napi::Number>().Int32Value();
    int g = info[5].As<Napi::Number>().Int32Value();
    int b = info[6].As<Napi::Number>().Int32Value();

    // Validate color values
    if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
        Napi::Error::New(env, "RGB values must be between 0 and 255").ThrowAsJavaScriptException();
        return env.Null();
    }

    // Draw the square
    DrawSquare(x, y, width, height, r, g, b);
    
    return Napi::Boolean::New(env, true);
}

// Method to clear the square (hide it)
Napi::Value ClearSquare(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (overlayWindow != NULL) {
        hasActiveSquare = false;
        InvalidateRect(overlayWindow, NULL, TRUE);
        UpdateWindow(overlayWindow);
    }
    
    return Napi::Boolean::New(env, true);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "setSquare"), Napi::Function::New(env, SetSquare));
    exports.Set(Napi::String::New(env, "clearSquare"), Napi::Function::New(env, ClearSquare));
    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init); 