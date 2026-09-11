import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { suite, test } from "mocha";
import { parseR } from "../ast";
import { analyseExtraction, extractFunction } from "../refactors";

function parsed(source: string) {
  return parseR(source);
}

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

suite("Extract Function", () => {
  test("detects parameters used inside the selection", () => {
    const source = `
f <- function(x, y) {
  z <- x + y
  result <- z * 2
  print(result)
}
`;

    const start = source.indexOf("z <- x + y");
    const end = source.indexOf("  print(result)");
    const info = analyseExtraction(source, parsed(source), start, end);

    assert.deepStrictEqual(info.params.sort(), ["x", "y"].sort());
  });

  test("detects return value assigned inside and used after selection", () => {
    const source = `
f <- function(x, y) {
  z <- x + y
  result <- z * 2
  print(result)
}
`;

    const start = source.indexOf("z <- x + y");
    const end = source.indexOf("  print(result)");
    const info = analyseExtraction(source, parsed(source), start, end);

    assert.strictEqual(info.returnValue, "result");
  });

  test("matches the expected after fixture", () => {
    const source = fixture("extractFunction.before.R");
    const expected = fixture("extractFunction.after.R");

    const start = source.indexOf("result <- x + y");
    // Stop before the newline so it remains between the generated call and
    // the following print statement.
    const end = source.indexOf("\n  print(result)");
    const parse = parsed(source);
    const info = analyseExtraction(source, parse, start, end);
    const result = extractFunction(source, parse, info, "compute_result");

    assert.strictEqual(normalized(result), normalized(expected));
  });

  test("extracts root-level code above the selected statement", () => {
    const source = `
x <- 1
y <- 2
z <- x + y
print(z)
`;

    const start = source.indexOf("z <- x + y");
    const end = source.indexOf("print(z)");
    const parse = parsed(source);
    const info = analyseExtraction(source, parse, start, end);
    const result = extractFunction(source, parse, info, "compute_z");

    assert.ok(result.includes("compute_z <- function(x, y)"));
    assert.ok(result.includes("z <- compute_z(x, y)"));
    assert.ok(result.indexOf("compute_z <- function") < result.indexOf("z <- compute_z"));
  });
});
