
import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';
import Pusher from 'pusher';

const redis = Redis.fromEnv();

// Твои ключи вписаны напрямую
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
    const { x, y, color, nickname, password, userId, action, targetId } = await req.json();

    // Проверяем обязательные поля для аутентификации
    if (!nickname || !password) {
      return NextResponse.json({ error: 'Auth data required' }, { status: 400 });
    }

    const authKey = `auth:${nickname.toLowerCase()}`;
    const savedPassword = await redis.get(authKey);
    
    // Если пользователь существует
    if (savedPassword) {
      // Проверяем пароль
      if (savedPassword !== password) {
        return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
      }
    } else {
      // Регистрация нового пользователя
      // Проверяем, не пытается ли создать администратора
      if (nickname.toLowerCase() === 'admin') {
        return NextResponse.json({ error: 'Cannot create admin account' }, { status: 403 });
      }
      
      await redis.set(authKey, password);
      await redis.sadd('all_users', nickname);
    }

    const isAdmin = nickname.toLowerCase() === 'admin';

    // АДМИН-ЛОГИКА
    if (isAdmin) {
      // Проверяем специальный пароль админа
      const adminPassword = await redis.get('auth:admin');
      if (adminPassword !== password) {
        return NextResponse.json({ error: 'Invalid admin password' }, { status: 401 });
      }
      
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
        return NextResponse.json({ users, banned });
      }
    }

    // ЛОГИКА ОБЫЧНОГО ИГРОКА
    const isBanned = await redis.sismember('banned_users', userId);
    if (isBanned) return NextResponse.json({ error: 'Banned' }, { status: 403 });

    // Проверяем, что есть координаты для рисования
    if (x !== undefined && y !== undefined && color) {
      const key = `${x}-${y}`;
      const pixelData = { color, user: nickname, userId: userId };
      
      await redis.hset('board', { [key]: JSON.stringify(pixelData) });
      await pusher.trigger('pixel-channel', 'new-pixel', { key, data: pixelData });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Route error:', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
