import Parser from "tree-sitter";
import { getParser, getLanguage } from "./parser";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A parsed R document with incremental-update support.
 */
export interface ParseResult {
  tree: Parser.Tree;
  source: string;
  /**
   * Efficiently re-parse after a single text change.
   * Mutates the old tree in-place (tree-sitter requirement) then returns a
   * fresh ParseResult backed by the new tree.
   */
  update(newSource: string, edit: SourceEdit): ParseResult;
}

/**
 * A single text change expressed as byte offsets + row/column positions.
 * Matches the shape tree-sitter's `Tree.edit()` expects.
 */
export interface SourceEdit {
  startIndex: number;
  oldEndIndex: number;
  newEndIndex: number;
  startPosition: Parser.Point;
  oldEndPosition: Parser.Point;
  newEndPosition: Parser.Point;
}

export interface NodeMatch {
  /** Capture name from the query pattern (without the leading "@"). */
  captureName: string;
  node: Parser.SyntaxNode;
}

// ─── Parse ────────────────────────────────────────────────────────────────────

/**
 * Parse R source text.  Pass `oldTree` for incremental re-parsing (fast path).
 */
export function parseR(source: string, oldTree?: Parser.Tree): ParseResult {
  const tree = getParser().parse(source, oldTree);

  return {
    tree,
    source,
    update(newSource: string, edit: SourceEdit): ParseResult {
      // tree-sitter requires editing the old tree before re-parsing
      tree.edit(edit);
      return parseR(newSource, tree);
    },
  };
}

// ─── Query ────────────────────────────────────────────────────────────────────


export function queryR(result: ParseResult, queryString: string): NodeMatch[] {
const captureMatch = queryString.match(/\((\w+)\)[^@]*@(\w+)/);
  if (!captureMatch) return [];

  const [, nodeType, captureName] = captureMatch;
  const found: NodeMatch[] = [];

  walkTree(result.tree.rootNode, (node) => {
    if (node.type === nodeType) {
      found.push({ captureName, node });
    }
  });

  return found;
}

// ─── Walk ─────────────────────────────────────────────────────────────────────


export function walkTree(
  node: Parser.SyntaxNode,
  callback: (node: Parser.SyntaxNode, depth: number) => boolean | void,
  depth = 0
): void {
  if (callback(node, depth) === false) return;
  for (const child of node.children) {
    walkTree(child, callback, depth + 1);
  }
}


export function findAllOfType(
  root: Parser.SyntaxNode,
  type: string
): Parser.SyntaxNode[] {
  const found: Parser.SyntaxNode[] = [];
  walkTree(root, (n) => {
    if (n.type === type) found.push(n);
  });
  return found;
}

// ─── Debug ────────────────────────────────────────────────────────────────────


export function printTree(node: Parser.SyntaxNode, depth = 0): string {
  const indent = "  ".repeat(depth);
  const { startPosition: s, endPosition: e } = node;
  const loc = `[${s.row}:${s.column} → ${e.row}:${e.column}]`;
  const preview =
    node.childCount === 0
      ? ` "${node.text.replace(/\n/g, "\\n").slice(0, 50)}"`
      : "";
  let out = `${indent}${node.type} ${loc}${preview}\n`;
  for (const child of node.children) {
    out += printTree(child, depth + 1);
  }
  return out;
}

// ─── Edit helpers ─────────────────────────────────────────────────────────────


export function applyEdits(
  source: string,
  edits: Array<{ startIndex: number; endIndex: number; newText: string }>
): string {
  const sorted = [...edits].sort((a, b) => b.startIndex - a.startIndex);
  let result = source;
  for (const { startIndex, endIndex, newText } of sorted) {
    result = result.slice(0, startIndex) + newText + result.slice(endIndex);
  }
  return result;
}


export function makeEdit(
  oldSource: string,
  startIndex: number,
  oldEndIndex: number,
  newText: string
): SourceEdit {
  const newEndIndex = startIndex + Buffer.byteLength(newText, "utf8");

  function toPoint(src: string, idx: number): Parser.Point {
    const before = src.slice(0, idx);
    const lines = before.split("\n");
    return { row: lines.length - 1, column: lines[lines.length - 1].length };
  }

  return {
    startIndex,
    oldEndIndex,
    newEndIndex,
    startPosition: toPoint(oldSource, startIndex),
    oldEndPosition: toPoint(oldSource, oldEndIndex),
    newEndPosition: toPoint(
      oldSource.slice(0, startIndex) + newText,
      newEndIndex
    ),
  };
}
