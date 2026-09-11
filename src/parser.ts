import Parser = require("tree-sitter");
import R from "@davisvaughan/tree-sitter-r";

let _parser: Parser | null = null;

export function getParser(): Parser {
  if (!_parser) {
    _parser = new Parser();
    (_parser as any).setLanguage(R);
  }
  return _parser;
}

export function getLanguage(): any {
  return R;
}