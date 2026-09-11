import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { suite, test } from "mocha";
import {
  findTableRenderMappings,
  tableDrivenCodeGeneration,
} from "../refactors/tableDrivenCodeGeneration";

function fixture(name: string): string {
  return fs.readFileSync(
    path.resolve(process.cwd(), "src", "test", "fixtures", name),
    "utf8"
  );
}

function normalized(source: string): string {
  return source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

suite("Table-Driven Code Generation", () => {
  test("finds table render mappings written with dollar notation", () => {
    const source = `
output$orders <- renderTable({ filtered_orders() })
output$customers <- renderTable({ filtered_customers() })
`;

    assert.deepStrictEqual(findTableRenderMappings(source), [
      {
        sourceName: "orders",
        renderer: "renderTable",
        targetName: "filtered_orders",
      },
      {
        sourceName: "customers",
        renderer: "renderTable",
        targetName: "filtered_customers",
      },
    ]);
  });

  test("finds namespaced renderers and bracket notation", () => {
    const source = `
output[["orders"]] <- DT::renderDataTable({ filtered_orders() })
output[['customers']] <- DT::renderDataTable({ filtered_customers() })
`;

    assert.deepStrictEqual(findTableRenderMappings(source), [
      {
        sourceName: "orders",
        renderer: "DT::renderDataTable",
        targetName: "filtered_orders",
      },
      {
        sourceName: "customers",
        renderer: "DT::renderDataTable",
        targetName: "filtered_customers",
      },
    ]);
  });

  test("matches the expected after fixture", () => {
    const source = fixture("tableDrivenCodeGeneration.before.R");
    const expected = fixture("tableDrivenCodeGeneration.after.R");

    const start = source.indexOf("  output$orders");
    const end = source.lastIndexOf("\n}");
    const result = tableDrivenCodeGeneration(source, start, end);

    assert.strictEqual(
      normalized(result),
      normalized(expected),
      `Generated output does not match the fixture.\n\nActual:\n${result}\n\nExpected:\n${expected}`
    );
  });

  test("rejects a selection containing fewer than two render blocks", () => {
    const source = "output$orders <- renderTable({ filtered_orders() })";

    assert.throws(
      () => tableDrivenCodeGeneration(source, 0, source.length),
      /at least two matching output render blocks/
    );
  });

  test("rejects blocks that use different render functions", () => {
    const source = `
output$orders <- renderTable({ filtered_orders() })
output$customers <- renderDataTable({ filtered_customers() })
`;

    assert.throws(
      () => tableDrivenCodeGeneration(source, 0, source.length),
      /must use the same render function/
    );
  });
});
