import { TestResult, TestSuiteResult } from './TestHarness';import { runAuraSessionManagerTests } from './unit/AuraSessionManager.test';
import { runRecoveryAuthorityTests } from './unit/RecoveryAuthority.test';
import { runConnectionAuthorityTests } from './unit/ConnectionAuthority.test';
import { runGeminiResumptionTests } from './unit/GeminiResumption.test';
import { runGoAwayRenewalTests } from './unit/GoAwayRenewal.test';
import { runGeminiWatchdogTests } from './unit/GeminiWatchdog.test';
import { runGeminiProjectPoolTests } from './unit/GeminiProjectPool.test';
import { runLiveProtocolSecurityTests } from './unit/LiveProtocolSecurity.test';
import { runBusinessTruthTests } from './unit/BusinessTruthPrompt.test';
import { runSessionGuardTests } from './unit/SessionGuard.test';
import { runDateTimeResolverTests } from './unit/DateTimeResolver.test';
import { runPersonaValidationTests } from './unit/PersonaValidation.test';
import { runErrorClassificationTests } from './unit/ErrorClassification.test';
import { runAuthorityHardeningTests } from './unit/AuthorityHardening.test';
import { runMemoryBoundsTests, runSessionContinuityTests } from './unit/MemoryBounds.test';
import { runOutboundPromptQueueTests } from './unit/OutboundPromptQueue.test';
import { runNameExtractionTests } from './unit/NameExtraction.test';
import { runFunctionCallingTests } from './unit/FunctionCalling.test';
import { runBookingConcurrencyTests } from './integration/BookingConcurrency.test';
import { runTenantIsolationTests } from './integration/TenantIsolation.test';
import { runObservabilityTests } from './unit/Observability.test';

export interface FullTestReport {
  timestamp: number;
  totalTests: number;
  totalPassed: number;
  totalFailed: number;
  allPassed: boolean;
  suites: TestSuiteResult[];
}

export class TestRunner {
  public static async runAll(): Promise<FullTestReport> {
    console.log('[TestRunner] Starting full AURA Quality Engineering verification suite...');
    const startTime = performance.now();

    const suiteRunners = [
      { name: 'Unit: AuraSessionManager & State Machine', fn: runAuraSessionManagerTests },
      { name: 'Unit: RecoveryAuthority & Resilience', fn: runRecoveryAuthorityTests },
      { name: 'Unit: Connection Authority & Handoff Races', fn: runConnectionAuthorityTests },
      { name: 'Unit: Gemini Resumption & Fencing', fn: runGeminiResumptionTests },
      { name: 'Unit: GoAway Proactive Renewal', fn: runGoAwayRenewalTests },
      { name: 'Unit: Gemini Connection Watchdog', fn: runGeminiWatchdogTests },
      { name: 'Unit: Gemini Project Pool & Health', fn: runGeminiProjectPoolTests },
      { name: 'Unit: Live Protocol, Security & Observability', fn: runLiveProtocolSecurityTests },
      { name: 'Unit: Business Truth & Server Prompt Authority', fn: runBusinessTruthTests },
      { name: 'Unit: SessionGuard & Generation', fn: runSessionGuardTests },
      { name: 'Unit: DateTime & Time Resolvers', fn: runDateTimeResolverTests },
      { name: 'Unit: Persona Schema Validation', fn: runPersonaValidationTests },
      { name: 'Unit: Error Classification & Backoff', fn: runErrorClassificationTests },
      { name: 'Unit: Memory Bounds & Sensitive-Field Filtering', fn: runMemoryBoundsTests },
      { name: 'Unit: Session Continuity Across Refresh (F-11)', fn: runSessionContinuityTests },
      { name: 'Unit: Outbound Prompt Queue Across Recovery', fn: runOutboundPromptQueueTests },
      { name: 'Unit: Caller Name Extraction', fn: runNameExtractionTests },
      { name: 'Unit: Live Function Calling & Error Taxonomy (F-22)', fn: runFunctionCallingTests },
      { name: 'Unit: Authority Hardening (Errors, Knowledge, Requirements)', fn: runAuthorityHardeningTests },
      { name: 'Unit: Honest Observability & Error Routing (F-21/F-22)', fn: runObservabilityTests },
      { name: 'Integration: Booking Idempotency & Concurrency', fn: runBookingConcurrencyTests },
      { name: 'Integration: Tenant Isolation & Cache Boundary', fn: runTenantIsolationTests },
    ];

    const suites: TestSuiteResult[] = [];
    let totalTests = 0;
    let totalPassed = 0;
    let totalFailed = 0;

    for (const suite of suiteRunners) {
      try {
        const results = await suite.fn();
        const passed = results.filter((r) => r.passed).length;
        const failed = results.filter((r) => !r.passed).length;

        totalTests += results.length;
        totalPassed += passed;
        totalFailed += failed;

        suites.push({
          suiteName: suite.name,
          total: results.length,
          passed,
          failed,
          results,
        });
      } catch (err: any) {
        console.error(`[TestRunner] Suite failed unexpectedly: ${suite.name}`, err);
        suites.push({
          suiteName: suite.name,
          total: 1,
          passed: 0,
          failed: 1,
          results: [
            {
              suite: suite.name,
              testName: 'Execution Failure',
              passed: false,
              durationMs: 0,
              error: err.message || String(err),
            },
          ],
        });
        totalTests += 1;
        totalFailed += 1;
      }
    }

    const duration = Math.round(performance.now() - startTime);
    console.log(`[TestRunner] Completed ${totalTests} tests across ${suites.length} suites in ${duration}ms (Passed: ${totalPassed}, Failed: ${totalFailed})`);

    return {
      timestamp: Date.now(),
      totalTests,
      totalPassed,
      totalFailed,
      allPassed: totalFailed === 0,
      suites,
    };
  }

  /**
   * Prints a human-readable report and returns the failures in a stable shape.
   * `npm test` used to swallow error text entirely, which made a red suite impossible
   * to diagnose without instrumenting by hand.
   */
  public static printReport(report: FullTestReport): TestResult[] {
    const failures: TestResult[] = [];

    console.log('\n================ AURA QUALITY ENGINEERING REPORT ================');
    for (const suite of report.suites) {
      const badge = suite.failed === 0 ? 'PASS' : 'FAIL';
      console.log(
        `  [${badge}] ${suite.suiteName}  (${suite.passed}/${suite.total})` +
          (suite.failed > 0 ? `  failed: ${suite.failed}` : '')
      );
      for (const r of suite.results) {
        if (r.passed) continue;
        failures.push(r);
        console.log(`         x ${r.testName}`);
        console.log(`           ${r.error ?? 'unknown failure'}`);
      }
    }
    console.log('------------------------------------------------------------------');
    console.log(
      `  TOTAL: ${report.totalTests}   PASSED: ${report.totalPassed}   FAILED: ${report.totalFailed}   ` +
        `(${new Date(report.timestamp).toISOString()})`
    );
    console.log(report.allPassed ? '  RESULT: ALL TESTS PASSED\n' : '  RESULT: FAILURES PRESENT\n');
    console.log('==================================================================\n');

    return failures;
  }
}
