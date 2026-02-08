
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
    // Получаем пиксели
    const pixels = await redis.hgetall('board');
    
    // Получаем сообщения чата
    const chatMessages = await redis.lrange('chat_messages', 0, -1);
    
    // Получаем состояние canvas
    const canvasVisible = await redis.get('canvas_visible');
    
    return NextResponse.json({
      pixels: pixels || {},
      chatMessages: chatMessages || [],
      canvasVisible: canvasVisible === null ? null : canvasVisible !== '0'
    });
  } catch (e) {
    console.error('GET error:', e);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    const { x, y, color, pixels, nickname, password, userId, action, targetId, text } = body;

    // Пакетная отрисовка пикселей (для админа)
    if (pixels && Array.isArray(pixels) && nickname?.toLowerCase() === 'admin') {
      const authKey = `auth:${nickname.toLowerCase()}`;
      const adminPassword = await redis.get('auth:admin') as string | null;
      
      if (adminPassword !== password) {
        return NextResponse.json({ error: 'Invalid admin password' }, { status: 401 });
      }
      
      // Проверяем бан для каждого пикселя
      if (userId) {
        const isBanned = await redis.sismember('banned_users', userId);
        if (isBanned) return NextResponse.json({ error: 'Banned' }, { status: 403 });
      }
      
      // Сохраняем все пиксели
      const pixelDataToSave: Record<string, string> = {};
      const pixelNotifications: { key: string; data: any }[] = [];
      
      for (const pixel of pixels) {
        const key = `${pixel.x}-${pixel.y}`;
        const data = { color: pixel.color, user: nickname, userId: userId || 'admin' };
        pixelDataToSave[key] = JSON.stringify(data);
        pixelNotifications.push({ key, data });
      }
      
      // Сохраняем в Redis
      if (Object.keys(pixelDataToSave).length > 0) {
        await redis.hset('board', pixelDataToSave);
      }
      
      // Отправляем уведомления (можно пакетами)
      for (const notification of pixelNotifications) {
        await pusher.trigger('pixel-channel', 'new-pixel', notification);
      }
      
      return NextResponse.json({ ok: true, count: pixels.length });
    }

    // Чат не требует авторизации
    if (action === 'chat' && text) {
      const chatText = text.slice(0, 200);
      const message = JSON.stringify({ nickname: nickname || 'Anonymous', text: chatText, time: new Date().toISOString() });
      
      // Сохраняем в Redis (максимум 100 сообщений)
      await redis.lpush('chat_messages', message);
      await redis.ltrim('chat_messages', 0, 99);
      
      await pusher.trigger('pixel-channel', 'chat-message', { 
        nickname: nickname || 'Anonymous', 
        text: chatText 
      });
      return NextResponse.json({ ok: true });
    }

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
      if (action === 'canvas_toggle') {
        // Получаем текущее состояние
        const currentVisible = await redis.get('canvas_visible') as boolean | null;
        const newVisible = !currentVisible;
        
        // Сохраняем новое состояние
        await redis.set('canvas_visible', newVisible ? '1' : '0');
        
        // Уведомляем всех пользователей
        await pusher.trigger('pixel-channel', 'canvas_toggle', { visible: newVisible });
        
        return NextResponse.json({ visible: newVisible });
      }
    }

    // ЛОГИКА ДЛЯ ВСЕХ ПОЛЬЗОВАТЕЛЕЙ (включая получение статистики)
    if (action === 'get_stats') {
      // Получаем онлайн пользователей
      const onlineUsers = await redis.smembers('online_users');
      
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
      
      return NextResponse.json({ 
        userStats,
        onlineUsers
      });
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

    // ЛОГИКА ОБЫЧНОГО ИГРОКА (баны)
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