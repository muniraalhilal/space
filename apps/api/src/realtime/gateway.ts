import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer, OnGatewayConnection, SubscribeMessage, ConnectedSocket, MessageBody } from '@nestjs/websockets';
import Redis from 'ioredis';
import type { Server, Socket } from 'socket.io';
import { config } from '../config';
import { resolveSession, loadOrgContext, SESSION_COOKIE } from '../common/guards';
import { EVENTS_CHANNEL, RealtimeEvent, roomsFor } from './bus';

/**
 * Socket.IO gateway. A client authenticates with its session cookie, then asks to join one org.
 * The server — not the client — decides which rooms the socket may join, based on the member's
 * current department memberships.
 */
@WebSocketGateway({ path: '/realtime', cors: false })
export class RealtimeGateway implements OnGatewayConnection, OnModuleInit, OnModuleDestroy {
  @WebSocketServer() server!: Server;
  private sub: Redis | null = null;
  private readonly log = new Logger('Realtime');

  onModuleInit() {
    this.sub = new Redis(config().REDIS_URL);
    this.sub.subscribe(EVENTS_CHANNEL).catch((e) => this.log.error(e));
    this.sub.on('message', (_ch, raw) => {
      try {
        const e = JSON.parse(raw) as RealtimeEvent;
        const rooms = roomsFor(e);
        if (rooms.length) this.server.to(rooms).emit('event', e);
      } catch {
        /* ignore malformed */
      }
    });
  }

  async onModuleDestroy() {
    await this.sub?.quit().catch(() => undefined);
  }

  async handleConnection(socket: Socket) {
    const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
    const user = await resolveSession(cookies[SESSION_COOKIE]);
    if (!user) {
      socket.emit('error', { code: 'UNAUTHENTICATED' });
      socket.disconnect(true);
      return;
    }
    socket.data.userId = user.id;
  }

  @SubscribeMessage('join')
  async join(@ConnectedSocket() socket: Socket, @MessageBody() body: { orgId?: string }) {
    if (!socket.data.userId || typeof body?.orgId !== 'string') return { ok: false };
    const ctx = await loadOrgContext(body.orgId, socket.data.userId);
    if (!ctx) return { ok: false };
    // Leave rooms of any previously joined org (company switching).
    for (const r of socket.rooms) if (r !== socket.id) await socket.leave(r);
    const rooms = [`o:${ctx.orgId}`, `m:${ctx.memberId}`, ...[...ctx.deptRoles.keys()].map((d) => `d:${d}`)];
    if (ctx.isCompanyAdmin) rooms.push(`oa:${ctx.orgId}`);
    rooms.push(`o:${ctx.orgId}:agents`);
    await socket.join(rooms);
    return { ok: true };
  }
}

function parseCookie(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* ignore malformed */
    }
  }
  return out;
}
