import { TestHarness, TestResult } from '../TestHarness';
import { AuraError, ErrorCode, UserErrorMapper, ErrorRecoveryPolicy } from '../../core/errors';
import { ToolGateway } from '../../tools/ToolGateway';
import { toFunctionResponse } from '../../tools/FunctionCalling';
import http from 'http';
import type { AddressInfo } from 'net';

export async function runErrorClassificationTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test 1: Classifies network drops as RECOVERABLE
  results.push(
    await TestHarness.runTest('ErrorClassification', 'Classifies socket failure as RECOVERABLE', () => {
      const err = new AuraError({
        code: ErrorCode.TRANSPORT_CONNECTION_CLOSED,
        category: 'RECOVERABLE',
        source: 'TRANSPORT',
        message: 'WebSocket closed abruptly',
        retryable: true,
      });

      TestHarness.assertEqual(err.category, 'RECOVERABLE', 'Transport drop must be categorized as RECOVERABLE');
      TestHarness.assert(err.retryable, 'Transport error must be retryable');
    })
  );

  // Test 2: Natural spoken user error mapping
  results.push(
    await TestHarness.runTest('ErrorClassification', 'Translates technical errors into natural spoken notices', () => {
      const technicalErr = new AuraError({
        code: ErrorCode.TRANSPORT_CONNECTION_CLOSED,
        category: 'RECOVERABLE',
        source: 'TRANSPORT',
        message: 'Socket 1006 abnormal close',
        retryable: true,
      });

      const spoken = UserErrorMapper.toSpokenMessage(technicalErr);
      TestHarness.assert(
        spoken.toLowerCase().includes('connection') || spoken.toLowerCase().includes('reconnecting'),
        'Spoken notice must be conversational, not technical'
      );
    })
  );

  // Test 3: Recovery action determination
  results.push(
    await TestHarness.runTest('ErrorClassification', 'Determines recovery action with backoff delay', () => {
      const retryableErr = new AuraError({
        code: ErrorCode.TRANSPORT_CONNECTION_CLOSED,
        category: 'RECOVERABLE',
        source: 'TRANSPORT',
        message: 'Lost connection',
        retryable: true,
      });

      const action = ErrorRecoveryPolicy.determineAction(retryableErr, 0);
      TestHarness.assertEqual(action.action, 'RETRY', 'Action must be RETRY');
      TestHarness.assert(
        action.delayMs !== undefined && action.delayMs >= 1000 && action.delayMs <= 1500,
        'Attempt 0 should be ~1000ms + jitter'
      );
    })
  );

  // A tool's success payload is handed to the model verbatim by `toFunctionResponse`, which
  // means anything in `data` can be spoken to a caller or written into a transcript. A
  // provider webhook URL commonly carries a secret in its path or query string, so returning
  // it in full would hand a credential to a language model. These tools report the host,
  // which identifies the provider and nothing more.
  results.push(
    await TestHarness.runTest('ErrorClassification', 'a successful tool never returns a provider credential to the model', async () => {
      const secret = 'super-secret-token-abc123';

      // A real provider that accepts, so the *success* payload is what gets inspected.
      // Asserting on a failure payload would pass vacuously: an unreachable provider never
      // puts a URL in the result at all, so the secret could still be leaking on the path
      // that matters and the check would stay green.
      const stub = http.createServer((req, res) => {
        // The provider requires the secret, proving the URL really does carry a credential
        // and that the tool really did exercise a live call.
        if (!String(req.url ?? '').includes(secret)) {
          res.writeHead(401).end();
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id: 'msg_1' }));
      });
      await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', () => resolve()));
      const { port } = stub.address() as AddressInfo;
      const webhook = `http://127.0.0.1:${port}/send/${secret}?token=${secret}`;

      const previousConfirmation = process.env.AURA_CONFIRMATION_WEBHOOK_URL;
      const previousTransfer = process.env.AURA_TRANSFER_WEBHOOK_URL;
      process.env.AURA_CONFIRMATION_WEBHOOK_URL = webhook;
      process.env.AURA_TRANSFER_WEBHOOK_URL = webhook;

      try {
        const confirm = await ToolGateway.execute(
          'sendConfirmation',
          {
            customerName: 'Sam Rivera',
            customerEmail: 'sam@example.com',
            service: 'Haircut',
            date: '2026-01-15',
            time: '10:00',
          },
          { sessionId: 'sess_secret', personaId: 'aura-salon' }
        );

        // Precondition: the tool must have actually succeeded, or there is no success payload
        // to inspect and the assertions below prove nothing.
        TestHarness.assertEqual(
          confirm.success,
          true,
          `the stub provider must have accepted the confirmation (got: ${JSON.stringify(confirm).slice(0, 200)})`
        );
        // The host is retained, so the model can still tell the caller a real provider ran.
        TestHarness.assert(
          String((confirm as any).data?.provider ?? '').includes('127.0.0.1'),
          'the provider identity is still reported'
        );

        // `toFunctionResponse` is the actual boundary where tool output becomes model-visible,
        // so that is what gets inspected rather than the raw result.
        const rendered = JSON.stringify(toFunctionResponse(confirm as any));
        TestHarness.assert(
          !rendered.includes(secret),
          `the webhook secret must never reach the model (rendered: ${rendered.slice(0, 200)})`
        );
        TestHarness.assert(!rendered.includes('token='), 'no query-string credential may reach the model');

        const transfer = await ToolGateway.execute(
          'transferCall',
          { department: 'reception', reason: 'CUSTOMER_REQUEST' },
          { sessionId: 'sess_secret', personaId: 'aura-salon' }
        );
        TestHarness.assertEqual(
          transfer.success,
          true,
          `the stub provider must have accepted the transfer (got: ${JSON.stringify(transfer).slice(0, 200)})`
        );
        const renderedTransfer = JSON.stringify(toFunctionResponse(transfer as any));
        TestHarness.assert(
          !renderedTransfer.includes(secret),
          `the transfer webhook secret must never reach the model (rendered: ${renderedTransfer.slice(0, 200)})`
        );
      } finally {
        if (previousConfirmation === undefined) delete process.env.AURA_CONFIRMATION_WEBHOOK_URL;
        else process.env.AURA_CONFIRMATION_WEBHOOK_URL = previousConfirmation;
        if (previousTransfer === undefined) delete process.env.AURA_TRANSFER_WEBHOOK_URL;
        else process.env.AURA_TRANSFER_WEBHOOK_URL = previousTransfer;
        await new Promise<void>((resolve) => stub.close(() => resolve()));
      }
    })
  );

  return results;
}
