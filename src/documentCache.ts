
import * as vscode from "vscode";
import { parseR, makeEdit, ParseResult } from "./ast";

const cache = new Map<string, ParseResult>();

function key(doc: vscode.TextDocument): string {
  return doc.uri.toString();
}

export function getParseResult(doc: vscode.TextDocument): ParseResult {
  const k = key(doc);
  const cached = cache.get(k);
  // If source matches what we have, return immediately
  if (cached && cached.source === doc.getText()) return cached;
  // Cold parse (first open, or cache miss)
  const result = parseR(doc.getText());
  cache.set(k, result);
  return result;
}

/** Wire up VS Code events.  Call once from `activate()`. */
export function registerCacheListeners(
  context: vscode.ExtensionContext
): void {
  // Incremental re-parse on every keystroke
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const doc = event.document;
      if (doc.languageId !== "r") return;

      const k = key(doc);
      let result = cache.get(k) ?? parseR(doc.getText());
      const oldSource = result.source;
      const newSource = doc.getText();

      for (const change of event.contentChanges) {
        const edit = makeEdit(
          oldSource,
          change.rangeOffset,
          change.rangeOffset + change.rangeLength,
          change.text
        );
        result = result.update(newSource, edit);
      }

      cache.set(k, result);
    })
  );

  // Free memory when a document is closed
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) => {
      cache.delete(key(doc));
    })
  );
}
