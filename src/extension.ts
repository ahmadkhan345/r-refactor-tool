/** Entry point for the R Refactor extension. */
import * as vscode from "vscode";
import { getParseResult, registerCacheListeners } from "./documentCache";
import { RCodeActionProvider, RDocumentSymbolProvider } from "./providers";
import {
  analyseExtraction,
  configurationDrivenObserverRegistration,
  extractFunction,
  renameVariable,
  tableDrivenCodeGeneration,
} from "./refactors";

function activeREditor(): vscode.TextEditor | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "r") {
    void vscode.window.showWarningMessage("Open an R file first.");
    return undefined;
  }
  return editor;
}

async function applyNewSource(
  document: vscode.TextDocument,
  newSource: string
): Promise<void> {
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(document.getText().length)
  );
  edit.replace(document.uri, fullRange, newSource);
  await vscode.workspace.applyEdit(edit);
}

function selectedOffsets(
  editor: vscode.TextEditor,
  suppliedRange?: vscode.Range
): { range: vscode.Range; startIndex: number; endIndex: number } | undefined {
  const range = suppliedRange ?? editor.selection;
  if (range.isEmpty) {
    void vscode.window.showWarningMessage("Select the repeated code blocks first.");
    return undefined;
  }
  return {
    range,
    startIndex: editor.document.offsetAt(range.start),
    endIndex: editor.document.offsetAt(range.end),
  };
}

async function runSelectionRefactoring(
  selectionRange: vscode.Range | undefined,
  mapPrompt: string,
  defaultMapName: string,
  transform: (
    source: string,
    startIndex: number,
    endIndex: number,
    mapName: string
  ) => string,
  successMessage: string
): Promise<void> {
  const editor = activeREditor();
  if (!editor) return;

  const selected = selectedOffsets(editor, selectionRange);
  if (!selected) return;

  const mapName = await vscode.window.showInputBox({
    prompt: mapPrompt,
    value: defaultMapName,
  });
  if (!mapName) return;

  try {
    const source = editor.document.getText();
    const newSource = transform(
      source,
      selected.startIndex,
      selected.endIndex,
      mapName
    );
    await applyNewSource(editor.document, newSource);
    void vscode.window.showInformationMessage(successMessage);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(message);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  registerCacheListeners(context);

  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      { language: "r" },
      new RDocumentSymbolProvider()
    ),
    vscode.languages.registerCodeActionsProvider(
      { language: "r" },
      new RCodeActionProvider(),
      { providedCodeActionKinds: RCodeActionProvider.providedCodeActionKinds }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "rRefactor.renameVariable",
      async (prefill?: string) => {
        const editor = activeREditor();
        if (!editor) return;
        const document = editor.document;
        const cursorPosition = editor.selection.active;
        const cursorOffset = document.offsetAt(cursorPosition);
        const result = getParseResult(document);

        const wordRange = document.getWordRangeAtPosition(
          cursorPosition,
          /[a-zA-Z_.][a-zA-Z0-9_.]*/
        );
        const oldName = await vscode.window.showInputBox({
          prompt: "Variable to rename",
          value: prefill ?? (wordRange ? document.getText(wordRange) : ""),
        });
        if (!oldName) return;

        const newName = await vscode.window.showInputBox({
          prompt: `Rename "${oldName}" to`,
        });
        if (!newName) return;

        const newSource = renameVariable(
          document.getText(),
          result,
          oldName,
          newName,
          cursorOffset
        );
        await applyNewSource(document, newSource);
        void vscode.window.showInformationMessage(
          `Renamed "${oldName}" to "${newName}" in the current file.`
        );
      }
    ),

    vscode.commands.registerCommand(
      "rRefactor.extractFunction",
      async (selectionRange?: vscode.Range) => {
        const editor = activeREditor();
        if (!editor) return;
        const selected = selectedOffsets(editor, selectionRange);
        if (!selected) return;

        const document = editor.document;
        const source = document.getText();
        const result = getParseResult(document);
        const info = analyseExtraction(
          source,
          result,
          selected.startIndex,
          selected.endIndex
        );

        const functionName = await vscode.window.showInputBox({
          prompt: "New function name",
          placeHolder: "e.g. compute_total",
        });
        if (!functionName) return;

        const parameters = await vscode.window.showInputBox({
          prompt: "Parameters (auto-detected; edit if needed)",
          value: info.params.join(", "),
        });
        if (parameters === undefined) return;

        const finalInfo = {
          ...info,
          params: parameters
            ? parameters.split(",").map((parameter) => parameter.trim()).filter(Boolean)
            : [],
        };
        const newSource = extractFunction(source, result, finalInfo, functionName);
        await applyNewSource(document, newSource);
        void vscode.window.showInformationMessage(
          `Extracted selection into "${functionName}".`
        );
      }
    ),

    vscode.commands.registerCommand(
      "rRefactor.configurationDrivenObservers",
      async (selectionRange?: vscode.Range) =>
        runSelectionRefactoring(
          selectionRange,
          "Name of the input-to-setter configuration list",
          "filter_sync_map",
          configurationDrivenObserverRegistration,
          "Converted repeated observers to configuration-driven registration."
        )
    ),

    vscode.commands.registerCommand(
      "rRefactor.tableDrivenCodeGeneration",
      async (selectionRange?: vscode.Range) =>
        runSelectionRefactoring(
          selectionRange,
          "Name of the output-to-reactive configuration list",
          "table_render_map",
          tableDrivenCodeGeneration,
          "Converted repeated table outputs to table-driven generation."
        )
    )
  );
}

export function deactivate(): void {}
