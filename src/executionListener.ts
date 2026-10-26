import * as vscode from 'vscode';
import * as path from 'path';
import { ErrorEvent, ErrorCallback } from './types';
import { MAX_JAVA_STACK_LINES } from './constants';

// ANSI stripping

/** Remove all ANSI escape sequences (colors, cursor moves, etc.). */
export function stripAnsi(text: string): string {
  return text
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
 * Patterns that indicate the terminal output contains a Python error or traceback.
 */
const PYTHON_ERROR_PATTERNS: readonly RegExp[] = [
  /Traceback \(most recent call last\):/i,
  /File\s+["'][^"']+["'],\s+line\s+\d+/i,
  /^\s*(?:SyntaxError|IndentationError|TabError|NameError|TypeError|ValueError|AttributeError|IndexError|KeyError|ImportError|ModuleNotFoundError|ZeroDivisionError|FileNotFoundError|PermissionError|RuntimeError|RecursionError|UnboundLocalError|AssertionError|NotImplementedError|Exception):\s/m,
];

/** Returns `true` if the text looks like it contains a Python error. */
function containsPythonError(text: string): boolean {
  return PYTHON_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Extract only the relevant error lines from Python terminal output.
 * Captures the traceback header, file locations, code snippets, pointers, and exception message.
 */
function extractPythonErrorText(text: string): string {
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

    if (inTraceback) {
      errorLines.push(trimmed);
      // Exception line marks the end of a traceback
      if (/^[A-Za-z]+(?:Error|Exception):\s*/.test(trimmed)) {
        inTraceback = false;
      }
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
 * Patterns that indicate the terminal output contains a Java error.
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
function containsJavaError(text: string): boolean {
  return JAVA_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Extract only the relevant error lines from Java compiler / runtime output,
 * filtering out noise and limiting stack-trace depth.
 */
function extractJavaErrorText(text: string): string {
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
function extractGeneralErrorText(text: string): string {
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

// ExecutionListener

/**
 * Listens to three VS Code event sources and forwards detected errors
 * to the provided callback:
 *
 * 1. **Notebook cells** — `onDidChangeNotebookDocument`
 * 2. **Build / run tasks** — `onDidEndTaskProcess`
 * 3. **Terminal shell commands** — shell-integration API (VS Code ≥ 1.93)
 */
export class ExecutionListener implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  /** Tracks the last seen execution order per cell URI to avoid duplicates. */
  private lastSeenExecOrder = new Map<string, number>();

  /** Accumulates terminal output per shell execution. */
  private executionOutputs = new Map<vscode.TerminalShellExecution, string>();

  constructor(private readonly onError: ErrorCallback) {}

  // Lifecycle

  /** Start listening on all three event sources. */
  public activate(): void {
    this.listenToNotebooks();
    this.listenToTasks();
    this.listenToTerminal();
  }

  public dispose(): void {
    this.executionOutputs.clear();
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

    this.onError({
      source: 'notebook',
      errorText: cleanNotebookErrorText(rawText) || 'Unknown Notebook Error',
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

        this.onError({ source: 'task', errorText });
      }),
    );
  }

  // Terminal (shell integration)

  private listenToTerminal(): void {
    // Capture output when a command starts.
    this.disposables.push(
      vscode.window.onDidStartTerminalShellExecution(async (e) => {
        let output = '';
        try {
          for await (const data of e.execution.read()) {
            output += data;
          }
        } catch {
          // Stream may fail for some terminal types.
        }
        this.executionOutputs.set(e.execution, output);
      }),
    );

    // Check for errors when the command ends.
    this.disposables.push(
      vscode.window.onDidEndTerminalShellExecution((e) => {
        const rawOutput = this.executionOutputs.get(e.execution) || '';
        this.executionOutputs.delete(e.execution);

        const hasPython = containsPythonError(rawOutput);
        const hasJava = containsJavaError(rawOutput);

        // Only check commands that failed (non-zero exit code) or produced recognized errors
        if (e.exitCode === 0 && !hasPython && !hasJava) {
          return;
        }

        const cleanOutput = stripAnsi(rawOutput);

        if (containsPythonError(cleanOutput)) {
          this.onError({
            source: 'terminal',
            errorText: extractPythonErrorText(cleanOutput),
          });
        } else if (containsJavaError(cleanOutput)) {
          this.onError({
            source: 'terminal',
            errorText: extractJavaErrorText(cleanOutput),
          });
        } else if (e.exitCode !== 0) {
          const generalError = extractGeneralErrorText(cleanOutput);
          if (generalError) {
            this.onError({
              source: 'terminal',
              errorText: generalError,
            });
          }
        }
      }),
    );
  }
}
