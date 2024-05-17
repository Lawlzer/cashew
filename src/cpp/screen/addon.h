#ifndef SCREEN_H
#define SCREEN_H

#include <napi.h>

Napi::Value GetWindowPixelsMain(const Napi::CallbackInfo& info);
Napi::Value GetScreenPixelsMain(const Napi::CallbackInfo& info);

#endif