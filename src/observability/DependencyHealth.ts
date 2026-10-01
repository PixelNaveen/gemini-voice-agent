export type DependencyStatus = 'UNKNOWN' | 'HEALTHY' | 'DEGRADED' | 'DOWN';

export interface DependencyCheck {
  name: string;
  status: DependencyStatus;
  lastCheckedAt: number;
  message?: string;
}

/**
 * F-21: dependency health that reports what has actually been observed.
 *
 * This class previously shipped a registry pre-seeded with four entries all marked `HEALTHY`,
 * including `AudioContext` - a browser-side concern a server process cannot observe at all.
 * `isSystemReady()` then returned `true` because the map said so, which is worse than having
 * no health check: it manufactures confidence in exactly the situation where confidence is
 * most damaging, because a dependency has failed.
 *
 * The rule now is that unobserved is not healthy. A dependency starts `UNKNOWN`, and only
 * something that genuinely exercised it may report `HEALTHY`. `isSystemReady()` is therefore
 * fail-closed: an unobserved required dependency is not ready.
 */
export class DependencyHealth {
  /**
   * Dependencies the process genuinely needs in order to serve a call honestly.
   *
   * `AudioContext` is deliberately absent: it lives in the browser, so a server reporting on
   * it would be reporting on something it cannot see.
   */
  private static readonly REQUIRED = ['CalendarStore', 'GeminiLive'];

  private static dependencies: Map<string, DependencyCheck> = new Map();

  private static ensure(name: string): DependencyCheck {
    let existing = this.dependencies.get(name);
    if (!existing) {
      // Unobserved. Starting at HEALTHY is the bug this class had.
      existing = { name, status: 'UNKNOWN', lastCheckedAt: 0 };
      this.dependencies.set(name, existing);
    }
    return existing;
  }

  /** Records the result of a real check. Only the caller of the dependency may call this. */
  public static updateStatus(name: string, status: DependencyStatus, message?: string): void {
    this.dependencies.set(name, {
      name,
      status,
      message,
      lastCheckedAt: Date.now(),
    });
  }

  public static getAll(): DependencyCheck[] {
    return Array.from(this.dependencies.values());
  }

  public static get(name: string): DependencyCheck | undefined {
    const found = this.dependencies.get(name);
    return found ? { ...found } : undefined;
  }

  /**
   * Ready only when every required dependency has been *observed* healthy.
   *
   * `UNKNOWN` is not ready. A process that has just started, or whose calendar journal it
   * cannot read, must not report itself ready and accept bookings it cannot keep.
   */
  public static isSystemReady(): boolean {
    return this.REQUIRED.every((name) => this.dependencies.get(name)?.status === 'HEALTHY');
  }

  /** The dependencies currently preventing readiness, for the health payload. */
  public static blocking(): DependencyCheck[] {
    return this.REQUIRED.filter((name) => this.dependencies.get(name)?.status !== 'HEALTHY')
      .map((name) => ({ ...this.ensure(name) }));
  }

  /** Test seam: forgets every observation. */
  public static reset(): void {
    this.dependencies = new Map();
  }
}
