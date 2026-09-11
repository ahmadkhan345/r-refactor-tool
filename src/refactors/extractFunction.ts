import { ParseResult, applyEdits, walkTree } from "../ast";
import { ExtractionInfo } from "./types";
import {
  assignedInRange,
  buildScopeTree,
  definingScope,
  enclosingFunction,
  enclosingFunctionAssignment,
  identifiersAfterRange,
  identifiersInRange,
  scopeAtOffset,
} from "./helpers";

export function analyseExtraction(
  source: string,
  result: ParseResult,
  startIndex: number,
  endIndex: number
): ExtractionInfo {
  const root = result.tree.rootNode;
  const scopeRoot = buildScopeTree(root);
  const selectedText = source.slice(startIndex, endIndex).trim();
  const assignedInside = assignedInRange(root, startIndex, endIndex);
  const usedInside = new Set(
    identifiersInRange(root, startIndex, endIndex).map((node) => node.text)
  );
  const enclosingFnNode = enclosingFunction(root, startIndex);
  const enclosingScope = scopeAtOffset(scopeRoot, startIndex);

  const params: string[] = [];
  for (const name of usedInside) {
    if (!assignedInside.has(name) && definingScope(name, enclosingScope) !== null) {
      params.push(name);
    }
  }

  const afterNames = new Set(
    identifiersAfterRange(root, endIndex).map((node) => node.text)
  );
  const assignments: Array<{ name: string; index: number }> = [];

  walkTree(root, (node) => {
    if (node.endIndex < startIndex) return;
    if (node.startIndex > endIndex) return false;
    if (node.type !== "binary_operator") return;

    const op = node.children.find((child) => child.text === "<-" || child.text === "=");
    const isSuperAssignment = node.children.some((child) => child.text === "<<-");
    const lhs = node.namedChildren[0];
    if (
      op &&
      !isSuperAssignment &&
      lhs?.type === "identifier" &&
      node.startIndex >= startIndex &&
      node.endIndex <= endIndex
    ) {
      assignments.push({ name: lhs.text, index: node.startIndex });
    }
  });

  const usedAfter = assignments.filter((item) => afterNames.has(item.name));
  const returnCandidates = usedAfter.length ? usedAfter : assignments;
  returnCandidates.sort((a, b) => b.index - a.index);

  return {
    params,
    returnValue: returnCandidates[0]?.name ?? null,
    selectedText,
    startIndex,
    endIndex,
    enclosingFnNode,
  };
}

export function extractFunction(
  source: string,
  result: ParseResult,
  info: ExtractionInfo,
  functionName: string
): string {
  const { params, returnValue, selectedText, startIndex, endIndex, enclosingFnNode } = info;
  const parameterList = params.join(", ");
  const indentedBody = selectedText
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
  const body = returnValue
    ? `${indentedBody}\n  return(${returnValue})`
    : indentedBody;
  const newFunction = `${functionName} <- function(${parameterList}) {\n${body}\n}\n\n`;
  const callSite = returnValue
    ? `${returnValue} <- ${functionName}(${parameterList})`
    : `${functionName}(${parameterList})`;

  let insertionIndex = startIndex;
  if (enclosingFnNode) {
    insertionIndex =
      enclosingFunctionAssignment(result.tree.rootNode, enclosingFnNode)?.startIndex ?? 0;
  }
  while (insertionIndex > 0 && source[insertionIndex - 1] !== "\n") insertionIndex--;

  return applyEdits(source, [
    { startIndex, endIndex, newText: callSite },
    { startIndex: insertionIndex, endIndex: insertionIndex, newText: newFunction },
  ]);
}
