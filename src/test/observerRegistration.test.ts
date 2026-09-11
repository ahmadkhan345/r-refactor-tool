import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { suite, test } from "mocha";
import {
  configurationDrivenObserverRegistration,
  findObserverMappings,
} from "../refactors/observerRegistration";

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

suite("Configuration-Driven Observer Registration", () => {
  test("finds observer mappings written with dollar notation", () => {
    const source = `
observeEvent(input$country, { update_country(input$country) })
observeEvent(input$city, { update_city(input$city) })
`;

    assert.deepStrictEqual(findObserverMappings(source), [
      { sourceName: "country", targetName: "update_country" },
      { sourceName: "city", targetName: "update_city" },
    ]);
  });

  test("finds observer mappings written with bracket notation", () => {
    const source = `
observeEvent(input[["country"]], { update_country(input[["country"]]) })
observeEvent(input[['city']], { update_city(input[['city']]) })
`;

    assert.deepStrictEqual(findObserverMappings(source), [
      { sourceName: "country", targetName: "update_country" },
      { sourceName: "city", targetName: "update_city" },
    ]);
  });

  test("matches the expected after fixture", () => {
    const source = fixture("observerRegistration.before.R");
    const expected = fixture("observerRegistration.after.R");

    const start = source.indexOf("  observeEvent");
    const end = source.lastIndexOf("\n}");
    const result = configurationDrivenObserverRegistration(source, start, end);

    assert.strictEqual(
      normalized(result),
      normalized(expected),
      `Generated output does not match the fixture.\n\nActual:\n${result}\n\nExpected:\n${expected}`
    );
  });

  test("uses a custom configuration map name", () => {
    const source = `
observeEvent(input$a, { set_a(input$a) })
observeEvent(input$b, { set_b(input$b) })
`;

    const result = configurationDrivenObserverRegistration(
      source,
      source.indexOf("observeEvent"),
      source.trimEnd().length,
      "observer_map"
    );

    assert.ok(result.includes("observer_map <- list("));
    assert.ok(result.includes("names(observer_map)"));
    assert.ok(result.includes("setter <- observer_map[[nm]]"));
  });

  test("rejects a selection containing fewer than two matching observers", () => {
    const source = "observeEvent(input$a, { set_a(input$a) })";

    assert.throws(
      () => configurationDrivenObserverRegistration(source, 0, source.length),
      /at least two matching observeEvent blocks/
    );
  });
});
