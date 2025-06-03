{
   'target_defaults': {
       'include_dirs': [
           '<!(node -p "require(\'node-addon-api\').include_dir")'
       ],
       'defines': [ 
           'NAPI_DISABLE_CPP_EXCEPTIONS',
           'NODE_ADDON_API_ENABLE_MAYBE' 
       ],
       'conditions': [
           ['OS=="mac"', {
               'cflags+': ['-fvisibility=hidden'],
               'xcode_settings': {
                   'GCC_SYMBOLS_PRIVATE_EXTERN': 'YES', # -fvisibility=hidden
               }
           }]
       ]
   },
   'targets': [
       {
           'target_name': 'clipboard',
           'sources': [ 'src/cpp/clipboard.cpp' ]
       },
       {
           'target_name': 'screen',
           'sources': [ 'src/cpp/screen.cpp' ]
       },
       {
           'target_name': 'keyboard',
           'sources': [ 'src/cpp/keyboard.cpp' ]
       },
       {
           'target_name': 'mouse',
           'sources': [ 'src/cpp/mouse.cpp' ]
       },
       {
           'target_name': 'misc',
           'sources': [ 'src/cpp/misc.cpp' ]
       },
       {
           'target_name': 'screenRaw',
           'sources': [ 'src/cpp/screenRaw.cpp' ]
       }
   ]
}