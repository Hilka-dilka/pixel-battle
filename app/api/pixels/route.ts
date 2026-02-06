import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';
import Pusher from 'pusher';

const redis = Redis.fromEnv();

// Инициализация Pusher с проверкой ключей
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
  } catch (e) {
    return NextResponse.json({});
  }
}

export async function POST(req: Request) {
  try {
    const { x, y, color, nickname, password, userId, action } = await req.json();

    // Проверка ника и пароля
    const authKey = `auth:${nickname.toLowerCase()}`;
    const savedPassword = await redis.get(authKey);
    if (savedPassword && savedPassword !== password) return NextResponse.json({ error: 'Auth' }, { status: 401 });
    if (!savedPassword) await redis.set(authKey, password);

    const isAdmin = nickname.toLowerCase() === 'admin';

    // Очистка полотна (только для админа)
    if (isAdmin && action === 'clear_all') {
      await redis.del('board');
      await pusher.trigger('pixel-channel', 'clear', {});
      return NextResponse.json({ ok: true });
    }

    // Проверка бана
    const isBanned = await redis.sismember('banned_users', userId);
    if (isBanned) return NextResponse.json({ error: 'Banned' }, { status: 403 });

    const key = `${x}-${y}`;
    const pixelData = { color, user: String(nickname), userId: String(userId) };
    
    // 1. Сохраняем в базу как строку JSON
    await redis.hset('board', { [key]: JSON.stringify(pixelData) });

    // 2. Отправляем в Pusher
    try {
      await pusher.trigger('pixel-channel', 'new-pixel', { key, data: pixelData });
    } catch (pusherError) {
      console.error("Pusher Trigger Error:", pusherError);
      // Даже если пушер сбоит, запись в базе уже есть
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("API POST Error:", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}