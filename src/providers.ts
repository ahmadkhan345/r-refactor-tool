import * as vscode from "vscode";
import { getParseResult } from "./documentCache";
import { findNodeAtOffset, listFunctions } from "./refactors";

export class RDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
    if (document.languageId !== "r") return [];

    const result = getParseResult(document);
    return listFunctions(result).map((fn) => {
      const range = new vscode.Range(
        fn.startLine - 1,
        0,
        fn.endLine - 1,
        Number.MAX_SAFE_INTEGER
      );
      return new vscode.DocumentSymbol(
        fn.name,
        `(${fn.params.join(", ")})`,
        vscode.SymbolKind.Function,
        range,
        range
      );
    });
  }
}

export class RCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.Refactor];

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range
  ): vscode.CodeAction[] {
    if (document.languageId !== "r") return [];

    const result = getParseResult(document);
    const node = findNodeAtOffset(result.tree.rootNode, document.offsetAt(range.start));
    const actions: vscode.CodeAction[] = [];

    if (node.type === "identifier") {
      const rename = new vscode.CodeAction(
        `Rename "${node.text}"…`,
        vscode.CodeActionKind.Refactor
      );
      rename.command = {
        command: "rRefactor.renameVariable",
        title: "Rename Variable",
        arguments: [node.text],
      };
      actions.push(rename);
    }

    if (!range.isEmpty) {
      actions.push(
        commandAction(
          "Extract selection into function…",
          "rRefactor.extractFunction",
          range
        ),
        commandAction(
          "Convert observers to configuration-driven registration…",
          "rRefactor.configurationDrivenObservers",
          range
        ),
        commandAction(
          "Convert table outputs to table-driven generation…",
          "rRefactor.tableDrivenCodeGeneration",
          range
        )
      );
    }

    return actions;
  }
}

function commandAction(
  title: string,
  command: string,
  range: vscode.Range
): vscode.CodeAction {
  const action = new vscode.CodeAction(title, vscode.CodeActionKind.Refactor);
  action.command = { command, title, arguments: [range] };
  return action;
}
