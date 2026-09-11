import { assertRIdentifier, indentBlock, lineIndent } from "./helpers";
import { NamedMapping } from "./types";

interface TableMapping extends NamedMapping {
  renderer: string;
}

const TABLE_PATTERN = /output(?:\$([A-Za-z.][A-Za-z0-9._]*)|\[\[\s*["']([^"']+)["']\s*\]\])\s*<-\s*((?:[A-Za-z.][A-Za-z0-9._]*::)?render(?:Data)?Table)\s*\(\s*\{\s*([A-Za-z.][A-Za-z0-9._]*)\s*\(\s*\)\s*\}\s*\)/gs;

export function findTableRenderMappings(selection: string): TableMapping[] {
  const mappings: TableMapping[] = [];
  for (const match of selection.matchAll(TABLE_PATTERN)) {
    const sourceName = match[1] ?? match[2];
    if (sourceName) {
      mappings.push({ sourceName, renderer: match[3], targetName: match[4] });
    }
  }
  return mappings;
}

export function tableDrivenCodeGeneration(
  source: string,
  startIndex: number,
  endIndex: number,
  mapName = "table_render_map"
): string {
  assertRIdentifier(mapName, "Configuration list name");
  const selected = source.slice(startIndex, endIndex);
  const mappings = findTableRenderMappings(selected);
  if (mappings.length < 2) {
    throw new Error(
      "Select at least two matching output render blocks, for example output$orders <- renderTable({ filtered_orders() })."
    );
  }

  const renderer = mappings[0].renderer;
  if (mappings.some((mapping) => mapping.renderer !== renderer)) {
    throw new Error("All selected table blocks must use the same render function.");
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
  const replacement = `${mapName} <- list(\n${entries}\n)\n\nfor (output_name in names(${mapName})) {\n  local({\n    nm <- output_name\n    getter <- ${mapName}[[nm]]\n    output[[nm]] <- ${renderer}({\n      getter()\n    })\n  })\n}`;

  return source.slice(0, replacementStart) + indentBlock(replacement, indent) + source.slice(endIndex);
}
