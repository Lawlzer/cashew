#ifndef CASHEW_SCREEN_UTILS_H
#define CASHEW_SCREEN_UTILS_H

#include "common.h"
#include <memory>
#include <vector>
#include <unordered_map>
#include <shellscalingapi.h>
#include <codecvt>
#include <locale>

#pragma comment(lib, "Shcore.lib")

namespace cashew {
namespace screen {

// Memory pool for bitmap data to reduce allocations
class BitmapMemoryPool {
private:
    struct PooledBuffer {
        std::unique_ptr<uint8_t[]> data;
        size_t size;
        bool inUse;
    };
    
    std::vector<PooledBuffer> buffers_;
    size_t defaultSize_;
    
public:
    explicit BitmapMemoryPool(size_t defaultSize = 1920 * 1080 * 4)
        : defaultSize_(defaultSize) {
        // Pre-allocate a few buffers
        for (int i = 0; i < 3; ++i) {
            buffers_.push_back({
                std::make_unique<uint8_t[]>(defaultSize),
                defaultSize,
                false
            });
        }
    }
    
    uint8_t* acquire(size_t size) {
        // Try to find an unused buffer of sufficient size
        for (auto& buffer : buffers_) {
            if (!buffer.inUse && buffer.size >= size) {
                buffer.inUse = true;
                return buffer.data.get();
            }
        }
        
        // Allocate new buffer if none available
        buffers_.push_back({
            std::make_unique<uint8_t[]>(size),
            size,
            true
        });
        return buffers_.back().data.get();
    }
    
    void release(uint8_t* ptr) {
        for (auto& buffer : buffers_) {
            if (buffer.data.get() == ptr) {
                buffer.inUse = false;
                return;
            }
        }
    }
    
    void clear() {
        buffers_.clear();
    }
};

// Optimized BGRA to RGBA conversion using SIMD-friendly loop
inline void convertBGRAtoRGBAOptimized(uint32_t* pixels, size_t count) {
    // Process 4 pixels at a time for better CPU cache usage
    size_t i = 0;
    for (; i + 4 <= count; i += 4) {
        uint32_t p0 = pixels[i];
        uint32_t p1 = pixels[i + 1];
        uint32_t p2 = pixels[i + 2];
        uint32_t p3 = pixels[i + 3];
        
        pixels[i] = ((p0 & 0xFF00FF00) | ((p0 & 0x00FF0000) >> 16) | ((p0 & 0x000000FF) << 16));
        pixels[i + 1] = ((p1 & 0xFF00FF00) | ((p1 & 0x00FF0000) >> 16) | ((p1 & 0x000000FF) << 16));
        pixels[i + 2] = ((p2 & 0xFF00FF00) | ((p2 & 0x00FF0000) >> 16) | ((p2 & 0x000000FF) << 16));
        pixels[i + 3] = ((p3 & 0xFF00FF00) | ((p3 & 0x00FF0000) >> 16) | ((p3 & 0x000000FF) << 16));
    }
    
    // Handle remaining pixels
    for (; i < count; ++i) {
        uint32_t pixel = pixels[i];
        pixels[i] = ((pixel & 0xFF00FF00) | ((pixel & 0x00FF0000) >> 16) | ((pixel & 0x000000FF) << 16));
    }
}

// Cached screen information to avoid repeated queries
class ScreenInfoCache {
private:
    struct MonitorInfo {
        RECT bounds;
        int dpiX;
        int dpiY;
        std::string name;
    };
    
    std::unordered_map<HMONITOR, MonitorInfo> cache_;
    std::chrono::steady_clock::time_point lastUpdate_;
    static constexpr auto CACHE_DURATION = std::chrono::seconds(5);
    
    static BOOL CALLBACK monitorEnumProc(HMONITOR hMonitor, HDC hdcMonitor,
                                        LPRECT lprcMonitor, LPARAM dwData) {
        auto* cache = reinterpret_cast<ScreenInfoCache*>(dwData);
        
        MONITORINFOEX info;
        info.cbSize = sizeof(MONITORINFOEX);
        if (GetMonitorInfo(hMonitor, &info)) {
            MonitorInfo mi;
            mi.bounds = info.rcMonitor;
            
            // Convert wide string to narrow string
            std::wstring wideStr(info.szDevice);
            std::wstring_convert<std::codecvt_utf8<wchar_t>> converter;
            mi.name = converter.to_bytes(wideStr);
            
            // Get DPI
            UINT dpiX, dpiY;
            if (GetDpiForMonitor(hMonitor, MDT_EFFECTIVE_DPI, &dpiX, &dpiY) == S_OK) {
                mi.dpiX = dpiX;
                mi.dpiY = dpiY;
            } else {
                mi.dpiX = mi.dpiY = 96; // Default DPI
            }
            
            cache->cache_[hMonitor] = mi;
        }
        return TRUE;
    }
    
public:
    void refresh() {
        auto now = std::chrono::steady_clock::now();
        if (now - lastUpdate_ > CACHE_DURATION || cache_.empty()) {
            cache_.clear();
            EnumDisplayMonitors(NULL, NULL, monitorEnumProc, 
                              reinterpret_cast<LPARAM>(this));
            lastUpdate_ = now;
        }
    }
    
    const MonitorInfo* getMonitorInfo(HMONITOR monitor) {
        refresh();
        auto it = cache_.find(monitor);
        return it != cache_.end() ? &it->second : nullptr;
    }
    
    std::vector<MonitorInfo> getAllMonitors() {
        refresh();
        std::vector<MonitorInfo> result;
        for (const auto& pair : cache_) {
            result.push_back(pair.second);
        }
        return result;
    }
};

// Efficient screen capture helper
class ScreenCapture {
private:
    DcHandle screenDc_;
    CompatibleDcHandle memDc_;
    BitmapHandle bitmap_;
    BITMAPINFO bmi_;
    int width_;
    int height_;
    std::unique_ptr<uint32_t[]> buffer_;
    
public:
    ScreenCapture(int x, int y, int width, int height)
        : screenDc_(NULL),
          memDc_(screenDc_),
          bitmap_(screenDc_, width, height),
          width_(width),
          height_(height),
          buffer_(std::make_unique<uint32_t[]>(width * height)) {
        
        // Setup bitmap info
        memset(&bmi_, 0, sizeof(BITMAPINFO));
        bmi_.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
        bmi_.bmiHeader.biWidth = width;
        bmi_.bmiHeader.biHeight = -height; // Top-down bitmap
        bmi_.bmiHeader.biPlanes = 1;
        bmi_.bmiHeader.biBitCount = 32;
        bmi_.bmiHeader.biCompression = BI_RGB;
        
        // Select bitmap into memory DC
        SelectObject(memDc_, bitmap_);
    }
    
    bool capture(int x, int y) {
        // Perform the bit block transfer
        if (!BitBlt(memDc_, 0, 0, width_, height_, 
                   screenDc_, x, y, SRCCOPY)) {
            return false;
        }
        
        // Get the bits
        if (!GetDIBits(memDc_, bitmap_, 0, height_, 
                      buffer_.get(), &bmi_, DIB_RGB_COLORS)) {
            return false;
        }
        
        // Convert BGRA to RGBA
        convertBGRAtoRGBAOptimized(buffer_.get(), width_ * height_);
        return true;
    }
    
    const uint32_t* getData() const { return buffer_.get(); }
    int getWidth() const { return width_; }
    int getHeight() const { return height_; }
    size_t getDataSize() const { return width_ * height_ * sizeof(uint32_t); }
};

// Async screen region finder using pooled memory
class RegionFinder {
private:
    std::unique_ptr<BitmapMemoryPool> pool_;
    
public:
    RegionFinder() : pool_(std::make_unique<BitmapMemoryPool>()) {}
    
    struct SearchResult {
        bool found;
        int x;
        int y;
        double confidence;
    };
    
    // Find a region within screen area using template matching
    SearchResult findRegion(int screenX, int screenY, int screenWidth, int screenHeight,
                          const uint32_t* templateData, int templateWidth, int templateHeight,
                          double threshold = 0.95) {
        
        ScreenCapture capture(screenX, screenY, screenWidth, screenHeight);
        if (!capture.capture(screenX, screenY)) {
            return {false, 0, 0, 0.0};
        }
        
        const uint32_t* screenData = capture.getData();
        
        // Simple template matching (can be optimized with FFT)
        double bestMatch = 0.0;
        int bestX = 0, bestY = 0;
        
        for (int y = 0; y <= screenHeight - templateHeight; ++y) {
            for (int x = 0; x <= screenWidth - templateWidth; ++x) {
                double match = compareRegion(screenData, screenWidth,
                                           templateData, templateWidth, templateHeight,
                                           x, y);
                if (match > bestMatch) {
                    bestMatch = match;
                    bestX = x;
                    bestY = y;
                }
            }
        }
        
        return {
            bestMatch >= threshold,
            screenX + bestX,
            screenY + bestY,
            bestMatch
        };
    }
    
private:
    double compareRegion(const uint32_t* screen, int screenWidth,
                        const uint32_t* template_, int templateWidth, int templateHeight,
                        int offsetX, int offsetY) {
        
        int matches = 0;
        int total = templateWidth * templateHeight;
        
        for (int y = 0; y < templateHeight; ++y) {
            for (int x = 0; x < templateWidth; ++x) {
                int screenIdx = (offsetY + y) * screenWidth + (offsetX + x);
                int templateIdx = y * templateWidth + x;
                
                if (screen[screenIdx] == template_[templateIdx]) {
                    matches++;
                }
            }
        }
        
        return static_cast<double>(matches) / total;
    }
};

} // namespace screen
} // namespace cashew

#endif // CASHEW_SCREEN_UTILS_H 