export interface TestResult {
  suite: string;
  testName: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

export interface TestSuiteResult {
  suiteName: string;
  total: number;
  passed: number;
  failed: number;
  results: TestResult[];
}

export class TestHarness {
  public static async runTest(
    suite: string,
    testName: string,
    fn: () => Promise<void> | void
  ): Promise<TestResult> {
    const start = performance.now();
    try {
      await fn();
      return {
        suite,
        testName,
        passed: true,
        durationMs: Math.round(performance.now() - start),
      };
    } catch (err: any) {
      return {
        suite,
        testName,
        passed: false,
        durationMs: Math.round(performance.now() - start),
        error: err.message || String(err),
      };
    }
  }

  public static assert(condition: boolean, message: string): void {
    if (!condition) {
      throw new Error(`Assertion Failed: ${message}`);
    }
  }

  public static assertEqual<T>(actual: T, expected: T, message: string): void {
    if (actual !== expected) {
      throw new Error(`Assertion Failed: ${message} (Expected: ${expected}, Actual: ${actual})`);
    }
  }
}
