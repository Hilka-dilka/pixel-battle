import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';
import Pusher from 'pusher';
import nodemailer from 'nodemailer';

const redis = Redis.fromEnv();

const pusher = new Pusher({
  appId: "2112054",
  key: "428b10fa704e1012072a",
  secret: "f70a4f9565e43e61bf19",
  cluster: "eu",
  useTLS: true,
});

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'sapot1151@gmail.com',
    pass: process.env.EMAIL_PASS,
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

    if (action === 'send_otp') {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      await redis.set(`otp:${email}`, code, { ex: 300 });
      await transporter.sendMail({
        from: 'sapot1151@gmail.com',
        to: email,
        subject: 'Pixel Battle - Код',
        text: `Ваш код: ${code}`,
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'verify_otp') {
      const savedOtp = await redis.get(`otp:${email}`);
      if (savedOtp !== otp) return NextResponse.json({ error: 'Код' }, { status: 400 });
      const accounts: any = await redis.smembers(`email_accounts:${email}`);
      if (accounts && accounts.length >= 2 && !accounts.includes(nickname)) {
        return NextResponse.json({ error: 'Limit' }, { status: 403 });
      }
      return NextResponse.json({ ok: true });
    }

    const authKey = `auth:${nickname?.toLowerCase()}`;
    const savedPassword = await redis.get(authKey);
    if (savedPassword && savedPassword !== password) return NextResponse.json({ error: 'Auth' }, { status: 401 });
    
    if (!savedPassword && nickname) {
      await redis.set(authKey, password);
      await redis.sadd('all_users', nickname);
      if (email) await redis.sadd(`email_accounts:${email}`, nickname);
    }

    const isAdmin = nickname?.toLowerCase() === 'admin';

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

    const isBanned = await redis.sismember('banned_users', userId);
    if (isBanned) return NextResponse.json({ error: 'Banned' }, { status: 403 });

    const key = `${x}-${y}`;
    const pixelData = { color, user: nickname, userId: userId };
    await redis.hset('board', { [key]: JSON.stringify(pixelData) });
    await pusher.trigger('pixel-channel', 'new-pixel', { key, data: pixelData });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}