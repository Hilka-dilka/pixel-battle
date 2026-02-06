import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';
import Pusher from 'pusher';

const redis = Redis.fromEnv();

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
  useTLS: true,
});

export async function GET() {
  const pixels = await redis.hgetall('board');
  return NextResponse.json(pixels || {});
}

export async function POST(req: Request) {
  try {
    const { x, y, color, nickname, password, userId, action, targetId } = await req.json();

    const authKey = `auth:${nickname.toLowerCase()}`;
    const savedPassword = await redis.get(authKey);
    if (savedPassword && savedPassword !== password) return NextResponse.json({ error: 'Auth' }, { status: 401 });
    if (!savedPassword) await redis.set(authKey, password);

    const isAdmin = nickname.toLowerCase() === 'admin';

    // Админ-действия
    if (isAdmin && action === 'clear_all') {
      await redis.del('board');
      await pusher.trigger('pixel-channel', 'clear', {}); // Шлем сигнал очистки
      return NextResponse.json({ ok: true });
    }

    const isBanned = await redis.sismember('banned_users', userId);
    if (isBanned) return NextResponse.json({ error: 'Banned' }, { status: 403 });

    const key = `${x}-${y}`;
    const pixelData = { color, user: nickname, userId };
    
    // Сохраняем в Redis
    await redis.hset('board', { [key]: JSON.stringify(pixelData) });

    // Шлем в Pusher (самое главное!)
    await pusher.trigger('pixel-channel', 'new-pixel', { key, data: pixelData });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}