#ifndef CLIPBOARD_UTILS_H
#define CLIPBOARD_UTILS_H

#include <napi.h>

Napi::Value ReadClipboard(const Napi::CallbackInfo& info);
Napi::Value WriteClipboard(const Napi::CallbackInfo& info);
Napi::Value ClipboardPaste(const Napi::CallbackInfo& info);

#endif

