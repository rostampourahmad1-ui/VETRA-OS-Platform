/**
 * VETRA-SEC-03: Server-Sent Events (SSE) Broadcaster
 *
 * Provides real-time push notification delivery to connected clients.
 * Each client subscribes to notifications scoped by organization + user.
 *
 * Architecture:
 * - One SSE endpoint per authenticated user
 * - Clients are grouped by organizationId for selective broadcast
 * - Connections are cleaned up on close/error
 */

import type { Response } from "express";
import { logger } from "./logger";

interface SSEClient {
  organizationId: number;
  userId: number;
  res: Response;
}

class SSEBroadcaster {
  private clients: Map<number, Map<number, SSEClient[]>> = new Map();

  /**
   * Registers a new SSE connection for a given organization + user pair.
   */
  addClient(organizationId: number, userId: number, res: Response): void {
    if (!this.clients.has(organizationId)) {
      this.clients.set(organizationId, new Map());
    }
    const orgClients = this.clients.get(organizationId)!;
    if (!orgClients.has(userId)) {
      orgClients.set(userId, []);
    }
    orgClients.get(userId)!.push({ organizationId, userId, res });

    logger.debug({ organizationId, userId }, "SSE client connected");

    res.on("close", () => {
      this.removeClient(organizationId, userId, res);
    });
  }

  /**
   * Removes a client connection from the registry.
   */
  private removeClient(organizationId: number, userId: number, res: Response): void {
    const orgClients = this.clients.get(organizationId);
    if (!orgClients) return;

    const userClients = orgClients.get(userId);
    if (!userClients) return;

    const idx = userClients.indexOf(userClients.find((c) => c.res === res)!);
    if (idx !== -1) {
      userClients.splice(idx, 1);
    }

    if (userClients.length === 0) {
      orgClients.delete(userId);
    }
    if (orgClients.size === 0) {
      this.clients.delete(organizationId);
    }

    logger.debug({ organizationId, userId }, "SSE client disconnected");
  }

  /**
   * Sends a notification event to all connected clients for a specific user.
   */
  send(organizationId: number, userId: number, data: Record<string, unknown>): void {
    const orgClients = this.clients.get(organizationId);
    if (!orgClients) return;

    const userClients = orgClients.get(userId);
    if (!userClients || userClients.length === 0) return;

    const payload = `data: ${JSON.stringify(data)}\n\n`;

    for (const client of [...userClients]) {
      try {
        client.res.write(payload);
      } catch {
        this.removeClient(organizationId, userId, client.res);
      }
    }
  }

  /** Returns the number of connected clients (for metrics). */
  get connectionCount(): number {
    let count = 0;
    for (const orgClients of this.clients.values()) {
      for (const userClients of orgClients.values()) {
        count += userClients.length;
      }
    }
    return count;
  }
}

export const sseBroadcaster = new SSEBroadcaster();
