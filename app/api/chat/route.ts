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

// GET - получить сообщения
export async function GET() {
  try {
    const chatMessages = await redis.lrange('chat_messages', 0, -1);
    const messages = chatMessages.map((msg: string) => {
      try {
        return JSON.parse(msg);
      } catch (e) {
        return null;
      }
    }).filter(Boolean);
    
    return NextResponse.json({ messages });
  } catch (e) {
    console.error('GET chat error:', e);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

// POST - отправить сообщение
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { nickname, text } = body;
    
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
    
    await pusher.trigger('pixel-channel', 'chat-message', { 
      nickname: nickname || 'Anonymous', 
      text: chatText 
    });
    
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('POST chat error:', e);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
