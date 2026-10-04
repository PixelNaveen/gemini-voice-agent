import { N8nClient } from './N8nClient';
import { MockN8nClient } from './MockN8nClient';
import { LiveN8nClient } from './LiveN8nClient';

/**
 * Factory providing the active N8nClient instance.
 * Driven by environment variable N8N_MODE ('mock' | 'live', default: 'mock').
 * When N8N_MODE=live, routes all calendar tool execution directly to n8n webhooks.
 */
let customClient: N8nClient | null = null;

export function getN8nClient(): N8nClient {
  if (customClient) {
    return customClient;
  }
  const mode = (process.env.N8N_MODE || 'mock').trim().toLowerCase();
  if (mode === 'live') {
    return LiveN8nClient.getInstance();
  }
  return MockN8nClient.getInstance();
}

/**
 * Allows injecting a custom or mock N8nClient instance during testing.
 */
export function setN8nClient(client: N8nClient | null): void {
  customClient = client;
}
