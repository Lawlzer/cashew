
#ifndef KEYBOARD_H
#define KEYBOARD_H

#include <napi.h>

void holdKey(WORD keyCode);
void releaseKey(WORD keyCode);
bool IsKeyPressed(int key);

Napi::Value HoldKey(const Napi::CallbackInfo& info);
Napi::Value ReleaseKey(const Napi::CallbackInfo& info);
Napi::Value IsKeyPressedMain(const Napi::CallbackInfo& info);

#endif