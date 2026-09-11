import { assertRIdentifier, indentBlock, lineIndent } from "./helpers";
import { NamedMapping } from "./types";

const OBSERVER_PATTERN = /observeEvent\s*\(\s*input(?:\$([A-Za-z.][A-Za-z0-9._]*)|\[\[\s*["']([^"']+)["']\s*\]\])\s*,\s*\{\s*([A-Za-z.][A-Za-z0-9._]*)\s*\(\s*input(?:\$\1|\[\[\s*["'](?:\1|\2)["']\s*\]\])\s*\)\s*\}\s*\)/gs;

export function findObserverMappings(selection: string): NamedMapping[] {
  const mappings: NamedMapping[] = [];
  for (const match of selection.matchAll(OBSERVER_PATTERN)) {
    const sourceName = match[1] ?? match[2];
    const targetName = match[3];
    if (sourceName && targetName) mappings.push({ sourceName, targetName });
  }
  return mappings;
}

export function configurationDrivenObserverRegistration(
  source: string,
  startIndex: number,
  endIndex: number,
  mapName = "filter_sync_map"
): string {
  assertRIdentifier(mapName, "Configuration list name");
  const selected = source.slice(startIndex, endIndex);
  const mappings = findObserverMappings(selected);
  if (mappings.length < 2) {
    throw new Error(
      "Select at least two matching observeEvent blocks of the form observeEvent(input$name, { setter(input$name) })."
    );
  }

  // Normalize the replacement boundary to the beginning of the selected
  // line, then obtain its indentation from the first non-whitespace token.
  const replacementStart = source.lastIndexOf("\n", startIndex - 1) + 1;
  const leadingWhitespace =
    source.slice(replacementStart).match(/^[\t ]*/)?.[0].length ?? 0;
  const indent = lineIndent(source, replacementStart + leadingWhitespace);
  const entries = mappings
    .map(({ sourceName, targetName }) => `  ${sourceName} = ${targetName}`)
    .join(",\n");
  const replacement = `${mapName} <- list(\n${entries}\n)\n\nfor (input_name in names(${mapName})) {\n  local({\n    nm <- input_name\n    setter <- ${mapName}[[nm]]\n    observeEvent(input[[nm]], {\n      setter(input[[nm]])\n    })\n  })\n}`;

  return source.slice(0, replacementStart) + indentBlock(replacement, indent) + source.slice(endIndex);
}
