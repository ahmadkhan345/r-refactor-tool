import Parser from "tree-sitter";
import { ParseResult, walkTree } from "../ast";
import { FunctionInfo, Scope } from "./types";

export function parameterNames(paramsNode: Parser.SyntaxNode | undefined): string[] {
  if (!paramsNode) return [];
  const names: string[] = [];
  walkTree(paramsNode, (node) => {
    if (node.type === "identifier") names.push(node.text);
  });
  return names;
}

export function isLocalAssignment(node: Parser.SyntaxNode): boolean {
  if (node.type !== "binary_operator") return false;
  const op = node.children.find(
    (child) => child.type === "<-" || child.text === "<-" || child.text === "="
  );
  const isSuperAssignment = node.children.some(
    (child) => child.text === "<<-" || child.text.trim() === "<<-"
  );
  return Boolean(op) && !isSuperAssignment;
}

export function buildScopeTree(root: Parser.SyntaxNode): Scope {
  const globalScope: Scope = {
    node: root,
    locals: new Set<string>(),
    parent: null,
    children: [],
  };

  function visit(node: Parser.SyntaxNode, scope: Scope): void {
    if (node.type === "function_definition") {
      const functionScope: Scope = {
        node,
        locals: new Set<string>(),
        parent: scope,
        children: [],
      };
      scope.children.push(functionScope);

      const params = node.namedChildren.find((child) => child.type === "parameters");
      for (const name of parameterNames(params)) functionScope.locals.add(name);

      for (const child of node.children) visit(child, functionScope);
      return;
    }

    if (isLocalAssignment(node)) {
      const lhs = node.namedChildren[0];
      if (lhs?.type === "identifier") scope.locals.add(lhs.text);
    }

    for (const child of node.children) visit(child, scope);
  }

  visit(root, globalScope);
  return globalScope;
}

export function scopeAtOffset(root: Scope, offset: number): Scope {
  function search(scope: Scope): Scope {
    for (const child of scope.children) {
      if (child.node.startIndex <= offset && child.node.endIndex >= offset) {
        return search(child);
      }
    }
    return scope;
  }
  return search(root);
}

export function definingScope(name: string, scope: Scope): Scope | null {
  if (scope.locals.has(name)) return scope;
  return scope.parent ? definingScope(name, scope.parent) : null;
}

export function isShadowedByInnerScope(name: string, scope: Scope): boolean {
  let current: Scope | null = scope;
  while (current && current.parent !== null) {
    if (current.locals.has(name)) return true;
    current = current.parent;
  }
  return false;
}

export function resolvesToScope(
  identifierNode: Parser.SyntaxNode,
  name: string,
  targetScope: Scope,
  scopeRoot: Scope
): boolean {
  const innermostScope = scopeAtOffset(scopeRoot, identifierNode.startIndex);
  const resolvedScope = definingScope(name, innermostScope);

  if (targetScope.parent === null) {
    return resolvedScope === null
      ? !isShadowedByInnerScope(name, innermostScope)
      : resolvedScope === targetScope;
  }
  return resolvedScope === targetScope;
}

export function identifiersInRange(
  root: Parser.SyntaxNode,
  startIndex: number,
  endIndex: number
): Parser.SyntaxNode[] {
  const found: Parser.SyntaxNode[] = [];
  walkTree(root, (node) => {
    if (node.startIndex > endIndex) return false;
    if (
      node.type === "identifier" &&
      node.startIndex >= startIndex &&
      node.endIndex <= endIndex
    ) {
      found.push(node);
    }
  });
  return found;
}

export function identifiersAfterRange(
  root: Parser.SyntaxNode,
  endIndex: number
): Parser.SyntaxNode[] {
  const found: Parser.SyntaxNode[] = [];
  walkTree(root, (node) => {
    if (node.type === "identifier" && node.startIndex > endIndex) found.push(node);
  });
  return found;
}

export function assignedInRange(
  root: Parser.SyntaxNode,
  startIndex: number,
  endIndex: number
): Set<string> {
  const assigned = new Set<string>();
  walkTree(root, (node) => {
    if (node.startIndex > endIndex) return false;
    if (node.type !== "binary_operator") return;
    const op = node.children.find((child) => child.text === "<-" || child.text === "=");
    const isSuperAssignment = node.children.some((child) => child.text === "<<-");
    if (!op || isSuperAssignment) return;

    const lhs = node.namedChildren[0];
    if (
      lhs?.type === "identifier" &&
      node.startIndex >= startIndex &&
      node.endIndex <= endIndex
    ) {
      assigned.add(lhs.text);
    }
  });
  return assigned;
}

export function enclosingFunction(
  root: Parser.SyntaxNode,
  offset: number
): Parser.SyntaxNode | null {
  let result: Parser.SyntaxNode | null = null;
  walkTree(root, (node) => {
    if (
      node.type === "function_definition" &&
      node.startIndex <= offset &&
      node.endIndex >= offset &&
      (result === null ||
        node.endIndex - node.startIndex < result.endIndex - result.startIndex)
    ) {
      result = node;
    }
  });
  return result;
}

export function enclosingFunctionAssignment(
  root: Parser.SyntaxNode,
  functionNode: Parser.SyntaxNode
): Parser.SyntaxNode | null {
  let result: Parser.SyntaxNode | null = null;
  walkTree(root, (node) => {
    if (node.type === "binary_operator" && node.namedChildren[1] === functionNode) {
      result = node;
      return false;
    }
  });
  return result;
}

export function lineIndent(source: string, index: number): string {
  const lineStart = source.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
  return source.slice(lineStart, index).match(/^\s*/)?.[0] ?? "";
}

export function indentBlock(text: string, indent: string): string {
  return text
    .split("\n")
    .map((line) => (line.length ? indent + line : line))
    .join("\n");
}

export function assertRIdentifier(name: string, label: string): void {
  if (!/^[A-Za-z.][A-Za-z0-9._]*$/.test(name) || /^\.[0-9]/.test(name)) {
    throw new Error(`${label} must be a valid R identifier.`);
  }
}

export function listFunctions(result: ParseResult): FunctionInfo[] {
  const infos: FunctionInfo[] = [];
  walkTree(result.tree.rootNode, (node) => {
    if (node.type !== "binary_operator") return;
    const op = node.children.find((child) => child.text === "<-" || child.text === "=");
    if (!op) return;

    const lhs = node.namedChildren[0];
    const rhs = node.namedChildren[1];
    if (lhs?.type !== "identifier" || rhs?.type !== "function_definition") return;

    const paramsNode = rhs.namedChildren.find((child) => child.type === "parameters");
    infos.push({
      name: lhs.text,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      params: parameterNames(paramsNode),
    });
    return false;
  });
  return infos;
}

export function findNodeAtOffset(
  root: Parser.SyntaxNode,
  offset: number
): Parser.SyntaxNode {
  let best = root;
  walkTree(root, (node) => {
    if (
      node.startIndex <= offset &&
      node.endIndex >= offset &&
      node.endIndex - node.startIndex < best.endIndex - best.startIndex
    ) {
      best = node;
    }
  });
  return best;
}
