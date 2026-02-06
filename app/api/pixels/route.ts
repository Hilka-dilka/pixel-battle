import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';
import Pusher from 'pusher';

// Инициализация Redis через переменные окружения Vercel
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
  } catch (err) {
    return NextResponse.json({}, { status: 200 }); // Возвращаем пустой объект, если база пуста
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { x, y, color, nickname, password, userId, action, targetId } = body;
    
    // Получаем IP для логов админа
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';

    if (!nickname || !password) {
      return NextResponse.json({ error: 'Введите ник и пароль' }, { status: 400 });
    }

    const authKey = `auth:${nickname.toLowerCase()}`;
    const savedPassword = await redis.get(authKey);

    // Логика входа / регистрации
    if (savedPassword) {
      if (savedPassword !== password) {
        return NextResponse.json({ error: 'Неверный пароль' }, { status: 401 });
      }
    } else {
      // РЕГИСТРАЦИЯ НОВОГО (Лимит по IP удален)
      await redis.set(authKey, password);
      await redis.sadd('all_users', nickname);
    }
    
    // Сохраняем IP пользователя (просто для инфы админу)
    await redis.hset('user_ips', { [nickname]: ip });

    const isAdmin = nickname.toLowerCase() === 'admin';

    // Действия админа
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
        const ips = await redis.hgetall('user_ips') as Record<string, string> || {};
        const banned = await redis.smembers('banned_users');
        const usersWithIps = users.map(u => `${u} (${ips[u] || '?.?.?.?'})`);
        return NextResponse.json({ users: usersWithIps, banned });
      }
    }

    // Проверка бана
    const isBanned = await redis.sismember('banned_users', userId);
    if (isBanned) {
      return NextResponse.json({ error: 'Ваше устройство забанено' }, { status: 403 });
    }

    // Рисование
    if (action === 'draw') {
      const key = `${x}-${y}`;
      const pixelData = { color, user: nickname, userId };
      await redis.hset('board', { [key]: JSON.stringify(pixelData) });
      await pusher.trigger('pixel-channel', 'new-pixel', { key, data: pixelData });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Ошибка сервера:", e);
    return NextResponse.json({ error: "Ошибка базы данных" }, { status: 500 });
  }
}