import { SessionRepository } from '../../persistence/repositories/SessionRepository';
import { PersonaRegistry } from '../../personas/PersonaRegistry';
import { CreateSessionRequestDto, SessionResponseDto } from '../../api/dto/SessionDtos';
import { AuditRepository } from '../../persistence/repositories/AuditRepository';

export class SessionService {
  public static async createSession(dto: CreateSessionRequestDto): Promise<SessionResponseDto> {
    const persona = PersonaRegistry.get(dto.personaId);
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const sessionRecord = await SessionRepository.save({
      id: sessionId,
      tenantId: dto.tenantId,
      userId: dto.userId,
      personaId: persona.id,
      personaVersion: persona.version,
      status: 'INITIALIZING',
      createdAt: Date.now(),
      startedAt: Date.now(),
    });

    await AuditRepository.record({
      id: `aud_${Date.now()}`,
      tenantId: dto.tenantId,
      actorType: 'SYSTEM',
      action: 'SESSION_CREATED',
      resource: 'Session',
      resourceId: sessionId,
      details: { personaId: persona.id, version: persona.version },
      timestamp: Date.now(),
    });

    return {
      sessionId: sessionRecord.id,
      tenantId: sessionRecord.tenantId,
      personaId: sessionRecord.personaId,
      personaVersion: sessionRecord.personaVersion,
      status: sessionRecord.status,
      createdAt: sessionRecord.createdAt,
    };
  }

  public static async endSession(sessionId: string, tenantId: string, reason = 'USER_ENDED'): Promise<void> {
    const session = await SessionRepository.findById(sessionId);
    if (session && session.tenantId === tenantId) {
      await SessionRepository.save({
        ...session,
        status: 'ENDED',
        endReason: reason,
        endedAt: Date.now(),
      });

      await AuditRepository.record({
        id: `aud_${Date.now()}`,
        tenantId,
        actorType: 'SYSTEM',
        action: 'SESSION_ENDED',
        resource: 'Session',
        resourceId: sessionId,
        details: { reason },
        timestamp: Date.now(),
      });
    }
  }
}
