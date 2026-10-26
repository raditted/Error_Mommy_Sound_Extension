import { FishAudioConfig } from './types';
import {
  FISH_AUDIO_API_URL,
  FISH_AUDIO_MODEL,
  DEFAULT_SPEECH_SPEED,
  DEFAULT_MP3_BITRATE,
} from './constants';

// Public API

/**
 * Verify that the given API key is valid by hitting the wallet endpoint.
 *
 * @returns `true` if the key is accepted, `false` otherwise.
 */
export async function checkApiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch(`${FISH_AUDIO_API_URL}/wallet/self/api-credit`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return response.ok;
  } catch (error) {
    console.error('Mommy ASMR: Error checking Fish Audio API key:', error);
    return false;
  }
}

/**
 * Generate a TTS audio buffer for the given text.
 *
 * @param text   - The text to speak.
 * @param config - API key and voice-model ID.
 * @returns An MP3 audio buffer.
 * @throws If the API returns a non-2xx status.
 */
export async function synthesizeSpeech(
  text: string,
  config: FishAudioConfig,
): Promise<Buffer> {
  const response = await fetch(`${FISH_AUDIO_API_URL}/tts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      model: FISH_AUDIO_MODEL,
    },
    body: JSON.stringify({
      text,
      reference_id: config.modelId,
      format: 'mp3',
      mp3_bitrate: DEFAULT_MP3_BITRATE,
      speed: DEFAULT_SPEECH_SPEED,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Fish Audio API error ${response.status}: ${body}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
