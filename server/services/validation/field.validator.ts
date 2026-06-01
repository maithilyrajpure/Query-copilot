/**
 * Field validation for KQL queries.
 *
 * `FieldValidator` discovers which field names a KQL query references and flags
 * any that are not in an allowed-field set. Field names are extracted by
 * traversing the `@kbn/es-query` abstract syntax tree (AST) produced by
 * `fromKueryExpression` — NOT by running a regex over the raw query string.
 *
 * Working from the AST matters because only structural nodes (the `field`
 * argument of `is` / `range` / `exists`, and `nested` paths) are treated as
 * field names. Text that merely appears inside a quoted VALUE (e.g.
 * `message : "user.name : root"`) is never mistaken for a field reference,
 * which a string/regex approach could not reliably guarantee.
 *
 * `@kbn/es-query` also exports `getKqlFieldNames(node)`, which can list field
 * names directly. We traverse the AST explicitly instead: it gives us control
 * over nested-path prefixing (so `nested` children are reported as
 * `path.child`) and keeps the dependency surface minimal.
 *
 * This module NEVER throws: invalid KQL syntax cannot be parsed into an AST, so
 * field extraction is impossible and is reported as "no fields, valid". Syntax
 * problems are surfaced separately by `KQLSyntaxChecker`, so this validator
 * deliberately does not double-report them.
 */

import { fromKueryExpression, type KueryNode } from '@kbn/es-query';

/** A field referenced in a KQL query that is not in the allowed-field set. */
export interface FieldValidationError {
  readonly field: string;
  readonly message: string;
}

/** Outcome of validating the fields referenced by a KQL query. */
export interface FieldValidationResult {
  readonly valid: boolean;                  // true when there are no unknown fields
  readonly fields: string[];                // all DISTINCT field names referenced in the query
  readonly unknownFields: string[];         // fields not present in allowedFields
  readonly errors: FieldValidationError[];  // one per unknown field
}

export class FieldValidator {
  /**
   * Extracts referenced field names from the KQL via AST traversal and flags any
   * not present in `allowedFields`. NEVER throws.
   *
   * On unparseable KQL the AST cannot be built, so no fields can be extracted;
   * we return a valid, empty result. Syntax errors are reported separately by
   * `KQLSyntaxChecker`, so this method does not double-report them.
   */
  validate(kql: string, allowedFields: string[]): FieldValidationResult {
    let ast: KueryNode;
    try {
      ast = fromKueryExpression(kql);
    } catch {
      // Field extraction is impossible on unparseable KQL; syntax errors are
      // reported separately by KQLSyntaxChecker, so we do not double-report.
      return { valid: true, fields: [], unknownFields: [], errors: [] };
    }

    const fields = this.extractFieldNames(ast);
    const allowed = new Set(allowedFields);
    const unknownFields = fields.filter((f) => !allowed.has(f));
    const errors = unknownFields.map((field) => ({
      field,
      message: `Unknown field "${field}": it is not in the allowed ECS fields or the target index mapping.`,
    }));

    return { valid: errors.length === 0, fields, unknownFields, errors };
  }

  /**
   * Recursively traverses the KQL AST and returns the DISTINCT field names it
   * references. Only structural field arguments are collected; quoted values are
   * ignored because they live in `arguments[1]` of an `is` node and are never
   * read here.
   */
  private extractFieldNames(root: KueryNode): string[] {
    const set = new Set<string>();

    const visit = (node: unknown, prefix: string): void => {
      if (typeof node !== 'object' || node === null) {
        return;
      }

      const kueryNode = node as KueryNode;
      if (kueryNode.type !== 'function') {
        return;
      }

      const fn = kueryNode.function;
      const args = (kueryNode.arguments ?? []) as unknown[];

      switch (fn) {
        case 'is':
        case 'range':
        case 'exists': {
          // arguments[0] is the field; the value (if any) is in a later
          // argument and is intentionally not read.
          const field = this.literalValue(args[0]);
          if (typeof field === 'string' && field.length > 0) {
            set.add(prefix + field);
          }
          break;
        }
        case 'nested': {
          // arguments[0] is the nested path, arguments[1] is the child query.
          // Prefix child field names with the path so they read as `path.child`.
          const path = this.literalValue(args[0]);
          if (typeof path === 'string' && path.length > 0) {
            visit(args[1], `${prefix}${path}.`);
          } else {
            visit(args[1], prefix);
          }
          break;
        }
        case 'and':
        case 'or': {
          for (const a of args) {
            visit(a, prefix);
          }
          break;
        }
        case 'not': {
          visit(args[0], prefix);
          break;
        }
        default: {
          // Defensive recurse for any unrecognized function node.
          for (const a of args) {
            visit(a, prefix);
          }
          break;
        }
      }
    };

    visit(root, '');
    return Array.from(set);
  }

  /**
   * Returns the `.value` of a literal node, or `null` for anything that is not a
   * literal (e.g. wildcard field arguments). The literal value itself may be
   * `null` for bare/field-less terms.
   */
  private literalValue(node: unknown): string | number | boolean | null {
    if (typeof node === 'object' && node !== null && (node as KueryNode).type === 'literal') {
      return (node as KueryNode).value;
    }
    return null;
  }
}
