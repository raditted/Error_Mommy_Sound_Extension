import * as vscode from 'vscode';
import * as path from 'path';
import { ErrorEvent, ErrorCallback } from './types';
import { MAX_JAVA_STACK_LINES } from './constants';

// ANSI stripping

/** Remove all ANSI escape sequences (colors, cursor moves, shell integration OSC markers, etc.). */
export function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
    .replace(/\u001b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
    .replace(/\\u001b\[[0-9;]*[a-zA-Z]/gi, '')
    .replace(/\\u001b\[[0-9;]*m/gi, '')
    .replace(/\\u001b/gi, '');
}

// Notebook helpers

/**
 * Normalize raw notebook-cell error output into a human-readable string.
 *
 * Handles three formats:
 * - JSON error objects (`{ name, message, stack }`)
 * - ANSI-colored plain text
 * - Plain text as-is
 */
export function cleanNotebookErrorText(rawText: string): string {
  if (!rawText) {
    return 'Unknown Error';
  }

  const text = rawText.trim();

  // JSON error objects (e.g. application/vnd.code.notebook.error)
  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const json = JSON.parse(text);
      if (json && (json.name || json.message || json.stack)) {
        return formatJsonError(json);
      }
    } catch {
      // Not valid JSON — fall through to plain-text handling.
    }
  }

  return stripAnsi(text).trim();
}

/** Build a readable string from a parsed notebook JSON error object. */
function formatJsonError(json: {
  name?: string;
  message?: string;
  stack?: string | string[];
}): string {
  const name = json.name ? String(json.name).trim() : '';
  const message = json.message ? String(json.message).trim() : '';
  const header = [name, message].filter(Boolean).join(': ');

  const rawStack =
    typeof json.stack === 'string'
      ? json.stack
      : Array.isArray(json.stack)
        ? json.stack.join('\n')
        : '';
  const cleanStack = stripAnsi(rawStack).trim();

  if (!cleanStack) {
    return header || 'Unknown Error';
  }
  if (cleanStack.startsWith(header) || cleanStack.endsWith(header)) {
    return cleanStack;
  }
  return `${header}\n\n${cleanStack}`;
}

// Python error detection

/**
 * Patterns that indicate the terminal or debug output contains a Python error or traceback.
 */
const PYTHON_ERROR_PATTERNS: readonly RegExp[] = [
  /Traceback \(most recent call last\):/i,
  /File\s+["'][^"']+["'],\s+line\s+\d+/i,
  /^\s*(?:SyntaxError|IndentationError|TabError|NameError|TypeError|ValueError|AttributeError|IndexError|KeyError|ImportError|ModuleNotFoundError|ZeroDivisionError|FileNotFoundError|PermissionError|RuntimeError|RecursionError|UnboundLocalError|AssertionError|NotImplementedError|Exception):\s/m,
];

/** Returns `true` if the text looks like it contains a Python error. */
export function containsPythonError(text: string): boolean {
  return PYTHON_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Extract only the relevant error lines from Python terminal or debug output.
 * Captures the traceback header, file locations, code snippets, pointers, and exception message.
 */
export function extractPythonErrorText(text: string): string {
  const lines = text.split('\n');
  const errorLines: string[] = [];
  let inTraceback = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    // Traceback start
    if (/Traceback \(most recent call last\):/i.test(trimmed)) {
      inTraceback = true;
      errorLines.push(trimmed);
      continue;
    }

    // Direct syntax error or frame start: File "...", line X
    if (/File\s+["'][^"']+["'],\s+line\s+\d+/i.test(trimmed)) {
      inTraceback = true;
      errorLines.push(trimmed);
      continue;
    }

    // Direct standalone exception line
    if (/^[A-Za-z]+(?:Error|Exception):\s*/.test(trimmed)) {
      errorLines.push(trimmed);
      inTraceback = false;
      continue;
    }

    if (inTraceback) {
      errorLines.push(trimmed);
    }
  }

  // Cap traceback if too long
  if (errorLines.length > 15) {
    const truncated = [
      ...errorLines.slice(0, 5),
      `... (${errorLines.length - 10} lines omitted) ...`,
      ...errorLines.slice(-5),
    ];
    return truncated.join('\n');
  }

  return errorLines.join('\n') || text.trim().slice(0, 500);
}

// Java error detection

/**
 * Patterns that indicate the terminal or debug output contains a Java error.
 * Includes `javac` compilation errors, runtime exceptions, and stack traces.
 */
const JAVA_ERROR_PATTERNS: readonly RegExp[] = [
  /\.java:\d+:\s*error:/i,                    // javac: "File.java:10: error: …"
  /^\d+\s+errors?$/m,                         // javac summary: "2 errors"
  /Exception in thread\s/i,                    // runtime: "Exception in thread …"
  /^\s*at\s+[\w$.]+\([\w.]+:\d+\)/m,          // stack frame
  /(?:NullPointerException|ArrayIndexOutOfBoundsException|ClassNotFoundException|NoSuchMethodException|IllegalArgumentException|StackOverflowError|OutOfMemoryError|ClassCastException|NumberFormatException|FileNotFoundException|IOException|ArithmeticException|StringIndexOutOfBoundsException|UnsupportedOperationException|ConcurrentModificationException|NoClassDefFoundError)/,
];

/** Returns `true` if the text looks like it contains a Java error. */
export function containsJavaError(text: string): boolean {
  return JAVA_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Extract only the relevant error lines from Java compiler / runtime output,
 * filtering out noise and limiting stack-trace depth.
 */
export function extractJavaErrorText(text: string): string {
  const lines = text.split('\n');
  const errorLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    // javac error lines
    if (/\.java:\d+:\s*error:/i.test(trimmed)) {
      errorLines.push(trimmed);
      continue;
    }
    // Caret pointer lines (^) that follow an error line
    if (/^\s*\^/.test(trimmed) && errorLines.length > 0) {
      errorLines.push(trimmed);
      continue;
    }
    // Exception / error header lines (but not stack frames)
    if (/exception|error/i.test(trimmed) && !/^\s*at\s/.test(trimmed)) {
      errorLines.push(trimmed);
      continue;
    }
    // Stack frames (capped)
    if (/^\s*at\s+/.test(trimmed)) {
      const stackCount = errorLines.filter((l) => /^\s*at\s+/.test(l)).length;
      if (stackCount < MAX_JAVA_STACK_LINES) {
        errorLines.push(trimmed);
      }
      continue;
    }
    // "N errors" summary
    if (/^\d+\s+errors?$/.test(trimmed)) {
      errorLines.push(trimmed);
    }
  }

  return errorLines.join('\n') || text.substring(0, 500);
}

// General error fallback

/** Extract last non-empty lines from failed command output */
export function extractGeneralErrorText(text: string): string {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return 'Command exited with error';
  }
  return lines.slice(-8).join('\n');
}

// Task helpers

/** Check whether a task is a build/compile, Java, or Python related task. */
function isRelevantTask(task: vscode.Task): boolean {
  const type = task.definition.type.toLowerCase();
  const name = task.name.toLowerCase();

  const isBuild =
    type.includes('build') ||
    name.includes('build') ||
    name.includes('compile') ||
    type.includes('compile') ||
    name.includes('javac');

  const isJava =
    type === 'java' ||
    type.includes('java') ||
    name.includes('java') ||
    name.includes('.java');

  const isPython =
    type === 'python' ||
    type.includes('python') ||
    name.includes('python') ||
    name.includes('.py') ||
    name.includes('pytest');

  const isShellRun =
    (type === 'shell' || type === 'process') &&
    (name.includes('javac') ||
      name.includes('java') ||
      name.includes('python') ||
      name.includes('.py'));

  return isBuild || isJava || isPython || isShellRun;
}

/** Collect all Error-severity diagnostics into a single string. */
function collectDiagnosticErrors(): string {
  const messages: string[] = [];

  for (const [uri, diagnostics] of vscode.languages.getDiagnostics()) {
    for (const diag of diagnostics) {
      if (diag.severity === vscode.DiagnosticSeverity.Error) {
        messages.push(`[${path.basename(uri.fsPath)}] ${diag.message}`);
      }
    }
  }

  return messages.join('\n');
}

// Active terminal execution tracker

interface ActiveTerminalExecution {
  chunks: string[];
  readPromise: Promise<void>;
  commandLine?: string;
}

// Debug Adapter Tracker for Run/Debug sessions (e.g. Run Java, Debug Python, F5)

class MommyDebugTracker implements vscode.DebugAdapterTracker {
  private outputBuffer: string[] = [];
  private exceptionText = '';
  private exitCode: number | undefined;
  private hasReported = false;

  constructor(
    private readonly session: vscode.DebugSession,
    private readonly onDetectedError: ErrorCallback,
    private readonly log: (msg: string) => void,
  ) {}

  onDidSendMessage(message: any): void {
    if (!message || message.type !== 'event') {
      return;
    }

    if (message.event === 'output' && message.body) {
      const output = message.body.output;
      if (typeof output === 'string') {
        this.outputBuffer.push(output);
      }
    }

    if (message.event === 'stopped' && message.body?.reason === 'exception') {
      this.exceptionText =
        message.body.text || message.body.description || 'Exception occurred';
      this.log(`[Debug] Exception stopped in "${this.session.name}": ${this.exceptionText}`);
    }
  }

  onError(error: Error): void {
    this.log(`[Debug] Adapter error in "${this.session.name}": ${error.message}`);
    this.handleSessionEnd(1, error.message);
  }

  onExit(code?: number): void {
    this.exitCode = code;
    this.handleSessionEnd(code);
  }

  onWillStopSession(): void {
    this.handleSessionEnd();
  }

  public handleSessionEnd(code?: number, overrideError?: string): void {
    if (this.hasReported) {
      return;
    }

    const effectiveCode = code ?? this.exitCode;
    const fullOutput = stripAnsi(this.outputBuffer.join(''));
    const hasPython = containsPythonError(fullOutput);
    const hasJava = containsJavaError(fullOutput);
    const hasException = Boolean(this.exceptionText);
    const isErrorExit = effectiveCode !== undefined && effectiveCode !== 0;

    if (!hasPython && !hasJava && !hasException && !isErrorExit && !overrideError) {
      return;
    }

    this.hasReported = true;

    let errorText = '';
    if (hasPython) {
      errorText = extractPythonErrorText(fullOutput);
    } else if (hasJava) {
      errorText = extractJavaErrorText(fullOutput);
    } else if (hasException) {
      errorText = this.exceptionText;
      if (fullOutput) {
        errorText += '\n' + fullOutput.slice(0, 500);
      }
    } else if (overrideError) {
      errorText = overrideError;
    } else if (isErrorExit) {
      errorText = extractGeneralErrorText(fullOutput) || `Process exited with code ${effectiveCode}`;
    }

    if (errorText.trim()) {
      this.log(
        `[Debug] Detected error in session "${this.session.name}": ${errorText.slice(0, 80).replace(/\n/g, ' ')}`,
      );
      this.onDetectedError({
        source: 'debug',
        errorText: errorText.trim(),
        fileName:
          this.session.configuration.program ||
          this.session.configuration.mainClass,
      });
    }
  }
}

// ExecutionListener

/**
 * Listens to VS Code event sources and forwards detected errors
 * to the provided callback:
 *
 * 1. **Notebook cells** — `onDidChangeNotebookDocument`
 * 2. **Build / run tasks** — `onDidEndTaskProcess`
 * 3. **Terminal shell commands** — shell-integration API (VS Code ≥ 1.93)
 * 4. **Debug / run sessions** — `registerDebugAdapterTrackerFactory` (covers Run Java, Debug Python, F5)
 */
export class ExecutionListener implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  /** Tracks the last seen execution order per cell URI to avoid duplicates. */
  private lastSeenExecOrder = new Map<string, number>();

  /** Active terminal executions mapping each execution to its chunks and reading promise. */
  private activeTerminalExecutions = new Map<vscode.TerminalShellExecution, ActiveTerminalExecution>();

  /** Active debug trackers mapped by session ID. */
  private activeDebugTrackers = new Map<string, MommyDebugTracker>();

  constructor(
    private readonly onError: ErrorCallback,
    private readonly logger?: (msg: string) => void,
  ) {}

  private log(msg: string): void {
    if (this.logger) {
      this.logger(msg);
    } else {
      console.log(`[Mommy ASMR] ${msg}`);
    }
  }

  // Lifecycle

  /** Start listening on all event sources. */
  public activate(): void {
    this.listenToNotebooks();
    this.listenToTasks();
    this.listenToTerminal();
    this.listenToDebugSessions();
    this.log('ExecutionListener activated (notebooks, tasks, terminal, debug sessions).');
  }

  public dispose(): void {
    this.activeTerminalExecutions.clear();
    this.activeDebugTrackers.clear();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }

  // Notebook cells

  private listenToNotebooks(): void {
    this.disposables.push(
      vscode.workspace.onDidChangeNotebookDocument((e) => {
        for (const cellChange of e.cellChanges) {
          this.handleCellChange(cellChange.cell);
        }
      }),
    );
  }

  private handleCellChange(cell: vscode.NotebookCell): void {
    const summary = cell.executionSummary;
    if (!summary || summary.success !== false) {
      return;
    }

    const cellUri = cell.document.uri.toString();
    const execOrder = summary.executionOrder;

    // Skip if no execution order or if we already handled this one.
    if (execOrder == null || this.lastSeenExecOrder.get(cellUri) === execOrder) {
      return;
    }
    this.lastSeenExecOrder.set(cellUri, execOrder);

    let rawText = '';
    for (const output of cell.outputs) {
      for (const item of output.items) {
        try {
          rawText += new TextDecoder().decode(item.data) + '\n';
        } catch {
          // Ignore binary output items.
        }
      }
    }

    const errorText = cleanNotebookErrorText(rawText) || 'Unknown Notebook Error';
    this.log(`[Notebook] Detected error in cell: ${errorText.slice(0, 80).replace(/\n/g, ' ')}`);

    this.onError({
      source: 'notebook',
      errorText,
      fileName: cell.document.uri.fsPath,
    });
  }

  // Build / run tasks

  private listenToTasks(): void {
    this.disposables.push(
      vscode.tasks.onDidEndTaskProcess((e) => {
        if (e.exitCode === 0) {
          return;
        }
        if (!isRelevantTask(e.execution.task)) {
          return;
        }

        const errorText =
          collectDiagnosticErrors() ||
          `Task '${e.execution.task.name}' failed with exit code ${e.exitCode}`;

        this.log(`[Task] Task "${e.execution.task.name}" failed: ${errorText.slice(0, 80).replace(/\n/g, ' ')}`);

        this.onError({ source: 'task', errorText });
      }),
    );
  }

  // Terminal (shell integration)

  private listenToTerminal(): void {
    // Notify when terminal shell integration is established
    this.disposables.push(
      vscode.window.onDidChangeTerminalShellIntegration((e) => {
        this.log(`[Terminal] Shell integration active for terminal "${e.terminal.name}"`);
      }),
    );

    // Capture output when a command starts.
    this.disposables.push(
      vscode.window.onDidStartTerminalShellExecution((e) => {
        const active: ActiveTerminalExecution = {
          chunks: [],
          readPromise: Promise.resolve(),
          commandLine: e.execution.commandLine?.value,
        };

        this.log(`[Terminal] Started command: ${active.commandLine || '(unknown command)'}`);

        // Continuously buffer stream data as it arrives
        active.readPromise = (async () => {
          try {
            for await (const data of e.execution.read()) {
              active.chunks.push(data);
            }
          } catch (err) {
            // Stream may close or fail for some terminal configurations
          }
        })();

        this.activeTerminalExecutions.set(e.execution, active);
      }),
    );

    // Check for errors when the command ends.
    this.disposables.push(
      vscode.window.onDidEndTerminalShellExecution(async (e) => {
        const active = this.activeTerminalExecutions.get(e.execution);
        let rawOutput = '';

        if (active) {
          // Wait for stream to finish draining (capped at 600ms)
          await Promise.race([
            active.readPromise,
            new Promise((resolve) => setTimeout(resolve, 600)),
          ]);
          rawOutput = active.chunks.join('');
          this.activeTerminalExecutions.delete(e.execution);
        }

        const cmd = active?.commandLine || '';
        this.log(
          `[Terminal] Ended command "${cmd}" (exitCode: ${e.exitCode}, captured chars: ${rawOutput.length})`,
        );

        const cleanOutput = stripAnsi(rawOutput);
        const hasPython = containsPythonError(cleanOutput);
        const hasJava = containsJavaError(cleanOutput);

        // Only check commands that failed (non-zero exit code) or produced recognized errors
        if (e.exitCode === 0 && !hasPython && !hasJava) {
          return;
        }

        if (hasPython) {
          const errText = extractPythonErrorText(cleanOutput);
          this.log(`[Terminal] Detected Python error: ${errText.slice(0, 80).replace(/\n/g, ' ')}`);
          this.onError({
            source: 'terminal',
            errorText: errText,
          });
        } else if (hasJava) {
          const errText = extractJavaErrorText(cleanOutput);
          this.log(`[Terminal] Detected Java error: ${errText.slice(0, 80).replace(/\n/g, ' ')}`);
          this.onError({
            source: 'terminal',
            errorText: errText,
          });
        } else if (e.exitCode !== 0 && e.exitCode !== undefined) {
          const generalError = extractGeneralErrorText(cleanOutput);
          if (generalError) {
            this.log(`[Terminal] Detected general error: ${generalError.slice(0, 80).replace(/\n/g, ' ')}`);
            this.onError({
              source: 'terminal',
              errorText: generalError,
            });
          }
        }
      }),
    );
  }

  // Debug / run sessions (Run Java, Debug Python, F5, etc.)

  private listenToDebugSessions(): void {
    const trackerFactory: vscode.DebugAdapterTrackerFactory = {
      createDebugAdapterTracker: (session: vscode.DebugSession) => {
        this.log(`[Debug] Tracker attached to session "${session.name}" (type: ${session.type})`);
        const tracker = new MommyDebugTracker(
          session,
          this.onError,
          this.log.bind(this),
        );
        this.activeDebugTrackers.set(session.id, tracker);
        return tracker;
      },
    };

    this.disposables.push(
      vscode.debug.registerDebugAdapterTrackerFactory('*', trackerFactory),
      vscode.debug.onDidTerminateDebugSession((session) => {
        const tracker = this.activeDebugTrackers.get(session.id);
        if (tracker) {
          tracker.handleSessionEnd();
          this.activeDebugTrackers.delete(session.id);
        }
      }),
    );
  }
}
