import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';
import Pusher from 'pusher';

const redis = Redis.fromEnv();

const pusher = new Pusher({
  appId: "2112054",
  key: "428b10fa704e1012072a",
  secret: "f70a4f9565e43e61bf19",
  cluster: "eu",
  useTLS: true,
});

export async function GET() {
  try {
    const pixels = await redis.hgetall('board');
    return NextResponse.json(pixels || {});
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { x, y, color, nickname, password, userId, action, targetId, message } = body;

    if (!nickname || !password) {
      return NextResponse.json({ error: 'Auth required' }, { status: 400 });
    }

    const authKey = `auth:${nickname.toLowerCase()}`;
    const savedPassword = await redis.get(authKey) as string | null;

    if (savedPassword) {
      if (savedPassword !== password) {
        return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
      }
    } else {
      if (nickname.toLowerCase() === 'admin') {
        return NextResponse.json({ error: 'Admin forbidden' }, { status: 403 });
      }
      await redis.set(authKey, password);
      await redis.sadd('all_users', nickname);
    }

    const isAdmin = nickname.toLowerCase() === 'admin';

    // ===== CHAT =====
    if (action === 'chat_send') {
      if (!message || message.length > 200) {
        return NextResponse.json({ error: 'Bad message' }, { status: 400 });
      }

      const chatMsg = {
        user: nickname,
        text: message,
        time: Date.now()
      };

      await redis.lpush('chat_messages', JSON.stringify(chatMsg));
      await redis.ltrim('chat_messages', 0, 49);
      await pusher.trigger('pixel-channel', 'chat', chatMsg);

      return NextResponse.json({ ok: true });
    }

    if (action === 'chat_get') {
      const msgs = await redis.lrange('chat_messages', 0, 49);
      return NextResponse.json(msgs.map(m => JSON.parse(m)).reverse());
    }

    // ===== ADMIN =====
    if (isAdmin) {
      if (action === 'clear_all') {
        await redis.del('board');
        await pusher.trigger('pixel-channel', 'clear', {});
        return NextResponse.json({ ok: true });
      }

      if (action === 'ban') {
        await redis.sadd('banned_users', targetId);
        return NextResponse.json({ ok: true });
      }

      if (action === 'get_users') {
        const users = await redis.smembers('all_users');
        const banned = await redis.smembers('banned_users');
        const pixels = await redis.hgetall('board');
        const onlineUsers = await redis.smembers('online_users');

        const userStats: Record<string, number> = {};
        if (pixels) {
          Object.values(pixels).forEach((p: any) => {
            try {
              const d = JSON.parse(p);
              if (d.user) userStats[d.user] = (userStats[d.user] || 0) + 1;
            } catch {}
          });
        }

        return NextResponse.json({ users, banned, userStats, onlineUsers });
      }
    }

    // ===== STATS =====
    if (action === 'get_stats') {
      const pixels = await redis.hgetall('board');
      const onlineUsers = await redis.smembers('online_users');

      const userStats: Record<string, number> = {};
      if (pixels) {
        Object.values(pixels).forEach((p: any) => {
          try {
            const d = JSON.parse(p);
            if (d.user) userStats[d.user] = (userStats[d.user] || 0) + 1;
          } catch {}
        });
      }

      return NextResponse.json({ userStats, onlineUsers });
    }

    // ===== ONLINE =====
    await redis.set(`online:${nickname}`, Date.now().toString(), { ex: 60 });
    await redis.sadd('online_users', nickname);

    // ===== BAN CHECK =====
    if (userId) {
      const banned = await redis.sismember('banned_users', userId);
      if (banned) return NextResponse.json({ error: 'Banned' }, { status: 403 });
    }

    // ===== PIXEL =====
    if (x !== undefined && y !== undefined && color) {
      const key = `${x}-${y}`;
      const pixelData = { color, user: nickname, userId };
      await redis.hset('board', { [key]: JSON.stringify(pixelData) });
      await pusher.trigger('pixel-channel', 'new-pixel', { key, data: pixelData });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
