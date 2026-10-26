# Error Mommy Sound Extension

**Your build failed. Let someone gentle tell you about it.**

Error Mommy Sound Extension is a VS Code extension that reads your errors out loud. When a task, notebook cell, or terminal command fails, it generates a short voice line with [Fish Audio](https://fish.audio/) TTS, plays it, and shows the details in the sidebar. The tone depends on what went wrong.

## What it does

- **Speaks on failure.** Triggers on failed build tasks, notebook cells, and terminal commands.
- **Matches the message to the error.** Errors are classified (syntax, null reference, type, import, and more), and each class has its own set of lines.
- **Shows the details.** A sidebar panel displays a character image, the spoken message, and the raw error output, so nothing is lost when the audio ends.
- **Caches audio.** Generated clips are stored locally, so repeated errors play instantly and cost no extra API credits.
- **Plays on any OS.** Uses `afplay` on macOS, `SoundPlayer` on Windows, and `paplay`, `aplay`, or `ffplay` on Linux.

## Getting started

1. Install the extension from the VS Code Marketplace.
2. Create an API key at [fish.audio/app/api-keys/](https://fish.audio/app/api-keys/).
3. Open **Settings**, search for `mommyErrorAsmr`, and paste your **API Key**.
   - The **Model ID** is already filled in with the default mommy voice (`60bd8f0f5bbc462a8fa1686dd81af336`).
   - If you want a different voice, browse [fish.audio/app/discovery](https://fish.audio/app/discovery) and copy any model ID you like.
4. Run the **Mommy ASMR: Test Sound** command to confirm everything works.

> [!TIP]
> The default voice model ID is `60bd8f0f5bbc462a8fa1686dd81af336`. You can change it anytime in settings to any model from [fish.audio/app/discovery](https://fish.audio/app/discovery).

> [!NOTE]
> Each new voice line calls the Fish Audio API and uses your credits. Lines that were already generated are served from the local cache at no cost.

## Error sources

| Source     | Catches                                                                                                | Requirements                      |
| ---------- | ------------------------------------------------------------------------------------------------------ | --------------------------------- |
| `notebook` | Failed Jupyter and notebook cell executions                                                            | None                              |
| `task`     | Build, compile, Java, and Python tasks that exit with a non-zero code                                  | None                              |
| `terminal` | Python and Java errors (syntax, exceptions, tracebacks) in the integrated terminal                     | VS Code 1.93+ (shell integration) |
| `debug`    | Debug and run sessions (F5, Run Java, Debug Python) that hit unhandled exceptions or exit with errors  | None                              |

> [!IMPORTANT]
> Terminal detection depends on VS Code shell integration, which requires VS Code 1.93 or newer. On older versions, use the `task`, `debug`, or `notebook` sources.

## Settings

| Setting                           | Description                                                                   | Default                                |
| --------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------- |
| `mommyErrorAsmr.enabled`          | Turn the extension on or off                                                  | `true`                                 |
| `mommyErrorAsmr.fishAudioApiKey`  | Your Fish Audio API key ([create one here](https://fish.audio/app/api-keys/))  | `""`                                   |
| `mommyErrorAsmr.fishAudioModelId` | Voice model ID                                                                | `"60bd8f0f5bbc462a8fa1686dd81af336"`  |
| `mommyErrorAsmr.ttsModel`         | Fish Audio engine model: `s2.1-pro-free`, `s2-pro`, `s2.1-pro`, or `s1`       | `"s2.1-pro-free"`                      |
| `mommyErrorAsmr.triggerSource`    | Which sources to listen to: `notebook`, `task`, `terminal`, `debug`, or `all` | `"all"`                                |
| `mommyErrorAsmr.characterImage`   | Path to a custom character image                                              | `""` (bundled default)                 |
| `mommyErrorAsmr.showImage`        | Show the sidebar panel when an error occurs                                   | `true`                                 |

> [!WARNING]
> Your API key is stored in your VS Code settings. Do not commit `settings.json` or share it publicly if it contains the key.

### Custom Character Image

You can display your own character art in the sidebar panel by setting `mommyErrorAsmr.characterImage`. Supported formats include `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, and `.svg`.

Examples:

- **Linux**: `/home/username/Pictures/mommy.png` or `~/Pictures/mommy.png`
- **macOS**: `/Users/username/Pictures/mommy.png` or `~/Pictures/mommy.png`
- **Windows**: `C:\Users\username\Pictures\mommy.png`
- **Workspace-relative**: `assets/character.png` (relative to your open project)

Leave this setting empty to use the default bundled illustration.

## Commands

| Command                           | Description                                |
| --------------------------------- | ------------------------------------------ |
| `Mommy ASMR: Toggle Sound On/Off` | Enable or disable voice feedback           |
| `Mommy ASMR: Test Sound`          | Play a random message to verify your setup |
| `Mommy ASMR: Clear Audio Cache`   | Delete all cached audio files              |

> [!CAUTION]
> Clearing the cache removes every saved clip. Any line you hear again will be regenerated through the API and use credits.

## Development

```bash
npm install          # install dependencies
npm run compile      # development build with source maps
npm run watch        # rebuild on change
npm run package      # production build
```

Press **F5** in VS Code to launch the Extension Development Host.

## Credits

- Text-to-speech by [Fish Audio](https://fish.audio/).
- Default character art by [@L1amanade](https://x.com/L1amanade/status/1761263646574031004).
