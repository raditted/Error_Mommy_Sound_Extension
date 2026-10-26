# Changelog

All notable changes to the **Error Mommy Sound Extension** will be documented in this file.

## [0.1.2]

### Fixed
- Fixed race condition in terminal shell execution stream where output was read before stream flush completed.
- Added Debug Adapter Protocol (DAP) tracker (`vscode.debug.registerDebugAdapterTrackerFactory`) to reliably detect errors and unhandled exceptions when running or debugging code via F5, "Run Java", "Debug Python File", or CodeLens.
- Fixed F5 Extension Development Host launch configuration order and esbuild problem matcher to prevent launch crashes.
- Added dedicated "Mommy Error ASMR" Output Channel with real-time logs for all error detections, audio synthesis, and playback.
- Added check and guidance for VS Code Terminal Shell Integration settings.

## [0.1.1]

### Changed
- Updated extension marketplace icon to pixel heart.
- Corrected GitHub repository and issue tracker URLs.

## [0.1.0]

### Added
- Smart error categorization (syntax, null-reference, type, import, key, compilation, runtime, generic).
- Fish Audio TTS integration with configurable voice model.
- Sidebar webview panel with character image, mommy message, and error details.
- Local audio caching to save API credits.
- Terminal shell-integration listener for Python (`.py`) and Java compilation/runtime errors (VS Code ≥ 1.93).
- Full Python traceback and syntax error extraction with intelligent categorization (SyntaxError, IndentationError, NoneType, TypeError, NameError, KeyError, etc.).
- Cross-platform audio playback (macOS, Windows, Linux).
- Commands: Toggle, Test Sound, Clear Cache.
- Configurable trigger source filter (`notebook`, `task`, `terminal`, `debug`, `all`).
