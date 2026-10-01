export interface CreateSessionRequestDto {
  tenantId: string;
  personaId: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface SessionResponseDto {
  sessionId: string;
  tenantId: string;
  personaId: string;
  personaVersion: string;
  status: string;
  createdAt: number;
}

export interface EndSessionRequestDto {
  sessionId: string;
  tenantId: string;
  reason?: string;
}
