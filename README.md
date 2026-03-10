# Setup
Install [Bun](https://bun.sh/) and [Rokit](https://github.com/rojo-rbx/rokit)  
Run `bun install` and `rokit install`  
Hit `CTRL + SHIFT + B` or run `bun ./scripts/bundler.js`

# Bundler Information
The bundler is a fork of a bundler me and topit made a few years ago, [RedlinePack](https://github.com/topitbopit/RedlinePack). This version differs from the last v1.1.1 release, currently at v2.1.0 it is a completely modernized version of v1.1.1 that I've maintained since then privately. Additions include a hardcoded configuration, a more sophisticated build process, and better performance optimizations as well as smaller additions like minification w/ darklua as well as debug and release builds, template literals, BUILD_TIMESTAMP and TIMPORT_DIR functions, and switching to fs-extra to automatically create outdir dirs, etc. 

# Documentation
## `IMPORT`
Imports the file specified
```lua
IMPORT("./file.lua");
```
## `IMPORT_MULTI`
Imports files specified
```lua
IMPORT("./file1.lua", "./file2.lua", "./file3.lua");
```
## `IMPORT_DIR`
Imports all files inside a directory
```lua
IMPORT("./modules/");
```
## `IMPORT_RAW`
Imports the file without wrapping in an anonymous function (useful for variable injection)
> [!CAUTION] Weird bug I am yet to fix: You have to add a local variable at the end of the file. Normally I just add `local raw` at the end.
```lua
IMPORT_RAW("./file.lua");
```
# `BUILD_TIMESTAMP`
Replaces with a timestamp of the current build date as UNIX time. Automatically compensated for Lua.
```lua
local Timestamp = BUILD_TIMESTAMP();

os.date("Build Date: %x # %I:%M %p", Timestamp);
```
# `TIMPORT_DIR`
> [!CAUTION] Notice: This is experimental and should not be used
Imports a directory but wraps each import in a new task.
```lua
TIMPORT_DIR("./modules/");
```

# Features
Recursiveness is SUPPORTED. In settings you can change the entrypoint/inputfile. You can also change keywords for different variables, etc. I prefer that you keep them the same, to prevent confusion. 

Example of file recursiveness:
```lua
-- src/modules/value.luau
return 5;
```
```lua
-- src/something/test.luau
local value = IMPORT("../modules/value.luau");
```
BUT you could also simply:
```lua
-- src/something/test.luau
local value = IMPORT("modules/value.luau");
```
and it will automatically search from `src`/the base directory of `main.lua`.

# Quirks
IT'S JUST TEXT... The biggest mistake I see people do with the bundler is assuming it's "smart" - IT ISN'T. It's just a glorified text replacer. It doesn't know what needs your code other than you asked it to be put there, either raw or in a function, or importing multiple files, etc. ALL IT KNOWS IS TO COPY AND PASTE! 

When you use `IMPORT("file.lua")`, the bundler deletes that line and pastes the content of `file.lua` in its place inside an anonymous function. So if your `file.lua` is:
```lua
return {
    "value1",
    "value2",
    ...
}
```
and you add in the line:
```lua
local values = IMPORT("file.lua");
```
it will REPLACE it with:
```lua
local values = (function()
    return {
        "value1",
        "value2",
        ...
    }
end)()
```
This gives that import it's own scope, which replicates each one having it's own environment/scope. Again, it isn't ANYTHING like Luau's require, where every file is an isolated blob, it's just a TEXT REPLACER. YOU have to do the dependency management. 

Think of it as a black box, it's great because it prevents variables from leaking everywhere but it means you MUST return what you want to share and IMPORT it as a variable. MODULES. 
1. You can put whatever you want inside of it
2. Nothing can see the inside of the box from outside
3. The only way is to return something out of it
Now, here is the quirk that lets you save on memory and other things. 
```lua
local module = IMPORT("module.lua"); -- for simplicity, module returns a table with two variables, one is foo, the other is bar.

IMPORT("foo.bar.luau");
```
Inside `foo.bar.luau` you can do the following:
```lua
print(module.foo);
print(module.bar);
```
And when you build it gets turned into:
```lua
local module = (function()
    return {
        foo = 100;
        bar = 50;
    }
end)()

(function()
    print(module.foo);
    print(module.bar);
end)()
```

# Debug and Release Builds
Debug builds inject a global variable automatically, that is replaced with `true`. This means you can do the following:
```lua
if (_G.DEBUG) then
    print("Debug Mode");
else
    print("Release Mode");
end
```
With the way Darklua works it will get rid of any code that won't be used automatically, saving us time and final output space on release builds. 

# Circular Dependencies
BE careful not to accidentally create a circular dependency loop. If file a imports file b, which imports file a it will cause the bundler to loop infinitely or crash if you are lucky! It WILL take up all of your ram.

# Future
In the future I plan on rewriting this for Lune. A separate branch will be made specifically for that rewrite. 