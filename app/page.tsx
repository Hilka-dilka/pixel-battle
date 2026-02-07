'use client';

import { useEffect, useState, useRef } from 'react';
import Pusher from 'pusher-js';

interface PlayerStats {
  nickname: string;
  pixelsCount: number;
  isOnline: boolean;
}

export default function Home() {
  const [pixels, setPixels] = useState<Record<string, any>>({});
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [auth, setAuth] = useState({ nick: '', pass: '' });
  const [isAuthOk, setIsAuthOk] = useState(false);

  const [playerStats, setPlayerStats] = useState<PlayerStats[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);

  // CHAT
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState('');
  const [chatMessages, setChatMessages] = useState<any[]>([]);

  const canvasRef = useRef<HTMLDivElement>(null);

  const isAdmin = auth.nick.toLowerCase() === 'admin';

  // ===== LOAD PIXELS =====
  useEffect(() => {
    fetch('/api/pixels')
      .then(res => res.json())
      .then(data => {
        const parsed: any = {};
        for (const k in data) {
          try {
            parsed[k] = JSON.parse(data[k]);
          } catch {
            parsed[k] = data[k];
          }
        }
        setPixels(parsed);
      });

    const pusher = new Pusher('428b10fa704e1012072a', { cluster: 'eu' });
    const channel = pusher.subscribe('pixel-channel');

    channel.bind('new-pixel', (u: any) => {
      setPixels(p => ({ ...p, [u.key]: u.data }));
    });

    channel.bind('clear', () => setPixels({}));

    channel.bind('chat', (msg: any) => {
      setChatMessages(prev => [...prev, msg]);
    });

    return () => {
      pusher.unsubscribe('pixel-channel');
    };
  }, []);

  // ===== AUTH =====
  const checkAuth = async () => {
    const res = await fetch('/api/pixels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nickname: auth.nick,
        password: auth.pass
      })
    });

    if (res.ok) {
      setIsAuthOk(true);
      loadStats();
      loadChat();
    } else {
      alert('Ошибка входа');
    }
  };

  // ===== STATS =====
  const loadStats = async () => {
    const res = await fetch('/api/pixels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nickname: auth.nick,
        password: auth.pass,
        action: isAdmin ? 'get_users' : 'get_stats'
      })
    });

    if (!res.ok) return;
    const data = await res.json();

    const stats: PlayerStats[] = [];
    const users = new Set<string>();

    Object.keys(data.userStats || {}).forEach(u => users.add(u));
    (data.onlineUsers || []).forEach((u: string) => users.add(u));

    users.forEach(u => {
      stats.push({
        nickname: u,
        pixelsCount: data.userStats?.[u] || 0,
        isOnline: data.onlineUsers?.includes(u)
      });
    });

    setPlayerStats(stats.sort((a, b) => b.pixelsCount - a.pixelsCount));
    setOnlineCount(data.onlineUsers?.length || 0);
  };

  // ===== CHAT =====
  const loadChat = async () => {
    const res = await fetch('/api/pixels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nickname: auth.nick,
        password: auth.pass,
        action: 'chat_get'
      })
    });

    if (res.ok) setChatMessages(await res.json());
  };

  const sendChat = async () => {
    if (!chatText.trim()) return;

    await fetch('/api/pixels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nickname: auth.nick,
        password: auth.pass,
        action: 'chat_send',
        message: chatText
      })
    });

    setChatText('');
  };

  // ===== PIXEL CLICK =====
  const clickPixel = async (x: number, y: number) => {
    await fetch('/api/pixels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        x,
        y,
        color: selectedColor,
        nickname: auth.nick,
        password: auth.pass,
        userId: localStorage.getItem('p_id') || auth.nick
      })
    });
  };

  if (!isAuthOk) {
    return (
      <div style={{ padding: 40 }}>
        <h2>Pixel Battle</h2>
        <input placeholder="ник" onChange={e => setAuth({ ...auth, nick: e.target.value })} />
        <input placeholder="пароль" type="password" onChange={e => setAuth({ ...auth, pass: e.target.value })} />
        <button onClick={checkAuth}>Войти</button>
      </div>
    );
  }

  return (
    <div>
      {/* TOP BAR */}
      <div style={{ position: 'fixed', top: 10, right: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <b>{auth.nick}{isAdmin && ' 👑'}</b>

          <img
            src="/stats.png"
            width={16}
            height={16}
            style={{ cursor: 'pointer' }}
            onClick={() => {
              const me = playerStats.find(p => p.nickname === auth.nick);
              alert(`Пикселей: ${me?.pixelsCount || 0}`);
            }}
          />

          <button onClick={() => { setChatOpen(!chatOpen); loadChat(); }}>
            💬
          </button>
        </div>

        <div>Онлайн: {onlineCount}</div>
      </div>

      {/* CHAT */}
      {chatOpen && (
        <div style={{
          position: 'fixed',
          right: 10,
          bottom: 10,
          width: 260,
          background: '#111',
          color: '#fff',
          padding: 8
        }}>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {chatMessages.map((m, i) => (
              <div key={i}><b>{m.user}:</b> {m.text}</div>
            ))}
          </div>
          <input
            value={chatText}
            onChange={e => setChatText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendChat()}
            placeholder="сообщение"
            style={{ width: '100%' }}
          />
        </div>
      )}

      {/* GRID */}
      <div
        ref={canvasRef}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(90, 20px)',
          marginTop: 80
        }}
      >
        {Array.from({ length: 90 * 90 }).map((_, i) => {
          const x = i % 90;
          const y = Math.floor(i / 90);
          const p = pixels[`${x}-${y}`];

          return (
            <div
              key={i}
              onClick={() => clickPixel(x, y)}
              style={{
                width: 20,
                height: 20,
                background: p?.color || '#fff',
                border: '1px solid #ccc'
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
