/**
 * ES|QL syntax checker.
 *
 * Parallel to {@link KQLSyntaxChecker}, but for ES|QL (the Elasticsearch piped
 * query language). It wraps `@kbn/esql-ast`'s SYNCHRONOUS parser
 * (`EsqlQuery.fromSrc`), which parses an ES|QL string and collects parse errors
 * into an array (it does not throw). This module maps those parse errors into
 * the same structured {@link SyntaxCheckResult} the KQL checker returns, so the
 * validator can branch on language while keeping `validate()` synchronous.
 *
 * Scope: SYNTAX only. Field/semantic validation for ES|QL is intentionally NOT
 * done here — the only ES|QL field-validation API (`validateQuery`) is async,
 * and Elasticsearch validates semantics at execution time anyway.
 */

import { EsqlQuery } from '@kbn/esql-ast';
import type { SyntaxCheckResult, SyntaxError } from './syntax.checker';

/** A single `@kbn/esql-ast` parse error (monaco-style position). */
interface EsqlEditorError {
  readonly message: string;
  readonly startLineNumber?: number;
  readonly startColumn?: number;
  readonly severity?: 'error' | 'warning' | number;
}

/** Validates ES|QL syntax via `@kbn/esql-ast` and reports structured errors. */
export class ESQLSyntaxChecker {
  /**
   * Parses the ES|QL and returns structured errors. NEVER throws: the parser
   * collects errors rather than throwing, and the call is additionally wrapped
   * in try/catch as a defensive guard.
   *
   * @param esql the ES|QL statement to validate
   * @returns `{ valid: true, errors: [] }` when it parses, otherwise
   *          `{ valid: false, errors: [...] }`.
   */
  check(esql: string): SyntaxCheckResult {
    try {
      const { errors } = EsqlQuery.fromSrc(esql ?? '');
      const syntaxErrors = (errors as EsqlEditorError[])
        .filter((e) => e.severity !== 'warning')
        .map((e) => this.toSyntaxError(e));
      return { valid: syntaxErrors.length === 0, errors: syntaxErrors };
    } catch (err) {
      return {
        valid: false,
        errors: [
          {
            message: err instanceof Error ? err.message : String(err),
            position: null,
            token: null,
          },
        ],
      };
    }
  }

  /** Maps a `@kbn/esql-ast` parse error to the shared {@link SyntaxError} shape. */
  private toSyntaxError(error: EsqlEditorError): SyntaxError {
    // `startColumn` is 1-based; convert to a 0-based offset for single-line
    // statements (the common case). Multi-line positions are left unresolved.
    const position =
      error.startLineNumber === 1 && typeof error.startColumn === 'number'
        ? error.startColumn - 1
        : null;
    return {
      message: error.message,
      position,
      token: null,
    };
  }
}
