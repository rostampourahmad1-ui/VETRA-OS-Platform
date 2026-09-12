import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * VETRA-PH1: SSE hook for real-time notifications.
 * Connects to /notifications/stream, reconnects with exponential backoff,
 * invalidates unread-count query on each message.
 */
export function useNotificationStream(enabled = true) {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const [retryDelay, setRetryDelay] = useState(1000);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!enabled) {
      cleanup();
      return;
    }

    function connect() {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
      const es = new EventSource(`${baseUrl}/notifications/stream`, {
        withCredentials: true,
      });

      es.onopen = () => {
        setIsConnected(true);
        setRetryDelay(1000); // reset backoff on success
      };

      es.onmessage = (event) => {
        try {
          const notification = JSON.parse(event.data);
          // Invalidate unread count so badge updates
          queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
        } catch {
          // SSE comment line (heartbeat), ignore
        }
      };

      es.onerror = () => {
        setIsConnected(false);
        es.close();
        // Exponential backoff: 1s → 2s → 4s → 8s → 16s (max)
        const nextDelay = Math.min(retryDelay * 2, 16000);
        setRetryDelay(nextDelay);
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connect();
        }, nextDelay);
      };

      eventSourceRef.current = es;
    }

    connect();

    return cleanup;

    function cleanup() {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      setIsConnected(false);
    }
  }, [enabled, queryClient, retryDelay]);

  return { isConnected };
}
