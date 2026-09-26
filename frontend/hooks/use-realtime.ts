'use client';

import * as React from 'react';
import { realtimeClient } from '@/lib/realtime-client';
import { useAuth } from '@/hooks/use-auth';

export function useRealtime() {
  const { user, token } = useAuth();
  const [isConnected, setIsConnected] = React.useState(realtimeClient.isConnected());

  React.useEffect(() => {
    if (token) {
      realtimeClient.connect(token);
    } else {
      const storedToken = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (storedToken) {
        realtimeClient.connect(storedToken);
      }
    }

    const unsubConnect = realtimeClient.on('connect', () => setIsConnected(true));
    const unsubDisconnect = realtimeClient.on('disconnect', () => setIsConnected(false));

    return () => {
      unsubConnect();
      unsubDisconnect();
    };
  }, [user]);

  const subscribe = React.useCallback((channel: string, callback: (event: any) => void) => {
    return realtimeClient.subscribe(channel, callback);
  }, []);

  const sendTyping = React.useCallback((channel: string, isTyping: boolean) => {
    realtimeClient.sendTyping(channel, isTyping);
  }, []);

  return {
    isConnected,
    subscribe,
    sendTyping,
    client: realtimeClient,
  };
}
