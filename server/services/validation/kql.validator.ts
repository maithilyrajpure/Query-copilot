/**
 * Top-level KQL validation service.
 *
 * `KQLValidatorService` composes the two lower-level validators in this
 * directory into a single pass:
 *   1. `KQLSyntaxChecker` confirms the KQL parses at all.
 *   2. `FieldValidator` confirms every referenced field is allowed, where the
 *      allowed set is derived from the target index mapping and the ECS field
 *      catalogue (see `computeAllowedFields`).
 *
 * On top of pass/fail it reports ECS coverage (how many of the referenced
 * fields are recognized ECS fields) and a list of non-fatal warnings. The
 * service NEVER throws — both underlying validators are themselves
 * non-throwing, and this service adds no throwing logic of its own.
 *
 * NOTE on the `ValidationResult` name: `../../../common/types` also exports an
 * interface called `ValidationResult`, but with a DIFFERENT shape
 * (isValid/language/errors/warnings/validatedAt/...). That type is deliberately
 * NOT imported or used here. Per the service contract this module defines its
 * own service-local `ValidationResult` (the shape below) and the name collision
 * is intentional — the two types model different things.
 */

import type { ECSField } from '../../../common/types';
import type { SchemaContext } from '../schema';
import { ECSRegistry } from '../schema';
import { KQLSyntaxChecker } from './syntax.checker';
import type { SyntaxError } from './syntax.checker';
import { FieldValidator } from './field.validator';
import type { FieldValidationError } from './field.validator';

/**
 * Combined outcome of a KQL validation pass.
 *
 * Service-local: intentionally distinct from the `ValidationResult` exported by
 * `../../../common/types` (see the file-level note above).
 */
export interface ValidationResult {
  /**
   * True when the KQL parsed. Unknown fields do NOT make a query invalid — they
   * are reported as advisory {@link warnings} (see `validate`), so `valid` is
   * effectively "syntactically valid". Only a syntax error sets this false.
   */
  readonly valid: boolean;
  /** Syntax errors from the parse step; empty when the KQL parsed. */
  readonly syntaxErrors: SyntaxError[];
  /**
   * Field errors. Unknown fields are now advisory (reported in {@link warnings}),
   * so this is empty in normal operation; retained in the shape for compatibility.
   */
  readonly fieldErrors: FieldValidationError[];
  /** Non-fatal advisories (valid-but-non-ECS fields AND unknown fields). */
  readonly warnings: string[];
  /** The recognized ECS fields actually referenced by the query. */
  readonly ecsFieldsUsed: ECSField[];
  /** Count of DISTINCT fields referenced by the query. */
  readonly totalFieldsInQuery: number;
  /** Human-readable ECS coverage, formatted "<ecsUsed>/<total>" (e.g. "8/10"). */
  readonly ecsFieldCoverage: string;
}

/**
 * Orchestrates KQL syntax + field validation and reports ECS coverage.
 *
 * Dependencies are injectable (primarily for testing); when omitted, default
 * instances are constructed.
 */
export class KQLValidatorService {
  private readonly syntaxChecker: KQLSyntaxChecker;
  private readonly fieldValidator: FieldValidator;

  constructor(syntaxChecker?: KQLSyntaxChecker, fieldValidator?: FieldValidator) {
    this.syntaxChecker = syntaxChecker ?? new KQLSyntaxChecker();
    this.fieldValidator = fieldValidator ?? new FieldValidator();
  }

  /**
   * Runs syntax check then field validation against the schema context.
   *
   * If the KQL fails to parse, field validation is skipped (it is impossible on
   * an unparseable query) and a single warning records the skip. Otherwise the
   * referenced fields are validated against the allowed set and ECS coverage is
   * computed.
   *
   * NEVER throws.
   *
   * @param kql the KQL expression to validate
   * @param schemaContext the relevant ECS fields and target index mapping
   * @returns a combined {@link ValidationResult}
   */
  validate(kql: string, schemaContext: SchemaContext): ValidationResult {
    const syntax = this.syntaxChecker.check(kql);
    if (!syntax.valid) {
      return {
        valid: false,
        syntaxErrors: syntax.errors,
        fieldErrors: [],
        warnings: ['Field validation was skipped because the KQL could not be parsed.'],
        ecsFieldsUsed: [],
        totalFieldsInQuery: 0,
        ecsFieldCoverage: '0/0',
      };
    }

    const allowedFields = this.computeAllowedFields(schemaContext);
    const fieldResult = this.fieldValidator.validate(kql, allowedFields);

    const ecsFieldsUsed = fieldResult.fields
      .map((name) => ECSRegistry.getFieldByName(name))
      .filter((f): f is ECSField => f !== undefined);

    const totalFieldsInQuery = fieldResult.fields.length;

    // Unknown fields are ADVISORY, not blocking. The index mapping fed to the
    // validator is frequently incomplete (dynamic, runtime, and multi-fields are
    // not always enumerated, and custom schemas vary widely), while the KQL here
    // is already syntactically valid. Refusing to return a generated query
    // because a field "looks unknown" is the wrong default for a query assistant
    // — Elasticsearch is the real arbiter of whether a field matches documents.
    // So we surface unknown fields as warnings and let the query run; only a
    // SYNTAX error (handled above) blocks and drives the correction loop.
    const unknownFieldWarnings = fieldResult.unknownFields.map(
      (f) =>
        `Field "${f}" was not found in the target index mapping or ECS catalogue; it may not match any documents.`
    );
    const warnings = [
      ...this.buildWarnings(
        fieldResult.fields,
        ecsFieldsUsed,
        fieldResult.unknownFields,
        schemaContext
      ),
      ...unknownFieldWarnings,
    ];

    return {
      valid: true,
      syntaxErrors: [],
      fieldErrors: [],
      warnings,
      ecsFieldsUsed,
      totalFieldsInQuery,
      ecsFieldCoverage: `${ecsFieldsUsed.length}/${totalFieldsInQuery}`,
    };
  }

  /**
   * Computes the set of field names that are allowed in the query.
   *
   * Rationale: a referenced field is a hard "unknown field" error only if it is
   * neither present in the target index mapping NOR a recognized ECS field.
   * When the index mapping is available we therefore allow the union of the
   * index fields and the full ECS catalogue. When the index mapping is
   * unavailable (empty), we fall back to validating against the ECS catalogue
   * only.
   */
  private computeAllowedFields(ctx: SchemaContext): string[] {
    const ecsNames = ECSRegistry.getAllFields().map((f) => f.name);
    if (ctx.availableIndexFields.length > 0) {
      return Array.from(new Set([...ctx.availableIndexFields, ...ecsNames]));
    }
    return ecsNames;
  }

  /**
   * Builds non-fatal advisory warnings for an otherwise-allowed set of fields.
   *
   * Two kinds of warning are produced:
   *  - A valid ECS field that is NOT present in the (available) target index
   *    mapping — useful but may not match documents in this index.
   *  - A referenced field that is allowed (it is a real index field) but is not
   *    a recognized ECS field.
   *
   * Unknown-field ERRORS are not re-warned here (they are already reported as
   * `fieldErrors`), hence the `unknownFields` exclusion below.
   */
  private buildWarnings(
    allFields: string[],
    ecsFieldsUsed: ECSField[],
    unknownFields: string[],
    ctx: SchemaContext
  ): string[] {
    const ecsNames = new Set(ecsFieldsUsed.map((f) => f.name));
    const indexSet = new Set(ctx.availableIndexFields);
    const unknownSet = new Set(unknownFields);
    const warnings: string[] = [];

    if (ctx.availableIndexFields.length > 0) {
      for (const f of ecsFieldsUsed) {
        if (!indexSet.has(f.name)) {
          warnings.push(`ECS field "${f.name}" is valid but not present in the target index mapping.`);
        }
      }
    }

    for (const name of allFields) {
      if (!ecsNames.has(name) && !unknownSet.has(name)) {
        warnings.push(`Field "${name}" is not a recognized ECS field.`);
      }
    }

    return warnings;
  }
}
