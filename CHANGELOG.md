# Changelog

All notable changes to the **Error Mommy Sound Extension** will be documented in this file.

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
- Configurable trigger source filter (`notebook`, `task`, `terminal`, `all`).
