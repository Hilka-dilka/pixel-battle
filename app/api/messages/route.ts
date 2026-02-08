import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

const redis = Redis.fromEnv();

// GET - получить сообщения (из Redis)
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
    console.error('GET messages error:', e);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}
