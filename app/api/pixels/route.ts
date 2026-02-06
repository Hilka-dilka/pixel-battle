import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';
import Pusher from 'pusher';
import nodemailer from 'nodemailer';

const redis = Redis.fromEnv();

// Ключи Pusher (вписаны вручную)
const pusher = new Pusher({
  appId: "2112054",
  key: "428b10fa704e1012072a",
  secret: "f70a4f9565e43e61bf19",
  cluster: "eu",
  useTLS: true,
});

// Настройка почты (Твоя почта sapot1151@gmail.com)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'sapot1151@gmail.com',
    pass: process.env.EMAIL_PASS, // 16-значный код из настроек Vercel
  },
});

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
    const body = await req.json();
    const { x, y, color, nickname, password, userId, action, email, otp, targetId } = body;

    // 1. ОТПРАВКА КОДА НА ПОЧТУ
    if (action === 'send_otp') {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      await redis.set(`otp:${email}`, code, { ex: 300 }); // Код на 5 минут
      
      await transporter.sendMail({
        from: 'sapot1151@gmail.com',
        to: email,
        subject: 'Pixel Battle - Код входа',
        text: `Ваш код для входа в игру: ${code}`,
      });
      return NextResponse.json({ ok: true });
    }

    // 2. ПРОВЕРКА КОДА И ЛИМИТА АККАУНТОВ
    if (action === 'verify_otp') {
      const savedOtp = await redis.get(`otp:${email}`);
      if (savedOtp !== otp) return NextResponse.json({ error: 'Неверный код' }, { status: 400 });
      
      const accounts = await redis.smembers(`email_accounts:${email}`);
      if (accounts.length >= 2 && !accounts.includes(nickname)) {
        return NextResponse.json({ error: 'Максимум 2 аккаунта на одну почту!' }, { status: 403 });
      }
      return NextResponse.json({ ok: true });
    }

    // 3. АВТОРИЗАЦИЯ НИКНЕЙМА
    const authKey = `auth:${nickname?.toLowerCase()}`;
    const savedPassword = await redis.get(authKey);
    
    if (savedPassword) {
      if (savedPassword !== password) return NextResponse.json({ error: 'Wrong Pass' }, { status: 401 });
    } else if (action === 'draw') {
      // Регистрация нового ника
      await redis.set(authKey, password);
      await redis.sadd('all_users', nickname);
      if (email) await redis.sadd(`email_accounts:${email}`, nickname);
    }

    const isAdmin = nickname?.toLowerCase() === 'admin';

    // 4. АДМИН-ФУНКЦИИ
    if (isAdmin) {
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
        return NextResponse.json({ users, banned });
      }
    }

    // 5. РИСОВАНИЕ
    const isBanned = await redis.sismember('banned_users', userId);
    if (isBanned) return NextResponse.json({ error: 'Banned' }, { status: 403 });

    const key = `${x}-${y}`;
    const pixelData = { color, user: nickname, userId: userId };
    await redis.hset('board', { [key]: JSON.stringify(pixelData) });
    await pusher.trigger('pixel-channel', 'new-pixel', { key, data: pixelData });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}