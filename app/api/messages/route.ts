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

// Хранилище сообщений в памяти (сбрасывается при рестарте)
const messagesStore: { nickname: string, text: string, time: string }[] = [];

// GET - получить сообщения
export async function GET() {
  try {
    return NextResponse.json({ messages: messagesStore.slice(-100) });
  } catch (e) {
    console.error('GET messages error:', e);
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
    const message = { 
      nickname: nickname || 'Anonymous', 
      text: chatText, 
      time: new Date().toISOString() 
    };
    
    // Сохраняем в памяти (максимум 100 сообщений)
    messagesStore.push(message);
    if (messagesStore.length > 100) {
      messagesStore.shift();
    }
    
    await pusher.trigger('pixel-channel', 'chat-message', { 
      nickname: nickname || 'Anonymous', 
      text: chatText 
    });
    
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('POST messages error:', e);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
