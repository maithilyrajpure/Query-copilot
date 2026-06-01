/**
 * KQL (Kibana Query Language) syntax checker.
 *
 * Thin wrapper around `@kbn/es-query`'s `fromKueryExpression`, which parses a
 * KQL string and THROWS a `KQLSyntaxError` on malformed input. This module
 * translates that throwing behavior into a structured, never-throwing result
 * (`SyntaxCheckResult`) so callers can inspect validity and error details
 * without needing their own try/catch.
 *
 * Notes on KQL semantics:
 * - `fromKueryExpression('')` is VALID (empty / match-all) and does not throw.
 * - KQL is permissive: bare, field-less terms (e.g. `hello`) are valid.
 * - Only genuinely malformed input (e.g. `'('`, `'host.name : "x" and'`) throws.
 *
 * The character offset of an error is not exposed on the `KQLSyntaxError`
 * instance, so it is recovered from the caret line in the formatted `.message`.
 */

import { fromKueryExpression, KQLSyntaxError } from '@kbn/es-query';

/**
 * A single KQL syntax error.
 *
 * NOTE: this intentionally shadows the global `SyntaxError` type within this
 * module, per the service contract.
 */
export interface SyntaxError {
  readonly message: string;
  readonly position: number | null; // 0-based character offset of the error, if recoverable
  readonly token: string | null;    // the offending token, if recoverable
}

/** Structured result of a KQL syntax check. */
export interface SyntaxCheckResult {
  readonly valid: boolean;
  readonly errors: SyntaxError[];
}

/** Validates KQL expressions using `@kbn/es-query` and reports structured errors. */
export class KQLSyntaxChecker {
  /**
   * Parses the KQL with `@kbn/es-query`; returns structured errors.
   *
   * NEVER throws: the parse is wrapped in try/catch and every helper used to
   * build the error payload is defensive.
   *
   * @param kql the KQL expression to validate (empty string is valid / match-all)
   * @returns `{ valid: true, errors: [] }` on success, otherwise
   *          `{ valid: false, errors: [<single error>] }`.
   */
  check(kql: string): SyntaxCheckResult {
    try {
      fromKueryExpression(kql);
      return { valid: true, errors: [] };
    } catch (err) {
      return { valid: false, errors: [this.toSyntaxError(err)] };
    }
  }

  /**
   * Builds a structured `SyntaxError` from an unknown thrown value.
   * Defensive: must not throw for any input.
   */
  private toSyntaxError(err: unknown): SyntaxError {
    const message =
      err instanceof KQLSyntaxError
        ? err.shortMessage
        : err instanceof Error
        ? err.message
        : String(err);

    return {
      message,
      position: this.parsePosition(err),
      token: this.parseToken(err),
    };
  }

  /**
   * Recovers the 0-based character offset of the error from the caret line in
   * the full (multi-line) error message. The caret line is formatted as
   * zero-or-more dashes followed by a single caret (e.g. `----^`), and the
   * caret's index is the offset.
   *
   * Defensive: returns `null` if no caret line is present or on any failure.
   */
  private parsePosition(err: unknown): number | null {
    try {
      const fullMessage = err instanceof Error ? err.message : String(err);
      const lines = fullMessage.split('\n');
      const caretLine = lines.find((line) => /^-*\^$/.test(line));
      if (caretLine === undefined) {
        return null;
      }
      return caretLine.indexOf('^');
    } catch {
      return null;
    }
  }

  /**
   * Recovers the offending token from the short error description, which is
   * typically phrased as `... but "<token>" found`.
   *
   * Defensive: returns `null` if no token can be parsed or on any failure.
   */
  private parseToken(err: unknown): string | null {
    try {
      const shortMessage =
        err instanceof KQLSyntaxError
          ? err.shortMessage
          : err instanceof Error
          ? err.message
          : String(err);

      const match = shortMessage.match(/but\s+"?(.+?)"?\s+found/i);
      return match ? match[1].trim() : null;
    } catch {
      return null;
    }
  }
}
