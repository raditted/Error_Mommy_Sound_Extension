import * as vscode from 'vscode';
import { DEFAULT_MODEL_ID } from './constants';

// Error categories

/** All recognized error categories for message selection. */
export type ErrorCategory =
  | 'syntax-error'
  | 'null-reference'
  | 'type-error'
  | 'import-error'
  | 'key-error'
  | 'compilation-error'
  | 'runtime-error'
  | 'generic';

// Error events

/** Source that triggered the error detection. */
export type ErrorSource = 'notebook' | 'task' | 'terminal' | 'debug';

/** Payload emitted when a code-execution error is detected. */
export interface ErrorEvent {
  source: ErrorSource;
  errorText: string;
  fileName?: string;
}

/** Callback signature for the error handler. */
export type ErrorCallback = (event: ErrorEvent, isTest?: boolean) => void;

// Fish Audio

/** Credentials needed by the Fish Audio TTS API. */
export interface FishAudioConfig {
  apiKey: string;
  modelId: string;
}

// Scold messages

/**
 * Maps each error category to an array of TTS message templates.
 * Keys must match `ErrorCategory`.
 */
export type ScoldMessages = Record<ErrorCategory, string[]>;

// Extension settings (mirrors package.json contributes.configuration)

/** Trigger source filter from user settings. */
export type TriggerSource = ErrorSource | 'all';

/** Typed wrapper around the `mommyErrorAsmr.*` configuration section. */
export interface ExtensionSettings {
  enabled: boolean;
  fishAudioApiKey: string;
  fishAudioModelId: string;
  triggerSource: TriggerSource;
  characterImage: string;
  showImage: boolean;
}

/** Read the current extension settings from VS Code configuration. */
export function getExtensionSettings(): ExtensionSettings {
  const config = vscode.workspace.getConfiguration('mommyErrorAsmr');
  return {
    enabled: config.get<boolean>('enabled', true),
    fishAudioApiKey: config.get<string>('fishAudioApiKey', ''),
    fishAudioModelId:
      config.get<string>('fishAudioModelId', DEFAULT_MODEL_ID) ||
      DEFAULT_MODEL_ID,
    triggerSource: config.get<TriggerSource>('triggerSource', 'all'),
    characterImage: config.get<string>('characterImage', ''),
    showImage: config.get<boolean>('showImage', true),
  };
}
