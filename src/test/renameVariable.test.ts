import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { suite, test } from "mocha";
import { parseR } from "../ast";
import { renameVariable } from "../refactors";

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

suite("Rename Variable", () => {
  test("matches the expected after fixture", () => {
    const source = fixture("renameVariable.before.R");
    const expected = fixture("renameVariable.after.R");

    const cursorOffset = source.indexOf("x <- 1");
    const result = renameVariable(
      source,
      parsed(source),
      "x",
      "global_x",
      cursorOffset
    );

    assert.strictEqual(normalized(result), normalized(expected));
  });

  test("renames local variable without touching global variable", () => {
    const source = `
x <- 1

f <- function() {
  x <- 2
  x
}

x
`;

    const cursorOffset = source.indexOf("x <- 2");
    const result = renameVariable(
      source,
      parsed(source),
      "x",
      "local_x",
      cursorOffset
    );

    assert.strictEqual(
      result.trim(),
      `
x <- 1

f <- function() {
  local_x <- 2
  local_x
}

x
`.trim()
    );
  });

  test("renames function parameter and its references", () => {
    const source = `
f <- function(x) {
  x + 1
}
`;

    const cursorOffset = source.indexOf("x) {");
    const result = renameVariable(
      source,
      parsed(source),
      "x",
      "value",
      cursorOffset
    );

    assert.strictEqual(
      result.trim(),
      `
f <- function(value) {
  value + 1
}
`.trim()
    );
  });

  test("does not rename variables shadowed in nested functions", () => {
    const source = `
f <- function(x) {
  y <- x + 1
  g <- function(x) {
    x + 10
  }
  y
}
`;

    const cursorOffset = source.indexOf("x) {");
    const result = renameVariable(
      source,
      parsed(source),
      "x",
      "input",
      cursorOffset
    );

    assert.strictEqual(
      result.trim(),
      `
f <- function(input) {
  y <- input + 1
  g <- function(x) {
    x + 10
  }
  y
}
`.trim()
    );
  });
});
