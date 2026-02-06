'use client';
import { useEffect, useState } from 'react';
import Pusher from 'pusher-js';

export default function Home() {
  const [pixels, setPixels] = useState<Record<string, any>>({});
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [auth, setAuth] = useState({ nick: '', pass: '' });
  const [isAuthOk, setIsAuthOk] = useState(false);
  const [cooldown, setCooldown] = useState(100);
  const [canClick, setCanClick] = useState(true);
  const [hoveredInfo, setHoveredInfo] = useState<any>(null);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const isAdmin = auth.nick.toLowerCase() === 'admin';

  const size = 30;
  const cellSize = 20;

  useEffect(() => {
    const savedNick = localStorage.getItem('p_nick');
    const savedPass = localStorage.getItem('p_pass');
    if (savedNick && savedPass) { setAuth({ nick: savedNick, pass: savedPass }); setIsAuthOk(true); }

    // Загрузка базы
    fetch('/api/pixels').then(res => res.json()).then(data => {
      const parsed: any = {};
      for (const k in data) {
        try {
          const val = data[k];
          parsed[k] = typeof val === 'string' ? JSON.parse(val) : val;
        } catch(e) { parsed[k] = { color: data[k], user: '???' }; }
      }
      setPixels(parsed);
    });

    // Pusher (Ключ вписан вручную для надежности)
    const pusher = new Pusher("428b10fa704e1012072a", { cluster: "eu" });
    const channel = pusher.subscribe('pixel-channel');
    
    channel.bind('new-pixel', (update: any) => {
      setPixels(prev => ({ ...prev, [update.key]: update.data }));
    });

    channel.bind('clear', () => setPixels({}));

    const handleGlobalMouseUp = () => setIsMouseDown(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => { pusher.unsubscribe('pixel-channel'); window.removeEventListener('mouseup', handleGlobalMouseUp); };
  }, []);

  useEffect(() => {
    if (!canClick && !isAdmin) {
      const timer = setInterval(() => {
        setCooldown(p => {
          if (p >= 100) { clearInterval(timer); setCanClick(true); return 100; }
          return p + 5;
        });
      }, 100);
      return () => clearInterval(timer);
    }
  }, [canClick, isAdmin]);

  const clickPixel = async (x: number, y: number) => {
    if (!isAdmin && !canClick) return;
    const key = `${x}-${y}`;
    if (pixels[key]?.color === selectedColor) return;

    if (!isAdmin) { setCanClick(false); setCooldown(0); }

    await fetch('/api/pixels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        x, y, color: selectedColor, 
        nickname: auth.nick, password: auth.pass, 
        userId: localStorage.getItem('p_id') || ('gen_'+auth.nick) 
      }),
    });
  };

  if (!isAuthOk) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#121212', color: '#fff' }}>
        <form onSubmit={(e) => { e.preventDefault(); setIsAuthOk(true); localStorage.setItem('p_nick', auth.nick); localStorage.setItem('p_pass', auth.pass); }} style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '30px', background: '#1e1e1e', borderRadius: '10px' }}>
          <h2>Pixel Battle</h2>
          <input placeholder="Ник" value={auth.nick} onChange={e => setAuth({...auth, nick: e.target.value})} style={{ padding: '10px' }} />
          <input type="password" placeholder="Пароль" value={auth.pass} onChange={e => setAuth({...auth, pass: e.target.value})} style={{ padding: '10px' }} />
          <button type="submit" style={{ padding: '10px', backgroundColor: '#4CAF50', color: '#fff' }}>Играть</button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#121212', color: '#fff', minHeight: '100vh', padding: '20px', fontFamily: 'sans-serif', userSelect: 'none' }} onMouseDown={() => isAdmin && setIsMouseDown(true)}>
      
      {isAdmin && (
        <div style={{ position: 'fixed', right: 10, top: 50, width: '180px', background: '#1e1e1e', padding: '10px', borderRadius: '10px', border: '2px solid gold', zIndex: 1000 }}>
          <button onClick={() => fetch('/api/pixels', { method: 'POST', body: JSON.stringify({ nickname: auth.nick, password: auth.pass, action: 'clear_all' }) })} style={{ width: '100%', backgroundColor: 'red', color: '#fff' }}>ОЧИСТИТЬ</button>
          <input type="text" placeholder="#hex" onChange={e => setSelectedColor(e.target.value)} style={{ width: '100%', marginTop: '10px', background: '#000', color: '#fff' }} />
        </div>
      )}

      <h1>PIXEL BATTLE LIVE</h1>

      {!isAdmin && (
        <div style={{ width: '300px', height: '6px', backgroundColor: '#333', marginBottom: '20px' }}>
          <div style={{ width: `${cooldown}%`, height: '100%', backgroundColor: '#4CAF50' }} />
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {['#000000', '#808080', '#ffffff', '#ff0000'].map(c => (
          <div key={c} onClick={() => setSelectedColor(c)} style={{ width: '30px', height: '30px', backgroundColor: c, border: selectedColor === c ? '2px solid gold' : '1px solid #333', cursor: 'pointer' }} />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${size}, ${cellSize}px)`, gridTemplateRows: `repeat(${size}, ${cellSize}px)`, backgroundColor: '#333', gap: '1px' }}>
        {Array.from({ length: size * size }).map((_, i) => {
          const x = i % size; const y = Math.floor(i / size);
          const data = pixels[`${x}-${y}`];
          return (
            <div key={i} 
              onMouseDown={() => { if(isAdmin) setIsMouseDown(true); clickPixel(x, y); }}
              onMouseEnter={() => { if(isAdmin && isMouseDown) clickPixel(x, y); setHoveredInfo(data ? {...data, x, y} : null); }}
              onMouseLeave={() => setHoveredInfo(null)}
              style={{ width: `${cellSize}px`, height: `${cellSize}px`, backgroundColor: data?.color || '#ffffff', cursor: 'crosshair' }}
            />
          );
        })}
        {hoveredInfo && (
          <div style={{ position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)', backgroundColor: '#222', padding: '10px', borderRadius: '5px', fontSize: '12px', border: '1px solid gold', pointerEvents: 'none' }}>
            👤 {String(hoveredInfo.user)} <br/> 🎨 {String(hoveredInfo.color)}
          </div>
        )}
      </div>
    </div>
  );
}