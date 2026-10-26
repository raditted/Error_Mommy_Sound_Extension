import * as vscode from 'vscode';
import * as crypto from 'crypto';

/**
 * Disk-backed audio cache using the extension's global storage.
 *
 * Audio files are stored as `<md5-hash>.mp3` under an `audio-cache/`
 * subdirectory. The hash key is derived from `text::modelId` so that
 * different voices or phrasings get separate cache entries.
 */
export class CacheManager {
  private readonly cacheDir: vscode.Uri;

  constructor(storageUri: vscode.Uri) {
    this.cacheDir = vscode.Uri.joinPath(storageUri, 'audio-cache');
  }

  // Public API

  /** Return the cached file path, or `undefined` if not cached. */
  async get(
    text: string,
    modelId: string,
    ttsModel?: string,
  ): Promise<string | undefined> {
    const uri = this.fileUri(text, modelId, ttsModel);
    return (await this.exists(uri)) ? uri.fsPath : undefined;
  }

  /** Write audio data to the cache and return the file path. */
  async set(
    text: string,
    modelId: string,
    audioData: Buffer,
    ttsModel?: string,
  ): Promise<string> {
    await this.ensureCacheDir();
    const uri = this.fileUri(text, modelId, ttsModel);

    const bytes = new Uint8Array(
      audioData.buffer,
      audioData.byteOffset,
      audioData.length,
    );
    await vscode.workspace.fs.writeFile(uri, bytes);

    return uri.fsPath;
  }

  /** Delete the entire cache directory. */
  async clear(): Promise<void> {
    try {
      await vscode.workspace.fs.delete(this.cacheDir, {
        recursive: true,
        useTrash: false,
      });
    } catch {
      // Directory may not exist yet — that's fine.
    }
  }

  // Internals

  private fileUri(
    text: string,
    modelId: string,
    ttsModel?: string,
  ): vscode.Uri {
    const key = ttsModel ? `${text}::${modelId}::${ttsModel}` : `${text}::${modelId}`;
    const hash = crypto
      .createHash('md5')
      .update(key)
      .digest('hex');
    return vscode.Uri.joinPath(this.cacheDir, `${hash}.mp3`);
  }

  private async exists(uri: vscode.Uri): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  private async ensureCacheDir(): Promise<void> {
    if (!(await this.exists(this.cacheDir))) {
      await vscode.workspace.fs.createDirectory(this.cacheDir);
    }
  }
}
