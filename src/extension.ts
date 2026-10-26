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
  // Load message templates
  let scolds: ScoldMessages;
  try {
    scolds = loadScoldMessages(context.extensionPath);
  } catch (err) {
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
    const settings = getExtensionSettings();

    // Respect enabled toggle (unless this is a manual test).
    if (!settings.enabled && !isTest) {
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
      return;
    }

    // Validate credentials.
    const apiKey = settings.fishAudioApiKey;
    const modelId = settings.fishAudioModelId;

    if (!apiKey || !modelId) {
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
    const messages =
      scolds[category] ??
      scolds['generic'] ?? ['Oh sweetie, something went wrong…'];
    const rawMessage = pickRandom(messages);
    const displayText = stripEmotionTags(rawMessage) || rawMessage;

    try {
      // Cache lookup → TTS generation → playback.
      // Pass rawMessage to Fish Audio so it processes emotion/prosody tags ([laughing], [angry], etc.)
      let audioPath = await cacheManager.get(rawMessage, modelId);
      if (!audioPath) {
        const audioData = await synthesizeSpeech(rawMessage, {
          apiKey,
          modelId,
        });
        audioPath = await cacheManager.set(rawMessage, modelId, audioData);
      }

      playAudioFile(audioPath);

      // Show sidebar with character image (clean text for readable UI).
      if (settings.showImage) {
        sidebarProvider.show(displayText, errorEvent.errorText);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to generate audio';
      console.error('Mommy ASMR: Failed to process error:', err);
      vscode.window.showWarningMessage(`Mommy Error ASMR: ${message}`);
    }
  };

  // Listeners & commands

  const executionListener = new ExecutionListener(handleError);
  executionListener.activate();

  context.subscriptions.push(
    executionListener,
    { dispose: () => sidebarProvider.dispose() },

    vscode.commands.registerCommand('mommyErrorAsmr.toggle', () => {
      const config = vscode.workspace.getConfiguration('mommyErrorAsmr');
      const current = config.get<boolean>('enabled', true);
      config.update('enabled', !current, true);
      vscode.window.showInformationMessage(
        `Mommy Error ASMR is now ${!current ? 'active 💕' : 'disabled 💔'}`,
      );
    }),

    vscode.commands.registerCommand('mommyErrorAsmr.testSound', () => {
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
      vscode.window.showInformationMessage(
        'Mommy Error ASMR: Audio cache cleared! 🧹',
      );
    }),
  );

  vscode.window.showInformationMessage('Mommy Error ASMR is active! 💕');
}

// Deactivation

export function deactivate(): void {
  stopCurrentAudio();
}
