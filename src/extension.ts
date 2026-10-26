import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ErrorEvent, ScoldMessages, getExtensionSettings } from './types';
import { parseErrorCategory } from './errorParser';
import { synthesizeSpeech } from './fishAudioClient';
import { playAudioFile, stopCurrentAudio } from './audioPlayer';
import { CacheManager } from './cacheManager';
import { MommySidebarProvider } from './webviewPanel';
import { ExecutionListener } from './executionListener';

// Helpers

/** Load the scold message templates from the bundled JSON file. */
function loadScoldMessages(extensionPath: string): ScoldMessages {
  const filePath = path.join(extensionPath, 'media', 'scolds.json');
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as ScoldMessages;
}

/** Pick a random element from an array. */
function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** Remove Fish-Audio emotion / control tags like `[gentle]`, `[pause]`. */
function stripEmotionTags(text: string): string {
  return text.replace(/\[.*?\]/g, '').trim();
}

// Activation

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel('Mommy Error ASMR');
  context.subscriptions.push(outputChannel);

  const log = (msg: string): void => {
    outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${msg}`);
  };

  log('Activating Mommy Error ASMR extension...');

  // Status Bar Indicator
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.command = 'mommyErrorAsmr.toggle';

  const updateStatusBar = (): void => {
    const isEnabled = vscode.workspace
      .getConfiguration('mommyErrorAsmr')
      .get<boolean>('enabled', true);
    if (isEnabled) {
      statusBarItem.text = '$(heart) Mommy ASMR';
      statusBarItem.tooltip = 'Mommy Error ASMR is active 💕 (Click to disable)';
    } else {
      statusBarItem.text = '$(heart-broken) Mommy ASMR (Off)';
      statusBarItem.tooltip = 'Mommy Error ASMR is disabled 💔 (Click to enable)';
    }
    statusBarItem.show();
  };

  updateStatusBar();
  context.subscriptions.push(
    statusBarItem,
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('mommyErrorAsmr.enabled')) {
        updateStatusBar();
      }
    }),
  );

  // Check terminal shell integration setting
  const shellIntegrationConfig = vscode.workspace.getConfiguration('terminal.integrated.shellIntegration');
  const isShellIntegrationEnabled = shellIntegrationConfig.get<boolean>('enabled', true);
  if (!isShellIntegrationEnabled) {
    log('Warning: terminal.integrated.shellIntegration.enabled is false!');
    vscode.window.showWarningMessage(
      'Mommy Error ASMR: Terminal shell integration is currently disabled in VS Code settings. Please enable it to detect errors in the terminal.',
      'Enable Shell Integration',
    ).then((selection) => {
      if (selection === 'Enable Shell Integration') {
        shellIntegrationConfig.update('enabled', true, vscode.ConfigurationTarget.Global);
      }
    });
  }

  // Load message templates
  let scolds: ScoldMessages;
  try {
    scolds = loadScoldMessages(context.extensionPath);
    log('Loaded scold templates successfully.');
  } catch (err) {
    log(`Failed to load scolds.json: ${err}`);
    console.error('Mommy ASMR: Failed to load scolds.json', err);
    vscode.window.showErrorMessage(
      'Mommy Error ASMR: Failed to load message templates!',
    );
    return;
  }

  // Core services
  const cacheManager = new CacheManager(context.globalStorageUri);
  const sidebarProvider = new MommySidebarProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      MommySidebarProvider.viewType,
      sidebarProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  // Error handler

  const handleError = async (
    errorEvent: ErrorEvent,
    isTest = false,
  ): Promise<void> => {
    log(`Received error event from [${errorEvent.source}] (isTest: ${isTest})`);
    const settings = getExtensionSettings();

    // Respect enabled toggle (unless this is a manual test).
    if (!settings.enabled && !isTest) {
      log('Mommy ASMR is disabled in settings, skipping.');
      vscode.window.setStatusBarMessage(
        '$(heart-broken) Mommy ASMR is disabled (Click status bar to enable)',
        4000,
      );
      return;
    }

    // Stop any audio that's already playing.
    stopCurrentAudio();

    // Respect trigger-source filter.
    if (
      !isTest &&
      settings.triggerSource !== 'all' &&
      settings.triggerSource !== errorEvent.source
    ) {
      log(`Trigger source [${errorEvent.source}] ignored (configured: [${settings.triggerSource}]).`);
      return;
    }

    // Validate credentials.
    const apiKey = settings.fishAudioApiKey;
    const modelId = settings.fishAudioModelId;

    if (!apiKey || !modelId) {
      log('Fish Audio API Key or Model ID is missing in settings.');
      const choice = await vscode.window.showWarningMessage(
        'Mommy Error ASMR: Please set your Fish Audio API Key and Model ID in Settings.',
        'Open Settings',
      );
      if (choice === 'Open Settings') {
        vscode.commands.executeCommand(
          'workbench.action.openSettings',
          'mommyErrorAsmr',
        );
      }
      return;
    }

    // Pick a category-appropriate message.
    const category = parseErrorCategory(errorEvent.errorText);
    log(`Classified error category: "${category}"`);

    const messages =
      scolds[category] ??
      scolds['generic'] ?? ['Oh sweetie, something went wrong…'];
    const rawMessage = pickRandom(messages);
    const displayText = stripEmotionTags(rawMessage) || rawMessage;
    log(`Selected scold: "${displayText}"`);

    try {
      // Cache lookup → TTS generation → playback.
      let audioPath = await cacheManager.get(rawMessage, modelId);
      if (!audioPath) {
        log('Synthesizing speech via Fish Audio API...');
        const audioData = await synthesizeSpeech(rawMessage, {
          apiKey,
          modelId,
        });
        audioPath = await cacheManager.set(rawMessage, modelId, audioData);
        log(`Cached TTS audio to: ${audioPath}`);
      } else {
        log(`Found cached audio: ${audioPath}`);
      }

      playAudioFile(audioPath);
      log(`Audio playback started for: ${audioPath}`);

      // Show sidebar with character image (clean text for readable UI).
      if (settings.showImage) {
        sidebarProvider.show(displayText, errorEvent.errorText);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to generate audio';
      log(`Error generating audio: ${message}`);
      console.error('Mommy ASMR: Failed to process error:', err);
      vscode.window.showWarningMessage(`Mommy Error ASMR: ${message}`);
    }
  };

  // Listeners & commands

  const executionListener = new ExecutionListener(handleError, log);
  executionListener.activate();

  context.subscriptions.push(
    executionListener,
    { dispose: () => sidebarProvider.dispose() },

    vscode.commands.registerCommand('mommyErrorAsmr.toggle', () => {
      const config = vscode.workspace.getConfiguration('mommyErrorAsmr');
      const current = config.get<boolean>('enabled', true);
      config.update('enabled', !current, vscode.ConfigurationTarget.Global);
      updateStatusBar();
      vscode.window.showInformationMessage(
        `Mommy Error ASMR is now ${!current ? 'active 💕' : 'disabled 💔'}`,
      );
    }),

    vscode.commands.registerCommand('mommyErrorAsmr.testSound', () => {
      log('Running manual test sound command...');
      handleError(
        {
          source: 'task',
          errorText:
            'TestError: This is a test error to check if mommy is listening!',
        },
        true,
      );
    }),

    vscode.commands.registerCommand('mommyErrorAsmr.clearCache', async () => {
      await cacheManager.clear();
      log('Cache cleared.');
      vscode.window.showInformationMessage(
        'Mommy Error ASMR: Audio cache cleared! 🧹',
      );
    }),

    vscode.commands.registerCommand('mommyErrorAsmr.showOutput', () => {
      outputChannel.show();
    }),
  );

  const initialSettings = getExtensionSettings();
  if (!initialSettings.enabled) {
    log('Mommy Error ASMR is currently DISABLED in settings.');
    vscode.window
      .showWarningMessage(
        'Mommy Error ASMR is currently disabled in your settings.',
        'Enable Now 💕',
      )
      .then((selection) => {
        if (selection === 'Enable Now 💕') {
          vscode.workspace
            .getConfiguration('mommyErrorAsmr')
            .update('enabled', true, vscode.ConfigurationTarget.Global);
          updateStatusBar();
        }
      });
  } else {
    log('Mommy Error ASMR is active! 💕');
    vscode.window.showInformationMessage('Mommy Error ASMR is active! 💕');
  }
}

// Deactivation

export function deactivate(): void {
  stopCurrentAudio();
}
