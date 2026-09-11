import Parser from "tree-sitter";
import { ParseResult, applyEdits, walkTree } from "../ast";
import {
  buildScopeTree,
  definingScope,
  resolvesToScope,
  scopeAtOffset,
} from "./helpers";

export function renameVariable(
  source: string,
  result: ParseResult,
  oldName: string,
  newName: string,
  cursorOffset: number
): string {
  const scopeRoot = buildScopeTree(result.tree.rootNode);
  const cursorScope = scopeAtOffset(scopeRoot, cursorOffset);
  const targetScope = definingScope(oldName, cursorScope) ?? scopeRoot;

  const identifiers: Parser.SyntaxNode[] = [];
  walkTree(result.tree.rootNode, (node) => {
    if (node.type === "identifier" && node.text === oldName) identifiers.push(node);
  });

  const edits = identifiers
    .filter((node) => resolvesToScope(node, oldName, targetScope, scopeRoot))
    .map((node) => ({
      startIndex: node.startIndex,
      endIndex: node.endIndex,
      newText: newName,
    }));

  return applyEdits(source, edits);
}

export function findReferencesInScope(
  result: ParseResult,
  name: string,
  cursorOffset: number
): Parser.SyntaxNode[] {
  const scopeRoot = buildScopeTree(result.tree.rootNode);
  const cursorScope = scopeAtOffset(scopeRoot, cursorOffset);
  const targetScope = definingScope(name, cursorScope) ?? scopeRoot;
  const identifiers: Parser.SyntaxNode[] = [];

  walkTree(result.tree.rootNode, (node) => {
    if (node.type === "identifier" && node.text === name) identifiers.push(node);
  });

  return identifiers.filter((node) =>
    resolvesToScope(node, name, targetScope, scopeRoot)
  );
}
