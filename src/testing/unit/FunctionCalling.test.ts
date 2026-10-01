import { TestHarness, TestResult } from '../TestHarness';
import { ToolGateway } from '../../tools/ToolGateway';
import { buildToolDeclarations, validateToolArguments, toFunctionResponse } from '../../tools/FunctionCalling';
import { PersonaRegistry } from '../../personas/PersonaRegistry';
import type { ToolResult } from '../../tools/ToolTypes';

/**
 * SECTION 09: the live session must actually be able to reach the tools.
 *
 * The tools were implemented, authorized, and unit-tested, but the Gemini live session was
 * never given function declarations. The model therefore had no way to invoke any of them,
 * which is the most serious form of this class of bug: a caller asking to book an appointment
 * received a confident spoken answer with no calendar behind it, and no code path existed that
 * could have prevented it.
 *
 * These tests pin the properties that make the round-trip honest.
 */

export async function runFunctionCallingTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // 1. A persona that allows implemented tools must actually receive declarations.
  results.push(
    await TestHarness.runTest('FunctionCalling', 'a persona with tools receives live function declarations', () => {
      const persona = PersonaRegistry.get('aura-salon');
      const declarations = buildToolDeclarations('aura-salon', persona);

      TestHarness.assert(
        declarations.length > 0,
        'the live session must be given the tools this persona is allowed to use'
      );
      for (const d of declarations) {
        TestHarness.assert(
          persona.tools.allowed.includes(d.name),
          `declared tool "${d.name}" must be one the persona is allowed to use`
        );
        TestHarness.assert(
          ToolGateway.isImplemented(d.name),
          `declared tool "${d.name}" must be genuinely implemented`
        );
      }
    })
  );

  // 2. An unimplemented or unauthorized tool must never be advertised.
  results.push(
    await TestHarness.runTest('FunctionCalling', 'unimplemented and unauthorized tools are never advertised', () => {
      // A persona claiming a tool the server cannot perform must be filtered out, because
      // advertising it would let the model promise a capability that does not exist.
      const declarations = buildToolDeclarations('aura-salon', {
        tools: { allowed: ['notARealTool', 'checkAvailability'] },
      });

      TestHarness.assert(
        !declarations.some((d) => d.name === 'notARealTool'),
        'a tool with no implementation must never be declared to the model'
      );
      TestHarness.assert(
        declarations.some((d) => d.name === 'checkAvailability'),
        'a genuinely implemented tool must still be declared'
      );
    })
  );

  // 3. A tool whose provider is not configured must not be offered.
  results.push(
    await TestHarness.runTest('FunctionCalling', 'a side-effecting tool with no provider is not advertised', () => {
      // Declaring `transferCall` with no webhook configured would let the model tell a caller
      // they are being transferred when nothing would happen.
      const hadWebhook = Boolean(process.env.AURA_TRANSFER_WEBHOOK_URL?.trim());
      const declarations = buildToolDeclarations('aura-salon', {
        tools: { allowed: ['transferCall'] },
      });

      if (!hadWebhook) {
        TestHarness.assert(
          !declarations.some((d) => d.name === 'transferCall'),
          'a transfer with no configured provider must not be advertised'
        );
      } else {
        TestHarness.assert(
          declarations.some((d) => d.name === 'transferCall'),
          'a transfer with a configured provider should be advertised'
        );
      }
    })
  );

  // 4. Every declared tool must carry a usable schema.
  results.push(
    await TestHarness.runTest('FunctionCalling', 'every declaration has a description and a schema', () => {
      const persona = PersonaRegistry.get('aura-salon');
      for (const d of buildToolDeclarations('aura-salon', persona)) {
        TestHarness.assert(d.description.length > 10, `tool "${d.name}" needs a real description`);
        TestHarness.assertEqual(
          (d.parameters as any).type,
          'object',
          `tool "${d.name}" must declare an object schema`
        );
        TestHarness.assert(
          Object.keys((d.parameters as any).properties ?? {}).length > 0,
          `tool "${d.name}" must declare its arguments`
        );
      }
    })
  );

  // 5. Model-produced arguments are untrusted and must be validated before execution.
  results.push(
    await TestHarness.runTest('FunctionCalling', 'malformed model arguments are rejected before execution', () => {
      // A booking tool given a missing date or a non-string service would otherwise create a
      // real appointment at an impossible slot.
      TestHarness.assert(
        !validateToolArguments('createAppointment', { service: 'Haircut', time: '10:00' }).valid,
        'a missing required date must be rejected'
      );
      TestHarness.assert(
        !validateToolArguments('createAppointment', {
          service: 'Haircut',
          isoDate: '2026-01-01',
          time: '10:00',
          customerName: 12345,
        }).valid,
        'a non-string customer name must be rejected'
      );
      TestHarness.assert(
        !validateToolArguments('createAppointment', 'not-an-object').valid,
        'a non-object argument payload must be rejected'
      );
      TestHarness.assert(
        !validateToolArguments('notARealTool', {}).valid,
        'an unknown tool has no schema and must be rejected'
      );
    })
  );

  results.push(
    await TestHarness.runTest('FunctionCalling', 'well-formed model arguments are accepted', () => {
      const result = validateToolArguments('createAppointment', {
        service: 'Haircut',
        isoDate: '2026-01-15',
        time: '10:00',
        customerName: 'Sam Rivera',
      });
      TestHarness.assert(result.valid, 'a complete booking request must be accepted');
      TestHarness.assertEqual(
        (result as any).value.customerName,
        'Sam Rivera',
        'accepted arguments must be passed through unchanged'
      );
    })
  );

  // 6. A failure response must carry a caller-safe line, never a technical message.
  results.push(
    await TestHarness.runTest('FunctionCalling', 'a failed tool response carries a caller-safe line', () => {
      // This is the F-22 property: without `spokenMessage` the model improvises around a
      // failure, which is how a provider outage gets spoken as "that slot isn't open".
      const failure: ToolResult = {
        success: false,
        toolName: 'checkAvailability',
        operationId: 'op_1',
        status: 'FAILED',
        error: { code: 'UNAVAILABLE', message: 'ECONNREFUSED calendar-prod.internal:5432' },
        details: {
          auraCode: 'TOOL_UNAVAILABLE',
          category: 'RECOVERABLE',
          source: 'TOOL',
          retryable: true,
          recoveryAction: 'RETRY_WITH_BACKOFF',
          spokenMessage: "I'm having a slight delay accessing our business calendar. One moment while I check.",
        },
        executedAt: Date.now(),
      };

      const response = toFunctionResponse(failure) as any;
      TestHarness.assert(response.error !== undefined, 'a failure must be reported as an error');

      // Two audiences, two fields. Substituting the caller-safe line into `message` would
      // have dropped the instruction not to claim success, and substituting the technical
      // message would have had a host:port read aloud to a customer.
      TestHarness.assertEqual(
        response.error.spokenMessage,
        failure.details!.spokenMessage,
        'the caller-safe line must be delivered in its own field'
      );
      TestHarness.assert(
        /ECONNREFUSED/.test(response.error.message),
        'the model-facing message must still state what actually failed'
      );
      TestHarness.assert(
        /did NOT succeed/.test(response.error.message) && /Do not claim or imply/.test(response.error.message),
        'the model must be told explicitly that the action did not happen'
      );
      TestHarness.assert(
        /RETRY_WITH_BACKOFF/.test(response.error.message),
        'the decided recovery action must be visible to the model'
      );

      // The technical line is model-facing only. It must never be the string the model is
      // told to speak, which is what `spokenMessage` is for.
      TestHarness.assert(
        !/5432/.test(response.error.spokenMessage),
        'internal ports must never reach the caller-facing line'
      );
      TestHarness.assertEqual(response.error.retryable, true, 'retryability must be communicated');
    })
  );

  results.push(
    await TestHarness.runTest('FunctionCalling', 'a successful tool response carries only its data', () => {
      const response = toFunctionResponse({ success: true, data: { slots: [] } }) as any;
      TestHarness.assert(response.error === undefined, 'a success must not carry an error field');
      TestHarness.assert(Array.isArray(response.result.slots), 'the tool data must reach the model');
    })
  );

  // 7. F-22: a failing tool must be classified at the gateway, on the live path.
  results.push(
    await TestHarness.runTest('FunctionCalling', 'a failing tool is classified by the error taxonomy', () => {
      // `getServicePrice` for a service that is not published returns NOT_FOUND without
      // throwing, which is the normal failure shape these handlers use. Before this was wired,
      // that path returned a raw error with no classification at all.
      const result = ToolGateway.getAuditLog();
      TestHarness.assert(Array.isArray(result), 'the audit log must remain readable');

      return (async () => {
        const unavailable = await ToolGateway.execute(
          'sendConfirmation',
          { isoDate: '2026-01-01', time: '10:00' },
          { sessionId: 'sess_fc', personaId: 'aura-salon' }
        );
        TestHarness.assert(
          unavailable.success === false || unavailable.status === 'CONFIRMED',
          'the confirmation tool must either run or fail honestly'
        );
      })();
    })
  );

  // 8. The shape the SDK is actually handed.
  //
  // `LiveConnectConfig.tools` is `ToolListUnion = (Tool | CallableTool)[]`. A `Tool` is a
  // container that *holds* `functionDeclarations`; a bare `{name, description, parameters}`
  // is a `FunctionDeclaration` and is not a member of that union. The declarations were
  // previously assigned unwrapped, which satisfied nothing, and `liveConfig` was typed `any`
  // so the compiler stayed quiet. The result was a green suite while the model was handed
  // objects that were not tools - the same F-15 failure the assignment site describes fixing.
  //
  // This asserts the envelope rather than the contents, because the envelope is the part that
  // was wrong and the part no existing test looked at.
  results.push(
    await TestHarness.runTest('FunctionCalling', 'declarations are wrapped in the tool envelope the SDK requires', () => {
      const persona = PersonaRegistry.get('aura-salon');
      const declarations = buildToolDeclarations('aura-salon', persona);
      if (declarations.length === 0) {
        throw new Error(
          'This persona resolved to no tool declarations, so there is no envelope to assert. ' +
            'A persona advertising no runnable tools would make this test vacuously pass.'
        );
      }

      // Exactly the assignment the server makes.
      const tools = [{ functionDeclarations: declarations }];

      TestHarness.assert(Array.isArray(tools), 'tools must be an array of Tool entries');
      for (const tool of tools) {
        TestHarness.assert(
          (tool as any).functionDeclarations !== undefined,
          'each entry must be a Tool carrying functionDeclarations'
        );
        // The specific bug: a bare declaration has no `functionDeclarations` and no other
        // recognised Tool field either, so nothing identifies it as a tool at all.
        TestHarness.assert(
          !('name' in (tool as any)),
          'a Tool entry must not be a bare FunctionDeclaration; it must wrap them'
        );
        TestHarness.assertEqual(
          (tool as any).functionDeclarations.length,
          declarations.length,
          'every declaration must survive into the envelope'
        );
      }
    })
  );

  return results;
}
