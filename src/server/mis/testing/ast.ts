/**
 * Source-reading helpers for the access tests (Phase 14).
 *
 * The access rules are about what code DOES on its first line — "every exported
 * function opens with a gate" — and the only way to test a rule like that across
 * 280 functions is to read the source. This uses the TypeScript compiler that is
 * already a devDependency; it adds nothing to the bundle and nothing to
 * package.json.
 *
 * Test-only. Nothing in the app imports this.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

const ROOT = process.cwd();

export function readSource(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), 'utf8');
}

/** Every file under `dir` (relative to the app root) whose name matches `pattern`. */
export function listFiles(dir: string, pattern: RegExp): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(path.join(ROOT, current), { withFileTypes: true })) {
      const rel = path.posix.join(current, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (pattern.test(entry.name)) out.push(rel);
    }
  };
  walk(dir);
  return out.sort();
}

export function parse(relativePath: string): ts.SourceFile {
  return ts.createSourceFile(relativePath, readSource(relativePath), ts.ScriptTarget.Latest, true);
}

export type ExportedFunction = {
  name: string;
  isAsync: boolean;
  /** The callee of the first `await` in the body, as written — `requirePermission`, `db.x.findFirst`. */
  firstAwait: string | null;
  /** The literal argument of that first await, when it is a string — `'wages.read'`. */
  firstAwaitArg: string | null;
  /** Every function name called anywhere in the body (`foo(...)`, not `a.b(...)`). */
  calls: string[];
};

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind) =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === kind);

function firstAwaitOf(body: ts.Node): { callee: string | null; arg: string | null } {
  let found: { callee: string | null; arg: string | null } | null = null;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (ts.isAwaitExpression(node)) {
      const expr = node.expression;
      if (ts.isCallExpression(expr)) {
        const first = expr.arguments[0];
        found = {
          callee: expr.expression.getText(),
          arg: first && ts.isStringLiteralLike(first) ? first.text : null,
        };
      } else {
        found = { callee: expr.getText(), arg: null };
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return found ?? { callee: null, arg: null };
}

/**
 * The exported functions of one file: `export function`, `export async function`,
 * and `export const x = [cache(] async (...) => ...`.
 */
function callsOf(body: ts.Node): string[] {
  const out = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) out.add(node.expression.text);
    ts.forEachChild(node, visit);
  };
  visit(body);
  return [...out];
}

export function exportedFunctions(relativePath: string): ExportedFunction[] {
  const sf = parse(relativePath);
  const out: ExportedFunction[] = [];
  sf.forEachChild((node) => {
    if (!hasModifier(node, ts.SyntaxKind.ExportKeyword)) return;
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      const { callee, arg } = firstAwaitOf(node.body);
      out.push({
        name: node.name.text,
        isAsync: hasModifier(node, ts.SyntaxKind.AsyncKeyword),
        firstAwait: callee,
        firstAwaitArg: arg,
        calls: callsOf(node.body),
      });
    }
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        const init = decl.initializer;
        if (!init || !ts.isIdentifier(decl.name)) continue;
        if (ts.isArrowFunction(init) || ts.isCallExpression(init)) {
          const { callee, arg } = firstAwaitOf(init);
          out.push({ name: decl.name.text, isAsync: true, firstAwait: callee, firstAwaitArg: arg, calls: callsOf(init) });
        }
      }
    }
  });
  return out;
}

export type ImportRef = { from: string; names: string[]; /** `import type` — erased at build, ships nothing. */ typeOnly: boolean };

/** The named imports of a file, grouped by module specifier. */
export function importsOf(relativePath: string): ImportRef[] {
  const sf = parse(relativePath);
  const out: ImportRef[] = [];
  sf.forEachChild((node) => {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return;
    const bindings = node.importClause?.namedBindings;
    const names = bindings && ts.isNamedImports(bindings) ? bindings.elements.map((e) => (e.propertyName ?? e.name).text) : [];
    out.push({ from: node.moduleSpecifier.text, names, typeOnly: node.importClause?.isTypeOnly ?? false });
  });
  return out;
}

/** Does the file open with a 'use server' / 'use client' directive? */
export function directiveOf(relativePath: string): 'use server' | 'use client' | null {
  const sf = parse(relativePath);
  for (const stmt of sf.statements) {
    if (ts.isExpressionStatement(stmt) && ts.isStringLiteral(stmt.expression)) {
      if (stmt.expression.text === 'use server' || stmt.expression.text === 'use client') return stmt.expression.text;
      continue;
    }
    break;
  }
  return null;
}

export type AuditCall = {
  file: string;
  action: string | null;
  /** Shallow property names written into `before` / `after` (object literals only). */
  payloadKeys: string[];
  /** Every property name anywhere inside those literals, at any depth. */
  deepKeys: string[];
};

function collectKeys(node: ts.Node, out: string[]) {
  const visit = (n: ts.Node) => {
    if (ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n)) {
      out.push(n.name.getText().replace(/^['"]|['"]$/g, ''));
    }
    if (ts.isSpreadAssignment(n)) out.push(`...${n.expression.getText()}`);
    ts.forEachChild(n, visit);
  };
  visit(node);
}

/** Every `logAuditEvent({...})` call in a file, with the keys it writes into before/after. */
export function auditCallsIn(relativePath: string): AuditCall[] {
  const sf = parse(relativePath);
  const out: AuditCall[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText() === 'logAuditEvent') {
      const arg = node.arguments[0];
      if (arg && ts.isObjectLiteralExpression(arg)) {
        let action: string | null = null;
        const payloadKeys: string[] = [];
        const deepKeys: string[] = [];
        for (const prop of arg.properties) {
          if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) continue;
          const name = prop.name.getText();
          if (name === 'action' && ts.isPropertyAssignment(prop)) {
            action = ts.isStringLiteralLike(prop.initializer) ? prop.initializer.text : prop.initializer.getText();
          }
          if ((name === 'before' || name === 'after') && ts.isPropertyAssignment(prop)) {
            if (ts.isObjectLiteralExpression(prop.initializer)) {
              for (const inner of prop.initializer.properties) {
                if (ts.isPropertyAssignment(inner) || ts.isShorthandPropertyAssignment(inner)) {
                  payloadKeys.push(inner.name.getText().replace(/^['"]|['"]$/g, ''));
                } else if (ts.isSpreadAssignment(inner)) {
                  payloadKeys.push(`...${inner.expression.getText()}`);
                }
              }
              collectKeys(prop.initializer, deepKeys);
            } else {
              // A call such as auditSafe(row), a variable, or a conditional — record it so a
              // reviewer sees it, and still collect any literal keys written inside it.
              payloadKeys.push(`=${prop.initializer.getText()}`);
              collectKeys(prop.initializer, deepKeys);
            }
          }
        }
        out.push({ file: relativePath, action, payloadKeys, deepKeys });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}
