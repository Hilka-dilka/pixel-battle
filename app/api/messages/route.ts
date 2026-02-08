import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

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
  console.warn('Redis not configured in messages API');
}

// GET - получить сообщения (из Redis)
export async function GET() {
  if (!redis) {
    return NextResponse.json({ messages: [] });
  }
  
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
    return NextResponse.json({ messages: [] });
  }
}
