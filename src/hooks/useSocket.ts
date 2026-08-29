import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { supabase } from '../lib/supabase';

export const useSocket = (namespace: string) => {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    // The server verifies this token at handshake time and rejects the
    // connection without it, so the socket can only be built once we have one.
    let cancelled = false;
    let created: Socket | null = null;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session?.access_token) return;

      created = io(`/${namespace}`, {
        transports: ['websocket', 'polling'],
        auth: { token: session.access_token },
      });

      created.on('connect_error', (err) => {
        console.error(`Socket /${namespace} rejected:`, err.message);
      });

      setSocket(created);
    });

    return () => {
      cancelled = true;
      created?.disconnect();
    };
  }, [namespace]);

  return socket;
};
