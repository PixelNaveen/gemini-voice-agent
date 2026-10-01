import { SessionRecord } from '../models/Session';
import { ConnectionRecord } from '../models/Connection';

export class SessionRepository {
  private static sessions: Map<string, SessionRecord> = new Map();
  private static connections: Map<string, ConnectionRecord> = new Map();

  public static async findById(id: string): Promise<SessionRecord | null> {
    const s = this.sessions.get(id);
    return s ? { ...s } : null;
  }

  public static async save(session: SessionRecord): Promise<SessionRecord> {
    this.sessions.set(session.id, { ...session });
    return session;
  }

  public static async recordConnection(conn: ConnectionRecord): Promise<ConnectionRecord> {
    this.connections.set(conn.id, { ...conn });
    return conn;
  }

  public static async getConnectionsForSession(sessionId: string): Promise<ConnectionRecord[]> {
    return Array.from(this.connections.values()).filter((c) => c.sessionId === sessionId);
  }
}
