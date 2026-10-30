// Reads Wiktionary data modules written as Lua table literals WITHOUT running them: the input is
// untrusted, so we tokenize and parse the one constrained shape the dial-syn tables use.

/** A field value: a string (e.g. "meaning") or a list of strings (e.g. a location's forms). */
export type LuaDataValue = string | readonly string[];

export interface LuaDataEntry {
  readonly value: LuaDataValue;
  /** 1-based line of the field's key (or of its value, for a bare string key). */
  readonly line: number;
}

/** A syntax error, or a construct this reader does not support, at a 1-based line. */
export class LuaSyntaxError extends Error {
  constructor(
    readonly line: number,
    message: string,
  ) {
    super(message);
    this.name = "LuaSyntaxError";
  }
}

type Token =
  | { readonly kind: "name"; readonly text: string; readonly line: number }
  | { readonly kind: "string"; readonly text: string; readonly line: number }
  | { readonly kind: "punct"; readonly text: string; readonly line: number }
  | { readonly kind: "eof"; readonly text: ""; readonly line: number };

const NAME_START = /[A-Za-z_]/;
const NAME_PART = /[A-Za-z0-9_]/;
const PUNCTUATION = new Set(["{", "}", "[", "]", "=", ",", ";", "."]);
/** Highest decimal escape accepted: \0-\127 are ASCII characters. */
const MAX_ASCII = 127;

/** Lua 5.1's escapes, plus backslash-newline (a newline in the string). */
const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  a: "\x07", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v", "\\": "\\", '"': '"', "'": "'", "\n": "\n",
};

/**
 * Splits Lua source into names, strings and punctuation, dropping whitespace and comments. Lazy, so
 * a module of the wrong shape fails at its first unexpected token rather than at a later character.
 */
function* tokenize(text: string): Generator<Token, Token> {
  let i = 0;
  let line = 1;

  /** Length of the "=" run if a long bracket ("[[", "[=[", …) opens at `at`, else -1. */
  const longBracketLevel = (at: number): number => {
    if (text[at] !== "[") return -1;
    let j = at + 1;
    while (text[j] === "=") j++;
    return text[j] === "[" ? j - at - 1 : -1;
  };

  /** Reads a long string/comment body starting at i (on its opening bracket), returns its content. */
  const readLong = (level: number, what: string): string => {
    const startLine = line;
    const close = `]${"=".repeat(level)}]`;
    let start = i + level + 2;
    if (text[start] === "\r") start++;
    if (text[start] === "\n") start++; // Lua drops a newline right after the opening bracket
    const end = text.indexOf(close, start);
    if (end === -1) throw new LuaSyntaxError(startLine, `unfinished long ${what}`);
    for (let k = i; k < end; k++) if (text[k] === "\n") line++;
    i = end + close.length;
    return text.slice(start, end);
  };

  const readQuoted = (quote: string): string => {
    const startLine = line;
    let out = "";
    i++;
    for (;;) {
      const c = text[i];
      if (c === undefined || c === "\n") throw new LuaSyntaxError(startLine, "unfinished string");
      if (c === quote) {
        i++;
        return out;
      }
      if (c !== "\\") {
        out += c;
        i++;
        continue;
      }
      const e = text[i + 1];
      if (e === undefined) throw new LuaSyntaxError(startLine, "unfinished string");
      if (e in SIMPLE_ESCAPES) {
        if (e === "\n") line++;
        out += SIMPLE_ESCAPES[e];
        i += 2;
      } else if (/[0-9]/.test(e)) {
        // Lua 5.1 \ddd is one BYTE; above 127 it is a piece of a multi-byte (e.g. UTF-8) character,
        // which a JS string cannot hold as such, so refuse it instead of producing Latin-1 garbage.
        const digits = /^[0-9]{1,3}/.exec(text.slice(i + 1))![0];
        if (Number(digits) > MAX_ASCII) {
          throw new LuaSyntaxError(line, `unsupported escape "\\${digits}": decimal escapes above ${MAX_ASCII} are raw bytes`);
        }
        out += String.fromCharCode(Number(digits));
        i += 1 + digits.length;
      } else {
        // Includes \x, \z and \u{…}: Lua 5.2+ only, and Scribunto runs Lua 5.1.
        throw new LuaSyntaxError(line, `unsupported escape "\\${e}"`);
      }
    }
  };

  while (i < text.length) {
    const c = text[i]!;
    if (c === "\n") {
      line++;
      i++;
    } else if (/\s/.test(c)) {
      // JavaScript's \s includes a U+FEFF byte order mark
      i++;
    } else if (c === "-" && text[i + 1] === "-") {
      i += 2;
      const level = longBracketLevel(i);
      if (level >= 0) {
        readLong(level, "comment");
      } else {
        while (i < text.length && text[i] !== "\n") i++;
      }
    } else if (c === '"' || c === "'") {
      const startLine = line;
      yield { kind: "string", text: readQuoted(c), line: startLine };
    } else if (longBracketLevel(i) >= 0) {
      const startLine = line;
      yield { kind: "string", text: readLong(longBracketLevel(i), "string"), line: startLine };
    } else if (NAME_START.test(c)) {
      let j = i + 1;
      while (j < text.length && NAME_PART.test(text[j]!)) j++;
      const name = text.slice(i, j);
      i = j;
      yield { kind: "name", text: name, line };
    } else if (PUNCTUATION.has(c)) {
      i++;
      yield { kind: "punct", text: c, line };
    } else {
      throw new LuaSyntaxError(line, `unexpected character "${String.fromCodePoint(text.codePointAt(i)!)}"`);
    }
  }
  return { kind: "eof", text: "", line };
}

/** How a token reads in an error message. */
const describeToken = (token: Token): string => (token.kind === "eof" ? "end of file" : `"${token.text}"`);

/**
 * Reads a data module of exactly this shape (comments and whitespace aside):
 *
 *     local export = {}
 *     export.list = { ["key"] = "string", ["key"] = { "form", "form" }, key = …, … }
 *     return export
 *
 * and returns the fields of `export.list` in file order. Like Lua, a repeated key keeps its last
 * value, and positional (keyless) values are ignored: Lua stores them at integer indexes, which
 * Wiktionary's renderer never reads. Fields are separated by "," or ";", with an optional trailing
 * separator. Strings may use either quote, Lua 5.1 escapes (decimal ones up to 127) or long brackets. Anything else (numbers, nested
 * tables inside a value, variables, other statements) throws a LuaSyntaxError with its line.
 */
export function readExportList(text: string): ReadonlyMap<string, LuaDataEntry> {
  const source = tokenize(text);
  /** Tokens read from `source` but not yet consumed. It ends with the "eof" token once that is read, which is never consumed. */
  const lookahead: Token[] = [];
  const peek = (offset = 0): Token => {
    while (lookahead.length <= offset && lookahead.at(-1)?.kind !== "eof") lookahead.push(source.next().value);
    return lookahead[Math.min(offset, lookahead.length - 1)]!;
  };
  const next = (): Token => {
    const token = peek();
    if (token.kind !== "eof") lookahead.shift();
    return token;
  };
  const isPunct = (token: Token, p: string): boolean => token.kind === "punct" && token.text === p;
  const expect = (kind: Token["kind"], expected: string): Token => {
    const token = next();
    if (token.kind !== kind || (kind !== "string" && token.text !== expected)) {
      throw new LuaSyntaxError(token.line, `expected ${kind === "eof" ? "end of file" : `"${expected}"`} but found ${describeToken(token)}`);
    }
    return token;
  };
  const expectString = (): Token => {
    const token = next();
    if (token.kind !== "string") throw new LuaSyntaxError(token.line, `expected a string but found ${describeToken(token)}`);
    return token;
  };
  /** After a field: a separator, or the closing brace; returns true when the table is closed. */
  const separatorOrEnd = (): boolean => {
    if (isPunct(peek(), ",") || isPunct(peek(), ";")) {
      next();
      if (isPunct(peek(), "}")) {
        next();
        return true;
      }
      return false;
    }
    expect("punct", "}");
    return true;
  };
  /** A list of strings, the opening "{" already consumed. */
  const stringList = (): string[] => {
    const items: string[] = [];
    if (isPunct(peek(), "}")) {
      next();
      return items;
    }
    for (;;) {
      items.push(expectString().text);
      if (separatorOrEnd()) return items;
    }
  };
  const value = (): LuaDataValue => {
    const token = next();
    if (token.kind === "string") return token.text;
    if (isPunct(token, "{")) return stringList();
    throw new LuaSyntaxError(token.line, `expected a string or a list of strings but found ${describeToken(token)}`);
  };

  expect("name", "local");
  expect("name", "export");
  expect("punct", "=");
  expect("punct", "{");
  expect("punct", "}");
  expect("name", "export");
  expect("punct", ".");
  expect("name", "list");
  expect("punct", "=");
  expect("punct", "{");

  const fields = new Map<string, LuaDataEntry>();
  let closed = isPunct(peek(), "}");
  if (closed) next();
  while (!closed) {
    const start = peek();
    if (isPunct(start, "[")) {
      next();
      const key = expectString().text;
      expect("punct", "]");
      expect("punct", "=");
      fields.delete(key); // a repeated key moves to its last position, as its value does
      fields.set(key, { value: value(), line: start.line });
    } else if (start.kind === "name" && isPunct(peek(1), "=")) {
      next();
      next();
      fields.delete(start.text);
      fields.set(start.text, { value: value(), line: start.line });
    } else {
      value(); // positional value: ignored
    }
    closed = separatorOrEnd();
  }

  expect("name", "return");
  expect("name", "export");
  expect("eof", "");
  return fields;
}
