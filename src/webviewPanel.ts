import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { getExtensionSettings } from './types';
import { SIDEBAR_IDLE_TIMEOUT_MS } from './constants';

/**
 * Provides the sidebar webview that shows the character image,
 * the "mommy says" message, and the raw error details.
 */
export class MommySidebarProvider
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  public static readonly viewType = 'mommyErrorAsmr.sidebarView';

  private view: vscode.WebviewView | undefined;
  private hideTimeout: ReturnType<typeof setTimeout> | undefined;

  /** Latest content so we can restore state when the view re-resolves. */
  private latestMessage = '';
  private latestError = '';
  private hasContent = false;

  constructor(private readonly extensionUri: vscode.Uri) {}

  // WebviewViewProvider

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'media'),
        vscode.Uri.file('/'),
      ],
    };

    // Restore the last-shown state, or show idle.
    this.renderCurrentState();

    webviewView.onDidDispose(() => {
      this.view = undefined;
    });
  }

  // Public API

  /**
   * Display a mommy message + error details in the sidebar.
   * Focuses the sidebar and auto-reverts to idle after a timeout.
   */
  public show(message: string, errorDetails: string): void {
    this.latestMessage = message;
    this.latestError = errorDetails;
    this.hasContent = true;

    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
    }

    if (this.view) {
      this.view.show?.(true);
      this.renderCurrentState();
    } else {
      // View not resolved yet — force VS Code to open & resolve it.
      vscode.commands.executeCommand('mommyErrorAsmr.sidebarView.focus');
    }

    this.hideTimeout = setTimeout(() => {
      this.revertToIdle();
    }, SIDEBAR_IDLE_TIMEOUT_MS);
  }

  public dispose(): void {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
    }
  }

  // Rendering

  private renderCurrentState(): void {
    if (!this.view) {
      return;
    }

    this.view.webview.html = this.hasContent
      ? this.buildErrorHtml(
          this.view.webview,
          this.latestMessage,
          this.latestError,
        )
      : this.buildIdleHtml(this.view.webview);
  }

  private revertToIdle(): void {
    this.hasContent = false;
    this.renderCurrentState();
  }

  // HTML builders

  private buildIdleHtml(webview: vscode.Webview): string {
    const template = this.readTemplate('sidebar-idle.html');
    const imageUri = this.getCharacterImageUri(webview);

    return template.replace('{{IMAGE_URI}}', imageUri.toString());
  }

  private buildErrorHtml(
    webview: vscode.Webview,
    message: string,
    errorDetails: string,
  ): string {
    const template = this.readTemplate('sidebar-error.html');
    const imageUri = this.getCharacterImageUri(webview);

    return template
      .replace('{{IMAGE_URI}}', imageUri.toString())
      .replace('{{MESSAGE}}', this.escapeHtml(message))
      .replace('{{ERROR_DETAILS}}', this.escapeHtml(errorDetails));
  }

  // Helpers

  private readTemplate(filename: string): string {
    const templatePath = path.join(
      this.extensionUri.fsPath,
      'media',
      filename,
    );
    return fs.readFileSync(templatePath, 'utf-8');
  }

  /**
   * Resolves the custom character image path.
   * Supports absolute paths, `~` (home directory), and workspace-relative paths.
   */
  private resolveImagePath(rawPath: string): string | undefined {
    let resolved = rawPath.trim();
    if (!resolved) {
      return undefined;
    }

    // Expand ~ to user home directory
    if (resolved.startsWith('~/') || resolved === '~') {
      resolved = path.join(os.homedir(), resolved.slice(2));
    } else if (!path.isAbsolute(resolved) && vscode.workspace.workspaceFolders?.[0]) {
      // Allow relative paths from current workspace folder
      resolved = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, resolved);
    }

    return fs.existsSync(resolved) ? resolved : undefined;
  }

  private getCharacterImageUri(webview: vscode.Webview): vscode.Uri {
    const { characterImage } = getExtensionSettings();
    const resolvedPath = this.resolveImagePath(characterImage);

    if (resolvedPath) {
      return webview.asWebviewUri(vscode.Uri.file(resolvedPath));
    }
    return webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'mommy-default.jpg'),
    );
  }

  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
