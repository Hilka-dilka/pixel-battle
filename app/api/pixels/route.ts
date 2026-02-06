import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

const redis = Redis.fromEnv();

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
    const { x, y, action, color } = await req.json();
    const key = `${x}-${y}`;

    if (action === 'erase') {
      await redis.hdel('board', key);
    } else {
      // Сохраняем код цвета (например, "#ff0000")
      await redis.hset('board', { [key]: color || '#000000' });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}