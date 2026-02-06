[file name]: route.ts
[file content begin]
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
    console.error('GET error:', e);
    return NextResponse.json({ error: 'Failed to fetch pixels' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log('Request body:', body);
    
    const { x, y, color, nickname, password, userId, action, targetId } = body;

    // Проверяем обязательные поля для аутентификации
    if (!nickname || !password) {
      console.log('Missing auth data');
      return NextResponse.json({ error: 'Auth data required' }, { status: 400 });
    }

    const authKey = `auth:${nickname.toLowerCase()}`;
    const savedPassword = await redis.get(authKey);
    
    // Если пользователь существует
    if (savedPassword) {
      console.log('User exists, checking password');
      // Проверяем пароль
      if (savedPassword !== password) {
        console.log('Invalid password');
        return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
      }
    } else {
      // Регистрация нового пользователя
      console.log('Registering new user:', nickname);
      // Проверяем, не пытается ли создать администратора
      if (nickname.toLowerCase() === 'admin') {
        console.log('Attempt to create admin account');
        return NextResponse.json({ error: 'Cannot create admin account' }, { status: 403 });
      }
      
      await redis.set(authKey, password);
      await redis.sadd('all_users', nickname);
      console.log('User registered successfully');
    }

    const isAdmin = nickname.toLowerCase() === 'admin';

    // АДМИН-ЛОГИКА
    if (isAdmin) {
      console.log('Admin action requested');
      // Проверяем специальный пароль админа
      const adminPassword = await redis.get('auth:admin');
      console.log('Admin password check:', adminPassword, 'vs', password);
      
      if (adminPassword !== password) {
        console.log('Invalid admin password');
        return NextResponse.json({ error: 'Invalid admin password' }, { status: 401 });
      }
      
      if (action === 'clear_all') {
        console.log('Clearing board');
        await redis.del('board');
        await pusher.trigger('pixel-channel', 'clear', {});
        return NextResponse.json({ ok: true });
      }
      if (action === 'ban') {
        console.log('Banning user:', targetId);
        await redis.sadd('banned_users', targetId);
        return NextResponse.json({ ok: true });
      }
      if (action === 'get_users') {
        console.log('Getting users list');
        const users = await redis.smembers('all_users');
        const banned = await redis.smembers('banned_users');
        console.log('Users:', users, 'Banned:', banned);
        return NextResponse.json({ users, banned });
      }
    }

    // ЛОГИКА ОБЫЧНОГО ИГРОКА
    if (userId) {
      const isBanned = await redis.sismember('banned_users', userId);
      console.log('User banned check:', userId, isBanned);
      if (isBanned) return NextResponse.json({ error: 'Banned' }, { status: 403 });
    }

    // Проверяем, что есть координаты для рисования
    if (x !== undefined && y !== undefined && color) {
      console.log('Setting pixel:', x, y, color);
      const key = `${x}-${y}`;
      const pixelData = { color, user: nickname, userId: userId };
      
      await redis.hset('board', { [key]: JSON.stringify(pixelData) });
      await pusher.trigger('pixel-channel', 'new-pixel', { key, data: pixelData });
      console.log('Pixel set successfully');
    } else {
      console.log('No pixel data, returning success for auth');
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('POST route error:', e);
    return NextResponse.json({ 
      ok: false, 
      error: 'Internal server error',
      details: e instanceof Error ? e.message : String(e)
    }, { status: 500 });
  }
}
[file content end]