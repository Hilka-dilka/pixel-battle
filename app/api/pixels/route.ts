import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';
import Pusher from 'pusher';

const redis = Redis.fromEnv();
const pusher = new Pusher({
  appId: "2112054", key: "428b10fa704e1012072a", secret: "f70a4f9565e43e61bf19", cluster: "eu", useTLS: true,
});

export async function GET() {
  const pixels = await redis.hgetall('board');
  return NextResponse.json(pixels || {});
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { x, y, color, nickname, password, userId, action, targetId } = body;
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';

    if (!nickname || !password) return NextResponse.json({ error: 'Нужен ник и пароль' }, { status: 400 });

    const authKey = `auth:${nickname.toLowerCase()}`;
    const savedPassword = await redis.get(authKey);

    if (savedPassword) {
      if (savedPassword !== password) return NextResponse.json({ error: 'Неверный пароль' }, { status: 401 });
      // Обновляем IP при каждом входе
      await redis.hset('user_ips', { [nickname]: ip });
    } else {
      const ipKey = `ip_limit:${ip}`;
      const accountsByIp: any = await redis.smembers(ipKey);
      if (accountsByIp.length >= 2) return NextResponse.json({ error: 'Лимит: 2 аккаунта на IP' }, { status: 403 });

      await redis.set(authKey, password);
      await redis.sadd(ipKey, nickname);
      await redis.sadd('all_users', nickname);
      await redis.hset('user_ips', { [nickname]: ip });
    }

    const isAdmin = nickname.toLowerCase() === 'admin';

    if (isAdmin) {
      if (action === 'clear_all') { await redis.del('board'); await pusher.trigger('pixel-channel', 'clear', {}); return NextResponse.json({ ok: true }); }
      if (action === 'ban') { await redis.sadd('banned_users', targetId); return NextResponse.json({ ok: true }); }
      
      if (action === 'get_users') {
        const users = await redis.smembers('all_users');
        const ips = await redis.hgetall('user_ips') || {};
        const banned = await redis.smembers('banned_users');
        
        // Форматируем список: Ник (IP)
        const usersWithIps = users.map(u => `${u} (${ips[u] || '?.?.?.?'})`);
        return NextResponse.json({ users: usersWithIps, banned });
      }
    }

    const isBanned = await redis.sismember('banned_users', userId);
    if (isBanned) return NextResponse.json({ error: 'Banned' }, { status: 403 });

    if (action === 'draw') {
      const key = `${x}-${y}`;
      const pixelData = { color, user: nickname, userId };
      await redis.hset('board', { [key]: JSON.stringify(pixelData) });
      await pusher.trigger('pixel-channel', 'new-pixel', { key, data: pixelData });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}