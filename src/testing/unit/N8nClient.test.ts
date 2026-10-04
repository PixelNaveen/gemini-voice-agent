import { TestHarness, TestResult } from '../TestHarness';
import { getN8nClient, setN8nClient } from '../../tools/n8n/N8nClientFactory';
import { MockN8nClient } from '../../tools/n8n/MockN8nClient';
import { LiveN8nClient } from '../../tools/n8n/LiveN8nClient';
import http from 'http';

export async function runN8nClientTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test 1: Factory mode selection (mock vs live)
  results.push(
    await TestHarness.runTest('N8nClient', 'N8nClientFactory returns MockN8nClient by default and LiveN8nClient in live mode', () => {
      // 1. Default (mock)
      delete process.env.N8N_MODE;
      setN8nClient(null);
      const defaultClient = getN8nClient();
      TestHarness.assert(defaultClient instanceof MockN8nClient, 'Default client must be MockN8nClient');

      // 2. Explicit 'mock'
      process.env.N8N_MODE = 'mock';
      const mockClient = getN8nClient();
      TestHarness.assert(mockClient instanceof MockN8nClient, 'Explicit mock mode must return MockN8nClient');

      // 3. Explicit 'live'
      process.env.N8N_MODE = 'live';
      const liveClient = getN8nClient();
      TestHarness.assert(liveClient instanceof LiveN8nClient, 'Live mode must return LiveN8nClient');

      // Cleanup
      process.env.N8N_MODE = 'mock';
      setN8nClient(null);
    })
  );

  // Test 2: LiveN8nClient successfully communicates with HTTP webhook server
  results.push(
    await TestHarness.runTest('N8nClient', 'LiveN8nClient delivers payload to webhook and parses structured JSON response', async () => {
      let receivedHeaderSecret = '';
      let receivedBody: any = null;

      const mockServer = http.createServer((req, res) => {
        receivedHeaderSecret = (req.headers['x-aura-secret'] as string) || '';
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            receivedBody = JSON.parse(body);
          } catch {
            receivedBody = null;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: true,
              confirmationCode: 'N8N-TEST-123',
              emailStatus: 'sent',
              message: 'Appointment booked successfully via n8n',
            })
          );
        });
      });

      await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', () => resolve()));
      const port = (mockServer.address() as any).port;

      try {
        const client = new LiveN8nClient({
          baseUrl: `http://127.0.0.1:${port}/webhook`,
          webhookSecret: 'secret-token-123',
          timeoutMs: 3000,
        });

        const output = await client.createAppointment({
          personaId: 'aura-salon',
          sessionId: 'sess_live_1',
          requestId: 'req_live_1',
          serviceId: 'haircut',
          date: '2026-10-15',
          start: '14:00',
          customerName: 'Sam Live',
          email: 'sam@example.com',
        });

        TestHarness.assert(output.success === true, 'Webhook response must have success=true');
        TestHarness.assertEqual(output.confirmationCode, 'N8N-TEST-123', 'Confirmation code must match response');
        TestHarness.assertEqual(output.emailStatus, 'sent', 'Email status must be sent');
        TestHarness.assertEqual(receivedHeaderSecret, 'secret-token-123', 'Webhook secret header must be forwarded');
        TestHarness.assertEqual(receivedBody?.customerName, 'Sam Live', 'Customer name must be in payload');
      } finally {
        await new Promise<void>((resolve) => mockServer.close(() => resolve()));
      }
    })
  );

  // Test 3: LiveN8nClient graceful timeout & error handling
  results.push(
    await TestHarness.runTest('N8nClient', 'LiveN8nClient returns safe normalized error on timeout or server fault', async () => {
      // 1. Test timeout
      const slowServer = http.createServer((_req, _res) => {
        // Deliberately do not respond to force client timeout
      });
      await new Promise<void>((resolve) => slowServer.listen(0, '127.0.0.1', () => resolve()));
      const slowPort = (slowServer.address() as any).port;

      try {
        const timeoutClient = new LiveN8nClient({
          baseUrl: `http://127.0.0.1:${slowPort}/webhook`,
          timeoutMs: 150, // fast timeout for test
        });

        const timeoutRes = await timeoutClient.checkAvailability({
          personaId: 'aura-salon',
          date: '2026-10-15',
          time: '14:00',
        });

        TestHarness.assert(timeoutRes.available === false, 'Timed out availability check must return available=false');
        TestHarness.assert(Boolean(timeoutRes.reason), 'Reason must explain the timeout failure');
      } finally {
        await new Promise<void>((resolve) => slowServer.close(() => resolve()));
      }

      // 2. Test unreachable server (network failure)
      const deadClient = new LiveN8nClient({
        baseUrl: 'http://127.0.0.1:49999/webhook', // closed port
        timeoutMs: 500,
      });

      const deadRes = await deadClient.createAppointment({
        personaId: 'aura-salon',
        sessionId: 'sess_dead_1',
        requestId: 'req_dead_1',
        serviceId: 'haircut',
        date: '2026-10-15',
        start: '14:00',
        customerName: 'Sam Dead',
        email: 'sam@example.com',
      });

      TestHarness.assert(deadRes.success === false, 'Unreachable webhook must return success=false');
      TestHarness.assertEqual(deadRes.emailStatus, 'not_configured', 'Must not assume email sent on error');
      TestHarness.assert(deadRes.errorCode === 'NETWORK_ERROR' || deadRes.errorCode === 'UPSTREAM_ERROR', 'Must return standard error code');
    })
  );

  return results;
}
