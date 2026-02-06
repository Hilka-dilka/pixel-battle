import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

// Инициализируем базу данных (ключи подтянутся из Vercel автоматически)
const redis = Redis.fromEnv();

export async function GET() {
  try {
    // Получаем все данные из хэш-таблицы "board"
    const pixels = await redis.hgetall('board');
    return NextResponse.json(pixels || {});
  } catch (e) {
    console.error(e);
    return NextResponse.json({});
  }
}

export async function POST(req: Request) {
  try {
    const { x, y } = await req.json();
    // Сохраняем пиксель: ключ "x-y", значение 1
    await redis.hset('board', { [`${x}-${y}`]: 1 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}