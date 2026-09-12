import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

interface AuthenticatedSocket extends Socket {
  data: {
    hrOfficerId?: string;
  };
}

interface JwtAccessPayload {
  sub: string;
  email: string;
  role: string;
}

/**
 * Lightweight signal channel for the HR dashboard.
 *
 * This gateway does not carry message content — it only tells connected
 * dashboards "something changed for conversation X". Clients react by
 * re-fetching that conversation (or the conversation list) through the
 * existing REST endpoints, which remain the single source of truth for
 * data and stay behind the same JwtAuthGuard-protected routes.
 */
@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: process.env.DASHBOARD_ORIGIN ?? 'http://localhost:3001',
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = this.extractToken(client);
      const secret = this.configService.get<string>('JWT_ACCESS_SECRET');

      if (!token || !secret) {
        throw new UnauthorizedException();
      }

      const payload = await this.jwtService.verifyAsync<JwtAccessPayload>(
        token,
        { secret },
      );

      client.data.hrOfficerId = payload.sub;

      // Every authenticated HR officer sits in the shared "dashboard" room,
      // used for conversation-list-level updates (new message previews,
      // unread counts). Per-conversation rooms are joined explicitly by the
      // client once it opens a specific thread.
      void client.join('dashboard');
    } catch {
      this.logger.warn(`Rejected unauthenticated socket ${client.id}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.debug(`Socket disconnected: ${client.id}`);
  }

  @SubscribeMessage('conversation:join')
  handleJoinConversation(client: AuthenticatedSocket, sessionId: string): void {
    if (typeof sessionId === 'string' && sessionId.length > 0) {
      void client.join(this.conversationRoom(sessionId));
    }
  }

  @SubscribeMessage('conversation:leave')
  handleLeaveConversation(
    client: AuthenticatedSocket,
    sessionId: string,
  ): void {
    if (typeof sessionId === 'string' && sessionId.length > 0) {
      void client.leave(this.conversationRoom(sessionId));
    }
  }

  /**
   * Notify dashboards that a conversation has a new message.
   * `direction` lets the client decide whether to bump unread counters
   * (INBOUND) or simply reconcile an already-optimistic send (OUTBOUND).
   */
  notifyNewMessage(sessionId: string, direction: 'INBOUND' | 'OUTBOUND') {
    const payload = { sessionId, direction, at: new Date().toISOString() };

    this.server
      .to(this.conversationRoom(sessionId))
      .emit('conversation:new-message', payload);
    this.server.to('dashboard').emit('conversation:list-updated', payload);
  }

  private conversationRoom(sessionId: string): string {
    return `conversation:${sessionId}`;
  }

  private extractToken(client: Socket): string | undefined {
    const fromAuth = client.handshake.auth?.token as string | undefined;

    if (fromAuth) {
      return fromAuth;
    }

    const header = client.handshake.headers.authorization;
    return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  }
}
