export interface UIState {
  activeTab: 'voice' | 'dashboard' | 'customers' | 'appointments' | 'settings';
  isSidebarOpen: boolean;
  isMemoryModalOpen: boolean;
  isPersonaModalOpen: boolean;
  isDiagnosticsOpen: boolean;
  theme: 'dark' | 'light' | 'system';
}

export class UIStore {
  private static state: UIState = {
    activeTab: 'voice',
    isSidebarOpen: true,
    isMemoryModalOpen: false,
    isPersonaModalOpen: false,
    isDiagnosticsOpen: false,
    theme: 'dark',
  };

  private static listeners: ((state: UIState) => void)[] = [];

  public static getState(): UIState {
    return { ...this.state };
  }

  public static setState(partial: Partial<UIState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  public static subscribe(listener: (state: UIState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}
