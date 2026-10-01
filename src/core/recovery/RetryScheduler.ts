export class RetryScheduler {
  private timer: NodeJS.Timeout | null = null;

  public schedule(callback: () => void, delayMs: number): void {
    this.cancel();
    this.timer = setTimeout(() => {
      this.timer = null;
      callback();
    }, delayMs);
  }

  public cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  public isPending(): boolean {
    return this.timer !== null;
  }
}
