import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

const redis = Redis.fromEnv();

export async function GET() {
  const pixels = await redis.hgetall('board');
  return NextResponse.json(pixels || {});
}

export async function POST(req: Request) {
  try {
    const { x, y, color, nickname, password, userId, action, targetId } = await req.json();

    // 1. Проверка авторизации
    const authKey = `auth:${nickname.toLowerCase()}`;
    const savedPassword = await redis.get(authKey);
    
    if (savedPassword) {
      if (savedPassword !== password) return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
    } else {
      await redis.set(authKey, password);
      await redis.sadd('all_users', nickname); // Добавляем в список всех юзеров
    }

    const isAdmin = nickname.toLowerCase() === 'admin';

    // --- АДМИН-ФУНКЦИИ ---
    if (isAdmin) {
      if (action === 'ban') {
        await redis.sadd('banned_users', targetId);
        return NextResponse.json({ ok: true, message: 'User banned' });
      }
      if (action === 'get_users') {
        const users = await redis.smembers('all_users');
        const banned = await redis.smembers('banned_users');
        return NextResponse.json({ users, banned });
      }
    }

    // --- ОБЫЧНОЕ РИСОВАНИЕ ---
    const isBanned = await redis.sismember('banned_users', userId);
    if (isBanned) return NextResponse.json({ error: 'Banned' }, { status: 403 });

    const key = `${x}-${y}`;
    const pixelData = JSON.stringify({ color, user: nickname, userId });
    await redis.hset('board', { [key]: pixelData });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}