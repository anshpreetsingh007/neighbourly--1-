import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export const useSocket = (namespace: string) => {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const newSocket = io(`/${namespace}`, {
        transports: ['websocket', 'polling']
    });
    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [namespace]);

  return socket;
};
