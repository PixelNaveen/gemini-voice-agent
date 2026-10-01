import { DependencyHealth } from './DependencyHealth';

export interface AlertSignal {
  id: string;
  severity: 'WARNING' | 'CRITICAL';
  title: string;
  description: string;
  timestamp: number;
}

/** The subset of the live metrics snapshot that alerting reads. */
export interface AlertableMetrics {
  replacementsFailed: number;
  replacementsSucceeded: number;
  replacementsRequested: number;
  toolFailures: number;
  toolCalls: number;
  rateLimited: number;
  unauthorized: number;
  protocolRejections: number;
}

/**
 * F-21: alerts that can actually fire.
 *
 * This used to read `core/diagnostics/Metrics`, a second metrics system that nothing in the
 * application ever incremented. The rules read counters such as `transport.connection.failed`
 * that no code path wrote, so `evaluateRules()` could only ever return an empty list - the
 * module looked live because it imported a real class, while every threshold it checked was
 * permanently zero. That is the same defect as the unused booking service, one layer up: a
 * test passes against a subsystem that the running system never exercises.
 *
 * It now evaluates the snapshot the server actually records, so a threshold crossing is a real
 * event, and a dependency that reports itself unhealthy raises a signal without anyone having
 * to remember to look.
 */
export class AlertManager {
  private static alerts: AlertSignal[] = [];

  /**
   * Evaluates the rules and returns the alerts raised by *this* evaluation.
   *
   * It returns the new signals rather than the accumulated history. Returning history from a
   * method whose name says "evaluate" makes it impossible to tell what is happening now from
   * what happened earlier, and it means an operator reading the result cannot act on it.
   * Use `getAlerts()` for the retained history.
   */
  public static evaluateRules(metrics: AlertableMetrics): AlertSignal[] {
    const raised: AlertSignal[] = [];

    // Replacement connections are the self-healing path for a dropped live session. If they
    // keep failing, callers are being dropped silently, so this is the alert that matters most.
    if (metrics.replacementsFailed >= 3) {
      raised.push(
        AlertManager.signal(
          'CRITICAL',
          'Live session recovery is failing',
          `${metrics.replacementsFailed} replacement connections failed against ` +
            `${metrics.replacementsSucceeded} successful. Callers are being dropped without recovery.`
        )
      );
    } else if (metrics.replacementsRequested > 0 && metrics.replacementsSucceeded === 0) {
      raised.push(
        AlertManager.signal(
          'WARNING',
          'Live session recovery is not succeeding',
          `${metrics.replacementsRequested} replacement connections were requested and none succeeded.`
        )
      );
    }

    // A tool failure rate is a fabrication risk before it is an availability problem: a
    // failed tool that the agent narrates as success is worse than one that errors cleanly.
    if (metrics.toolCalls >= 10) {
      const failureRate = metrics.toolFailures / metrics.toolCalls;
      if (failureRate > 0.5) {
        raised.push(
          AlertManager.signal(
            'CRITICAL',
            'Most tool calls are failing',
            `${metrics.toolFailures} of ${metrics.toolCalls} tool calls failed ` +
              `(${Math.round(failureRate * 100)}%).`
          )
        );
      }
    }

    // A rising rejection rate means something is probing the relay.
    const authRejections = metrics.unauthorized + metrics.rateLimited;
    if (authRejections >= 10) {
      raised.push(
        AlertManager.signal(
          'WARNING',
          'Elevated rejected requests',
          `${authRejections} requests were rejected (${metrics.unauthorized} unauthorized, ` +
            `${metrics.rateLimited} rate limited).`
        )
      );
    }

    for (const dep of DependencyHealth.getAll()) {
      if (dep.status === 'DOWN' || dep.status === 'DEGRADED') {
        raised.push(
          AlertManager.signal(
            dep.status === 'DOWN' ? 'CRITICAL' : 'WARNING',
            `Dependency ${dep.name} is ${dep.status}`,
            dep.message ?? `${dep.name} reported ${dep.status} and readiness is affected.`
          )
        );
      }
    }

    AlertManager.alerts = [...raised, ...AlertManager.alerts].slice(0, 50);
    return [...raised];
  }

  public static getAlerts(): AlertSignal[] {
    return [...AlertManager.alerts];
  }

  public static clear(): void {
    AlertManager.alerts = [];
  }

  private static signal(severity: AlertSignal['severity'], title: string, description: string): AlertSignal {
    return { id: `alt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, severity, title, description, timestamp: Date.now() };
  }
}
