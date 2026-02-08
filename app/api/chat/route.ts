import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';
import Pusher from 'pusher';

// Check if Redis environment variables are set
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

let redis: Redis | null = null;
if (redisUrl && redisToken) {
  redis = new Redis({
    url: redisUrl,
    token: redisToken,
  });
} else {
  console.warn('Redis not configured in chat API');
}

const pusher = new Pusher({
  appId: "2112054",
  key: "428b10fa704e1012072a",
  secret: "f70a4f9565e43e61bf19",
  cluster: "eu",
  useTLS: true,
});

// GET - получить сообщения и мут статус
export async function GET(req: Request) {
  if (!redis) {
    return NextResponse.json({ messages: [], isMuted: false, muteUntil: null });
  }
  
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    
    // Получаем сообщения
    const chatMessages = await redis.lrange('chat_messages', 0, -1);
    const messages = chatMessages.map((msg: string) => {
      try {
        return JSON.parse(msg);
      } catch (e) {
        return null;
      }
    }).filter(Boolean);
    
    // Проверяем мут для пользователя по userId
    let isMuted = false;
    let muteUntil = null;
    
    if (userId) {
      const muteData = await redis.get(`mute:${userId}`);
      if (muteData) {
        const mute = typeof muteData === 'string' ? JSON.parse(muteData) : muteData;
        if (mute.expires > Date.now()) {
          isMuted = true;
          muteUntil = mute.expires;
        } else {
          await redis.del(`mute:${userId}`);
        }
      }
    }
    
    return NextResponse.json({ messages, isMuted, muteUntil });
  } catch (e) {
    console.error('GET messages error:', e);
    return NextResponse.json({ messages: [], isMuted: false, muteUntil: null });
  }
}

// POST - отправить сообщение, очистить чат, мут
export async function POST(req: Request) {
  if (!redis) {
    return NextResponse.json({ error: 'Redis not configured. Please set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables.' }, { status: 503 });
  }
  
  try {
    const body = await req.json();
    const { nickname, text, action, adminPassword, userId } = body;
    
    const ADMIN_PASS = 'admin123';
    
    // Проверка админа
    if (adminPassword !== ADMIN_PASS) {
      // Проверка мута для обычных действий по userId
      if (userId) {
        const muteData = await redis.get(`mute:${userId}`);
        if (muteData) {
          const mute = typeof muteData === 'string' ? JSON.parse(muteData) : muteData;
          if (mute.expires > Date.now()) {
            return NextResponse.json({ error: `Вы замьючены до ${new Date(mute.expires).toLocaleTimeString()}` }, { status: 403 });
          }
        }
      }
    }
    
    // Очистка чата (только для админа)
    if (action === 'clear_chat') {
      if (adminPassword !== ADMIN_PASS) {
        return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
      }
      await redis.del('chat_messages');
      
      // Отправляем всем уведомление об очистке чата
      await pusher.trigger('pixel-channel', 'clear_chat', {});
      
      return NextResponse.json({ ok: true, message: 'Чат очищен' });
    }
    
    // Мут пользователя по userId (только для админа)
    if (action === 'mute') {
      if (adminPassword !== ADMIN_PASS) {
        return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
      }
      const { targetId, duration } = body; // duration в минутах
      if (!targetId || !duration) {
        return NextResponse.json({ error: 'Укажите ID и длительность' }, { status: 400 });
      }
      const expires = Date.now() + (duration * 60 * 1000);
      await redis.set(`mute:${targetId}`, JSON.stringify({ expires, by: nickname }));
      
      // Уведомление о муте
      await pusher.trigger('pixel-channel', 'user_muted', { 
        targetId, 
        expires,
        by: nickname 
      });
      
      return NextResponse.json({ ok: true, message: `${targetId} замьючен на ${duration} мин` });
    }
    
    // Размут пользователя по userId (только для админа)
    if (action === 'unmute') {
      if (adminPassword !== ADMIN_PASS) {
        return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
      }
      const { targetId } = body;
      if (!targetId) {
        return NextResponse.json({ error: 'Укажите ID' }, { status: 400 });
      }
      await redis.del(`mute:${targetId}`);
      
      // Уведомление о размуте
      await pusher.trigger('pixel-channel', 'user_unmuted', { targetId });
      
      return NextResponse.json({ ok: true, message: `${targetId} размьючен` });
    }
    
    // Отправка сообщения
    if (action === 'send') {
      if (!text) {
        return NextResponse.json({ error: 'Text required' }, { status: 400 });
      }
      
      const chatText = text.slice(0, 200);
      const message = JSON.stringify({ 
        nickname: nickname || 'Anonymous', 
        text: chatText, 
        time: new Date().toISOString() 
      });
      
      // Сохраняем в Redis (максимум 100 сообщений)
      await redis.lpush('chat_messages', message);
      await redis.ltrim('chat_messages', 0, 99);
      
      // Отправляем через Pusher
      await pusher.trigger('pixel-channel', 'chat-message', { 
        nickname: nickname || 'Anonymous', 
        text: chatText 
      });
      
      return NextResponse.json({ ok: true });
    }
    
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    console.error('POST chat error:', e);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
