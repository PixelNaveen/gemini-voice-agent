import { TestHarness, TestResult } from '../TestHarness';
import { PersonaRegistry } from '../../personas/PersonaRegistry';
import { PersonaValidator } from '../../personas/schema/persona.validator';

export async function runPersonaValidationTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test 1: All registered personas conform to schema
  results.push(
    await TestHarness.runTest('PersonaValidation', 'Validates all 7 industry presets against schema', () => {
      const all = PersonaRegistry.list();
      TestHarness.assert(all.length >= 7, 'Expected at least 7 industry personas in registry');

      for (const persona of all) {
        const validation = PersonaValidator.validate(persona);
        TestHarness.assert(validation.valid, `Persona ${persona.id} must be schema-valid: ${validation.errors?.join(', ')}`);
      }
    })
  );

  // Test 2: Catches missing required identity fields
  results.push(
    await TestHarness.runTest('PersonaValidation', 'Rejects persona missing required fields', () => {
      const invalidPersona: any = {
        id: 'broken-persona',
        version: '1.0.0',
        identity: {}, // Missing name and role
      };

      const validation = PersonaValidator.validate(invalidPersona);
      TestHarness.assert(!validation.valid, 'PersonaValidator must reject malformed persona definition');
    })
  );

  // Test 3: The registry must be able to say "no" as well as fall back.
  //
  // `get()` deliberately falls back to `aura-salon` so internal display paths never throw. That
  // fallback is silent, which is precisely why it is unsafe to apply to a caller-supplied
  // persona: a caller asking for a persona that does not exist would be connected to a
  // different business, speaking that business's name, hours and prices, while the UI showed
  // the persona it asked for. The server now refuses an unknown id on init and on reconnect,
  // and it can only do that because `has()` distinguishes unknown from defaulted.
  results.push(
    await TestHarness.runTest('PersonaValidation', 'distinguishes an unknown persona from the default fallback', () => {
      const known = PersonaRegistry.list()[0];
      TestHarness.assert(PersonaRegistry.has(known.id), `registered persona "${known.id}" must be reported as present`);

      // Every id the registry can produce must satisfy `has()`, or the server would reject
      // legitimate callers.
      for (const persona of PersonaRegistry.list()) {
        TestHarness.assert(PersonaRegistry.has(persona.id), `"${persona.id}" must resolve`);
        TestHarness.assertEqual(
          PersonaRegistry.get(persona.id).id,
          persona.id,
          'get() must return the persona that was asked for, not a substitute'
        );
      }

      for (const unknown of ['does-not-exist', 'AURA-SALON', 'aura-salon ', '', 'apex-dental2']) {
        TestHarness.assert(
          !PersonaRegistry.has(unknown),
          `"${unknown}" is not a registered persona and must be reported absent`
        );
        // The fallback still exists - that is by design - which is exactly why the server
        // must check `has()` before trusting a caller-supplied id.
        TestHarness.assertEqual(
          PersonaRegistry.get(unknown).id,
          'aura-salon',
          'get() keeps its documented fallback for internal display paths'
        );
      }
    })
  );

  return results;
}
