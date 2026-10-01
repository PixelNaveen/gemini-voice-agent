import { useState, useEffect } from 'react';
import { ServerStore, ServerState } from '../../../state/server/ServerStore';

export function useServerState(tenantId = 'tenant_aura_salon') {
  const [serverState, setServerState] = useState<ServerState>(ServerStore.getState());

  useEffect(() => {
    const unsubscribe = ServerStore.subscribe((newState) => {
      setServerState(newState);
    });

    if (!serverState.lastFetchedAt && !serverState.isLoading) {
      ServerStore.refresh(tenantId);
    }

    return unsubscribe;
  }, [tenantId]);

  const refresh = async () => {
    await ServerStore.refresh(tenantId);
  };

  return {
    ...serverState,
    refresh,
  };
}
