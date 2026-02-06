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
  } catch (e) {
    console.error('GET error:', e);
    return NextResponse.json({ error: 'Failed to fetch pixels' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    const { x, y, color, nickname, password, userId, action, targetId } = body;

    // Проверяем обязательные поля для аутентификации
    if (!nickname || !password) {
      return NextResponse.json({ error: 'Auth data required' }, { status: 400 });
    }

    const authKey = `auth:${nickname.toLowerCase()}`;
    const savedPassword = await redis.get(authKey) as string | null;
    
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
      const adminPassword = await redis.get('auth:admin') as string | null;
      
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
        
        // Получаем статистику пикселей для каждого пользователя
        const pixels = await redis.hgetall('board');
        const userStats: Record<string, number> = {};
        
        if (pixels) {
          Object.values(pixels).forEach((pixel: any) => {
            try {
              const pixelData = typeof pixel === 'string' ? JSON.parse(pixel) : pixel;
              if (pixelData.user) {
                userStats[pixelData.user] = (userStats[pixelData.user] || 0) + 1;
              }
            } catch (e) {
              // Игнорируем ошибки парсинга
            }
          });
        }
        
        // Получаем онлайн пользователей
        const onlineUsers = await redis.smembers('online_users');
        
        return NextResponse.json({ 
          users, 
          banned, 
          userStats,
          onlineUsers
        });
      }
    }

    // Обновляем статус онлайн при каждом запросе
    const onlineKey = `online:${nickname}`;
    await redis.set(onlineKey, Date.now().toString(), { ex: 60 }); // Онлайн на 60 секунд
    await redis.sadd('online_users', nickname);

    // Очищаем старых онлайн пользователей
    const allOnline = await redis.smembers('online_users');
    for (const user of allOnline) {
      const userOnlineKey = `online:${user}`;
      const lastSeen = await redis.get(userOnlineKey) as string | null;
      if (!lastSeen || Date.now() - parseInt(lastSeen) > 60000) {
        await redis.srem('online_users', user);
      }
    }

    // ЛОГИКА ОБЫЧНОГО ИГРОКА
    if (userId) {
      const isBanned = await redis.sismember('banned_users', userId);
      if (isBanned) return NextResponse.json({ error: 'Banned' }, { status: 403 });
    }

    // Проверяем, что есть координаты для рисования
    if (x !== undefined && y !== undefined && color) {
      const key = `${x}-${y}`;
      const pixelData = { color, user: nickname, userId: userId };
      
      await redis.hset('board', { [key]: JSON.stringify(pixelData) });
      await pusher.trigger('pixel-channel', 'new-pixel', { key, data: pixelData });
      
      // Обновляем статистику пикселей
      const pixelCountKey = `pixel_count:${nickname}`;
      await redis.incr(pixelCountKey);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('POST route error:', e);
    return NextResponse.json({ 
      ok: false, 
      error: 'Internal server error'
    }, { status: 500 });
  }
}