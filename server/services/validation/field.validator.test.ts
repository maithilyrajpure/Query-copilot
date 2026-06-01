import { FieldValidator } from './field.validator';

describe('FieldValidator', () => {
  const v = new FieldValidator();

  it('extracts field names across is / and / or / range operators', () => {
    const result = v.validate(
      'user.name : "admin" and source.ip : "10.0.0.5" or destination.port > 1024',
      ['user.name', 'source.ip', 'destination.port']
    );

    expect(new Set(result.fields)).toEqual(
      new Set(['user.name', 'source.ip', 'destination.port'])
    );
    expect(result.unknownFields).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('flags a field that is not in the allowed set', () => {
    const result = v.validate(
      'user.name : "admin" and source.ip : "10.0.0.5" or destination.port > 1024',
      ['user.name', 'source.ip']
    );

    expect(result.unknownFields).toEqual(['destination.port']);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].field).toBe('destination.port');
    expect(result.valid).toBe(false);
  });

  it('recurses into a `not` node', () => {
    const result = v.validate('not event.outcome : "success"', ['event.outcome']);

    expect(result.fields).toContain('event.outcome');
    expect(result.valid).toBe(true);
  });

  it('treats a bare term as having no field', () => {
    const result = v.validate('ransomware', []);

    expect(result.fields).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('uses the AST, not a regex: field-like text inside a quoted value is ignored', () => {
    // The string `user.name : root` sits in the VALUE of the `is` node
    // (arguments[1]); only the field argument (arguments[0] = `message`) is
    // read, so `user.name` must NOT appear as a referenced field.
    const result = v.validate('message : "user.name : root"', ['message']);

    expect(result.fields).toEqual(['message']);
    expect(result.unknownFields).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('returns distinct field names (deduplicated)', () => {
    const result = v.validate(
      'source.ip : "1.1.1.1" or source.ip : "2.2.2.2"',
      ['source.ip']
    );

    expect(result.fields).toEqual(['source.ip']);
    expect(result.fields).toHaveLength(1);
  });

  it('does not throw on invalid KQL and returns an empty, valid result', () => {
    expect(() => v.validate('(', ['x'])).not.toThrow();

    const result = v.validate('(', ['x']);
    expect(result.fields).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});
