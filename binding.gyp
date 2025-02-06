{
   'targets': [
       {
           'target_name': 'clipboard',
           'sources': [ 'src/cpp/clipboard/addon.cpp' ],
           'include_dirs': [
               '<!(node -p "require(\'node-addon-api\').include_dir")'
           ],
           'defines': [ 'NAPI_DISABLE_CPP_EXCEPTIONS',
                        'NODE_ADDON_API_ENABLE_MAYBE' ],
           'conditions': [
               ['OS=="mac"', {
                   'cflags+': ['-fvisibility=hidden'],
                   'xcode_settings': {
                       'GCC_SYMBOLS_PRIVATE_EXTERN': 'YES', # -fvisibility=hidden
                   }
               }]
           ]
       },
       {
           'target_name': 'screen',
           'sources': [ 'src/cpp/screen/addon.cpp' ],
           'include_dirs': [
               '<!(node -p "require(\'node-addon-api\').include_dir")'
           ],
           'defines': [ 'NAPI_DISABLE_CPP_EXCEPTIONS',
                        'NODE_ADDON_API_ENABLE_MAYBE' ],
           'conditions': [
               ['OS=="mac"', {
                   'cflags+': ['-fvisibility=hidden'],
                   'xcode_settings': {
                       'GCC_SYMBOLS_PRIVATE_EXTERN': 'YES', # -fvisibility=hidden
                   }
               }]
           ]
       },
       {
           'target_name': 'keyboard',
           'sources': [ 'src/cpp/keyboard/addon.cpp' ],
           'include_dirs': [
               '<!(node -p "require(\'node-addon-api\').include_dir")'
           ],
           'defines': [ 'NAPI_DISABLE_CPP_EXCEPTIONS',
                        'NODE_ADDON_API_ENABLE_MAYBE' ],
           'conditions': [
               ['OS=="mac"', {
                   'cflags+': ['-fvisibility=hidden'],
                   'xcode_settings': {
                       'GCC_SYMBOLS_PRIVATE_EXTERN': 'YES', # -fvisibility=hidden
                   }
               }]
           ]
       },
       {
           'target_name': 'mouse',
           'sources': [ 'src/cpp/mouse/addon.cpp' ],
           'include_dirs': [
               '<!(node -p "require(\'node-addon-api\').include_dir")'
           ],
           'defines': [ 'NAPI_DISABLE_CPP_EXCEPTIONS',
                        'NODE_ADDON_API_ENABLE_MAYBE' ],
           'conditions': [
               ['OS=="mac"', {
                   'cflags+': ['-fvisibility=hidden'],
                   'xcode_settings': {
                       'GCC_SYMBOLS_PRIVATE_EXTERN': 'YES', # -fvisibility=hidden
                   }
               }]
           ]
       },
	    {
           'target_name': 'misc',
           'sources': [ 'src/cpp/misc/addon.cpp' ],
           'include_dirs': [
               '<!(node -p "require(\'node-addon-api\').include_dir")'
           ],
           'defines': [ 'NAPI_DISABLE_CPP_EXCEPTIONS',
                        'NODE_ADDON_API_ENABLE_MAYBE' ],
           'conditions': [
               ['OS=="mac"', {
                   'cflags+': ['-fvisibility=hidden'],
                   'xcode_settings': {
                       'GCC_SYMBOLS_PRIVATE_EXTERN': 'YES', # -fvisibility=hidden
                   }
               }]
           ]
       },
   ]
}