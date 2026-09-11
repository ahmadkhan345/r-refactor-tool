import Parser from "tree-sitter";

export interface FunctionInfo {
  name: string;
  /** 1-based line numbers. */
  startLine: number;
  endLine: number;
  params: string[];
}

export interface RefactorEdit {
  startIndex: number;
  endIndex: number;
  newText: string;
}

export interface Scope {
  node: Parser.SyntaxNode;
  locals: Set<string>;
  parent: Scope | null;
  children: Scope[];
}

export interface ExtractionInfo {
  params: string[];
  returnValue: string | null;
  selectedText: string;
  startIndex: number;
  endIndex: number;
  enclosingFnNode: Parser.SyntaxNode | null;
}

export interface NamedMapping {
  sourceName: string;
  targetName: string;
}
