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
  const [adminData, setAdminData] = useState<{users: string[], banned: string[]}>({users: [], banned: []});
  const [banInput, setBanInput] = useState('');

  const isAdmin = auth.nick.toLowerCase() === 'admin';
  const size = 30;
  const cellSize = 20;

  useEffect(() => {
    const savedNick = localStorage.getItem('p_nick');
    const savedPass = localStorage.getItem('p_pass');
    if (savedNick && savedPass) { setAuth({ nick: savedNick, pass: savedPass }); setIsAuthOk(true); }

    fetch('/api/pixels').then(res => res.json()).then(data => {
      const parsed: any = {};
      for (const k in data) {
        try { parsed[k] = typeof data[k] === 'string' ? JSON.parse(data[k]) : data[k]; } 
        catch(e) { parsed[k] = { color: data[k], user: '???' }; }
      }
      setPixels(parsed);
    });

    const pusher = new Pusher("428b10fa704e1012072a", { cluster: "eu" });
    const channel = pusher.subscribe('pixel-channel');
    channel.bind('new-pixel', (u: any) => setPixels(prev => ({ ...prev, [u.key]: u.data })));
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

  const handleLogin = async (e: any) => {
    e.preventDefault();
    const res = await fetch('/api/pixels', {
      method: 'POST',
      body: JSON.stringify({ nickname: auth.nick, password: auth.pass, action: 'login' })
    });
    if (res.ok) {
      localStorage.setItem('p_nick', auth.nick);
      localStorage.setItem('p_pass', auth.pass);
      setIsAuthOk(true);
    } else {
      const err = await res.json();
      alert(err.error || 'Ошибка входа');
    }
  };

  const clickPixel = async (x: number, y: number) => {
    if (!isAdmin && !canClick) return;
    const key = `${x}-${y}`;
    if (pixels[key]?.color === selectedColor) return;
    if (!isAdmin) { setCanClick(false); setCooldown(0); }
    
    const userId = localStorage.getItem('p_id') || ('id_' + Math.random().toString(36).substr(2, 9));
    localStorage.setItem('p_id', userId);

    await fetch('/api/pixels', {
      method: 'POST',
      body: JSON.stringify({ x, y, color: selectedColor, nickname: auth.nick, password: auth.pass, action: 'draw', userId }),
    });
  };

  const getAdminLists = () => {
    fetch('/api/pixels', { method: 'POST', body: JSON.stringify({ nickname: auth.nick, password: auth.pass, action: 'get_users' }) })
      .then(r => r.json())
      .then(setAdminData);
  };

  if (!isAuthOk) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#121212', color: '#fff', fontFamily: 'sans-serif' }}>
      <form onSubmit={handleLogin} style={{ background: '#1e1e1e', padding: '40px', borderRadius: '15px', display: 'flex', flexDirection: 'column', gap: '15px', border: '1px solid #333', textAlign: 'center' }}>
        <h2 style={{ color: '#4CAF50' }}>Pixel Battle</h2>
        <input placeholder="Никнейм" value={auth.nick} onChange={e => setAuth({...auth, nick: e.target.value})} required style={{ padding: '12px', background: '#000', color: '#fff', border: '1px solid #444', borderRadius: '5px' }} />
        <input type="password" placeholder="Пароль" value={auth.pass} onChange={e => setAuth({...auth, pass: e.target.value})} required style={{ padding: '12px', background: '#000', color: '#fff', border: '1px solid #444', borderRadius: '5px' }} />
        <button type="submit" style={{ padding: '12px', background: '#4CAF50', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>Войти / Создать</button>
      </form>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#121212', color: '#fff', minHeight: '100vh', padding: '20px', fontFamily: 'sans-serif', userSelect: 'none' }} onMouseDown={() => isAdmin && setIsMouseDown(true)}>
      
      {isAdmin && (
        <div style={{ position: 'fixed', left: 10, top: 10, width: '250px', background: '#1e1e1e', padding: '15px', borderRadius: '10px', border: '2px solid gold', fontSize: '11px', zIndex: 1000, maxHeight: '90vh', overflowY: 'auto' }}>
          <h4 style={{ color: 'gold', margin: '0 0 10px 0', textAlign: 'center' }}>👑 ADMIN PANEL</h4>
          <button onClick={getAdminLists} style={{ width: '100%', marginBottom: '10px', cursor: 'pointer' }}>Обновить списки</button>
          
          <p style={{ color: '#4CAF50', margin: '5px 0' }}>Игроки (IP):</p>
          <div style={{ height: '80px', overflow: 'auto', background: '#000', padding: '5px', marginBottom: '10px' }}>
            {adminData.users?.map(u => <div key={u}>• {u}</div>)}
          </div>

          <p style={{ color: 'red', margin: '5px 0' }}>Бан-лист (IDs):</p>
          <div style={{ height: '80px', overflow: 'auto', background: '#000', padding: '5px', marginBottom: '10px', color: 'red' }}>
            {adminData.banned?.map(b => <div key={b}>🚫 {b}</div>)}
          </div>

          <input placeholder="ID для бана" value={banInput} onChange={e => setBanInput(e.target.value)} style={{ width: '100%', marginBottom: '5px', background: '#000', color: '#fff', border: '1px solid #333' }} />
          <button onClick={() => { fetch('/api/pixels', { method: 'POST', body: JSON.stringify({ nickname: auth.nick, password: auth.pass, action: 'ban', targetId: banInput }) }).then(() => { alert('Забанен!'); getAdminLists(); }); }} style={{ width: '100%', backgroundColor: 'red', color: '#fff', border: 'none', padding: '5px', cursor: 'pointer' }}>ЗАБАНИТЬ</button>
          
          <button onClick={() => { if(confirm('Очистить поле?')) fetch('/api/pixels', { method: 'POST', body: JSON.stringify({ nickname: auth.nick, password: auth.pass, action: 'clear_all' }) }) }} style={{ width: '100%', marginTop: '10px', backgroundColor: '#444', color: '#fff' }}>ОЧИСТИТЬ ПОЛЕ</button>
          
          <input type="text" placeholder="HEX: #ff00ff" onChange={e => setSelectedColor(e.target.value)} style={{ width: '100%', marginTop: '10px', background: '#000', color: '#fff', border: '1px solid #555' }} />
        </div>
      )}

      <div style={{ position: 'fixed', top: 10, right: 10 }}>
        {auth.nick} <button onClick={() => {localStorage.clear(); location.reload();}} style={{marginLeft: '10px', fontSize: '10px', color: '#888', background: 'none', border: '1px solid #444', cursor: 'pointer'}}>Выход</button>
      </div>

      <h1 style={{ letterSpacing: '5px' }}>PIXEL BATTLE LIVE</h1>

      {!isAdmin && (
        <div style={{ width: '300px', height: '6px', backgroundColor: '#333', marginBottom: '20px', borderRadius: '3px' }}>
          <div style={{ width: `${cooldown}%`, height: '100%', backgroundColor: '#4CAF50', transition: 'width 0.1s linear' }} />
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        {['#000000', '#808080', '#ffffff', '#ff0000'].map(c => (
          <div key={c} onClick={() => setSelectedColor(c)} style={{ width: '35px', height: '35px', backgroundColor: c, border: selectedColor === c ? '3px solid gold' : '1px solid #333', cursor: 'pointer', borderRadius: '5px' }} />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${size}, ${cellSize}px)`, gridTemplateRows: `repeat(${size}, ${cellSize}px)`, backgroundColor: '#333', gap: '1px', border: '2px solid #444' }}>
        {Array.from({ length: size * size }).map((_, i) => {
          const x = i % size; const y = Math.floor(i / size);
          const data = pixels[`${x}-${y}`];
          return (
            <div key={i} 
              onMouseDown={() => { if(isAdmin) setIsMouseDown(true); clickPixel(x, y); }}
              onMouseEnter={() => { if(isAdmin && isMouseDown) clickPixel(x, y); setHoveredInfo(data ? {...data, x, y} : null); }}
              onMouseLeave={() => setHoveredInfo(null)}
              style={{ width: `${cellSize}px`, height: `${cellSize}px`, backgroundColor: data?.color || '#ffffff', cursor: 'crosshair', outline: '0.1px solid #444' }}
            />
          );
        })}
        {hoveredInfo && (
          <div style={{ position: 'absolute', top: -85, left: '50%', transform: 'translateX(-50%)', backgroundColor: '#111', padding: '10px', borderRadius: '5px', fontSize: '11px', border: '1px solid gold', pointerEvents: 'none', textAlign: 'center', zIndex: 100 }}>
            <span style={{color: 'gold'}}>Автор:</span> {String(hoveredInfo.user)} <br/>
            <span style={{color: 'gold'}}>ID:</span> {String(hoveredInfo.userId || 'n/a')} <br/>
            <span style={{color: 'gold'}}>Цвет:</span> {String(hoveredInfo.color)}
          </div>
        )}
      </div>
    </div>
  );
}