/**
 * positron.ts
 * ───────────
 * Positron-specific integration.
 *
 * Positron exposes its own API through a separate extension (`positron`).
 * We access it via `vscode.extensions.getExtension` so the extension still
 * loads normally in plain VS Code where the Positron API does not exist.
 */

import * as vscode from "vscode";

// ─── Types (subset of the Positron API we actually use) ───────────────────────

interface PositronApi {
  version: string;
  runtime: {
    /** Execute code in the active R console */
    executeCode(
      languageId: string,
      code: string,
      focus: boolean,
      allowIncomplete?: boolean
    ): Promise<void>;
    /** Get the currently active R runtime, if any */
    getActiveRuntime(languageId: string): Promise<{ runtimeId: string } | undefined>;
  };
}

// ─── Runtime detection ────────────────────────────────────────────────────────

/**
 * Returns the Positron API if the extension is running inside Positron,
 * or `undefined` if it is running in plain VS Code.
 */
export function getPositronApi(): PositronApi | undefined {
  const ext = vscode.extensions.getExtension<PositronApi>("positron.positron");
  return ext?.exports;
}

export function isPositron(): boolean {
  return getPositronApi() !== undefined;
}

// ─── Console integration ──────────────────────────────────────────────────────

/**
 * Run a snippet of R code in the active Positron R console.
 * Falls back to a plain information message in VS Code.
 *
 * @param code - R code to execute
 * @param focus - Whether to focus the console after execution
 */
export async function runInConsole(code: string, focus = false): Promise<void> {
  const positron = getPositronApi();
  if (positron) {
    await positron.runtime.executeCode("r", code, focus);
  } else {
    // Plain VS Code — just show what would have run
    vscode.window.showInformationMessage(`[R] ${code.slice(0, 80)}`);
  }
}

// ─── Status bar ───────────────────────────────────────────────────────────────

let _statusBar: vscode.StatusBarItem | undefined;

/**
 * Show a temporary message in the status bar.
 * Uses a Positron-aware prefix so users know which tool produced it.
 */
export function showStatus(message: string, timeoutMs = 3000): void {
  if (!_statusBar) {
    _statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  }
  _statusBar.text = `$(symbol-misc) R Refactor: ${message}`;
  _statusBar.show();
  setTimeout(() => _statusBar?.hide(), timeoutMs);
}

export function disposeStatus(): void {
  _statusBar?.dispose();
}
