import {
  N8nClient,
  CheckAvailabilityInput,
  CheckAvailabilityOutput,
  FindAlternativeTimesInput,
  FindAlternativeTimesOutput,
  CreateAppointmentInput,
  CreateAppointmentOutput,
  LookupAppointmentInput,
  LookupAppointmentOutput,
  RescheduleAppointmentInput,
  RescheduleAppointmentOutput,
  CancelAppointmentInput,
  CancelAppointmentOutput,
} from './N8nClient';

export interface LiveN8nClientOptions {
  baseUrl?: string;
  webhookSecret?: string;
  timeoutMs?: number;
}

/**
 * Production HTTP client communicating with n8n webhook workflows.
 * Implements resilient network timeouts, authentication headers, and standard error normalization.
 */
export class LiveN8nClient implements N8nClient {
  private static instance: LiveN8nClient | null = null;
  private baseUrl: string;
  private webhookSecret: string;
  private timeoutMs: number;

  constructor(options: LiveN8nClientOptions = {}) {
    const rawUrl = options.baseUrl || process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook';
    this.baseUrl = rawUrl.replace(/\/+$/, '');
    this.webhookSecret = options.webhookSecret || process.env.N8N_WEBHOOK_SECRET || '';
    this.timeoutMs = options.timeoutMs || Number(process.env.N8N_TIMEOUT_MS) || 6000;
  }

  public static getInstance(): LiveN8nClient {
    if (!this.instance) {
      this.instance = new LiveN8nClient();
    }
    return this.instance;
  }

  private async postToWebhook<T>(endpoint: string, payload: unknown, fallback: T): Promise<T> {
    const url = `${this.baseUrl}/${endpoint.replace(/^\/+/, '')}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (this.webhookSecret) {
      headers['X-AURA-Secret'] = this.webhookSecret;
      headers['X-N8N-Secret'] = this.webhookSecret;
      headers['Authorization'] = `Bearer ${this.webhookSecret}`;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error(`[LiveN8nClient] HTTP ${response.status} from ${endpoint}: ${errorText}`);
        return {
          ...fallback,
          success: false,
          errorCode: 'UPSTREAM_ERROR',
          message: `Booking service responded with status ${response.status}.`,
        } as T;
      }

      const data = (await response.json()) as T;
      return data;
    } catch (err: any) {
      clearTimeout(timer);
      const isTimeout = err?.name === 'AbortError';
      const errorCode = isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR';
      const message = isTimeout
        ? 'The scheduling service timed out. Please try again in a moment.'
        : 'Unable to reach the scheduling service.';

      console.error(`[LiveN8nClient] Webhook request to ${endpoint} failed (${errorCode}):`, err?.message || err);

      return {
        ...fallback,
        success: false,
        errorCode,
        message,
      } as T;
    }
  }

  public async checkAvailability(input: CheckAvailabilityInput): Promise<CheckAvailabilityOutput> {
    return this.postToWebhook<CheckAvailabilityOutput>('checkAvailability', input, {
      available: false,
      slots: [],
      reason: 'Service unavailable',
    });
  }

  public async findAlternativeTimes(input: FindAlternativeTimesInput): Promise<FindAlternativeTimesOutput> {
    return this.postToWebhook<FindAlternativeTimesOutput>('findAlternativeTimes', input, {
      alternatives: [],
      reason: 'Service unavailable',
    });
  }

  public async createAppointment(input: CreateAppointmentInput): Promise<CreateAppointmentOutput> {
    return this.postToWebhook<CreateAppointmentOutput>('createAppointment', input, {
      success: false,
      emailStatus: 'not_configured',
      errorCode: 'UPSTREAM_ERROR',
      message: 'Could not create appointment at this time.',
    });
  }

  public async lookupAppointment(input: LookupAppointmentInput): Promise<LookupAppointmentOutput> {
    return this.postToWebhook<LookupAppointmentOutput>('lookupAppointment', input, {
      found: false,
      message: 'Could not lookup appointment at this time.',
    });
  }

  public async rescheduleAppointment(input: RescheduleAppointmentInput): Promise<RescheduleAppointmentOutput> {
    return this.postToWebhook<RescheduleAppointmentOutput>('rescheduleAppointment', input, {
      success: false,
      emailStatus: 'not_configured',
      errorCode: 'UPSTREAM_ERROR',
      message: 'Could not reschedule appointment at this time.',
    });
  }

  public async cancelAppointment(input: CancelAppointmentInput): Promise<CancelAppointmentOutput> {
    return this.postToWebhook<CancelAppointmentOutput>('cancelAppointment', input, {
      success: false,
      emailStatus: 'not_configured',
      errorCode: 'UPSTREAM_ERROR',
      message: 'Could not cancel appointment at this time.',
    });
  }
}
