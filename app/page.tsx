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
  
  // Состояние админки
  const [adminData, setAdminData] = useState<{users: string[], banned: string[]}>({users: [], banned: []});
  const [banInput, setBanInput] = useState('');
  const isAdmin = auth.nick.toLowerCase() === 'admin';

  const size = 30;
  const cellSize = 20;

  useEffect(() => {
    const savedNick = localStorage.getItem('p_nick');
    const savedPass = localStorage.getItem('p_pass');
    if (savedNick && savedPass) { setAuth({ nick: savedNick, pass: savedPass }); setIsAuthOk(true); }

    // Загрузка полотна
    fetch('/api/pixels').then(res => res.json()).then(data => {
      const parsed: any = {};
      for (const k in data) {
        try { parsed[k] = typeof data[k] === 'string' ? JSON.parse(data[k]) : data[k]; } 
        catch(e) { parsed[k] = { color: data[k], user: '???' }; }
      }
      setPixels(parsed);
    });

    // Pusher (ключ вписан вручную)
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

    const userId = localStorage.getItem('p_id') || ('gen_'+auth.nick);
    if (!localStorage.getItem('p_id')) localStorage.setItem('p_id', userId);

    await fetch('/api/pixels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x, y, color: selectedColor, nickname: auth.nick, password: auth.pass, userId }),
    });
  };

  const adminAction = async (action: string, target?: string) => {
    const res = await fetch('/api/pixels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: auth.nick, password: auth.pass, action, targetId: target || banInput }),
    });
    const data = await res.json();
    if (action === 'get_users') setAdminData(data);
    if (action === 'ban') alert('Пользователь забанен!');
  };

  if (!isAuthOk) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#121212', color: '#fff' }}>
        <form onSubmit={(e) => { e.preventDefault(); setIsAuthOk(true); localStorage.setItem('p_nick', auth.nick); localStorage.setItem('p_pass', auth.pass); }} style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '30px', background: '#1e1e1e', borderRadius: '10px' }}>
          <h2>Pixel Battle</h2>
          <input placeholder="Ник" value={auth.nick} onChange={e => setAuth({...auth, nick: e.target.value})} style={{ padding: '10px' }} />
          <input type="password" placeholder="Пароль" value={auth.pass} onChange={e => setAuth({...auth, pass: e.target.value})} style={{ padding: '10px' }} />
          <button type="submit" style={{ padding: '10px', backgroundColor: '#4CAF50', color: '#fff' }}>Войти</button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#121212', color: '#fff', minHeight: '100vh', padding: '20px', fontFamily: 'sans-serif', userSelect: 'none' }} 
         onMouseDown={() => isAdmin && setIsMouseDown(true)}>
      
      {/* ПАНЕЛЬ АДМИНА */}
      {isAdmin && (
        <div style={{ position: 'fixed', left: 10, top: 10, width: '220px', background: '#1e1e1e', padding: '15px', borderRadius: '10px', border: '2px solid gold', fontSize: '11px', zIndex: 1000 }}>
          <h4 style={{ color: 'gold', margin: '0 0 10px 0' }}>ADMIN PANEL</h4>
          <button onClick={() => adminAction('get_users')} style={{ width: '100%', marginBottom: '10px' }}>Список игроков</button>
          <div style={{ maxHeight: '80px', overflowY: 'auto', marginBottom: '10px', background: '#000', padding: '5px' }}>
            <b>Юзеры:</b> {adminData.users?.join(', ')}
          </div>
          <input placeholder="ID для бана" value={banInput} onChange={e => setBanInput(e.target.value)} style={{ width: '100%', marginBottom: '5px' }} />
          <button onClick={() => adminAction('ban')} style={{ width: '100%', backgroundColor: 'red', color: '#fff', marginBottom: '10px' }}>ЗАБАНИТЬ ПО ID</button>
          <button onClick={() => { if(confirm('Очистить поле?')) adminAction('clear_all') }} style={{ width: '100%', backgroundColor: '#444', color: '#fff' }}>ОЧИСТИТЬ ПОЛЕ</button>
          <input type="text" placeholder="Цвет HEX: #ff00ff" onChange={e => setSelectedColor(e.target.value)} style={{ width: '100%', marginTop: '10px', background: '#000', color: '#fff' }} />
        </div>
      )}

      <div style={{ position: 'fixed', top: 10, right: 10 }}>
        {auth.nick} <button onClick={() => {localStorage.clear(); location.reload();}} style={{fontSize:'10px'}}>Выход</button>
      </div>

      <h1 style={{ letterSpacing: '3px' }}>PIXEL BATTLE LIVE</h1>

      {!isAdmin && (
        <div style={{ width: '300px', height: '6px', backgroundColor: '#333', marginBottom: '20px', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ width: `${cooldown}%`, height: '100%', backgroundColor: '#4CAF50' }} />
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {['#000000', '#808080', '#ffffff', '#ff0000'].map(c => (
          <div key={c} onClick={() => setSelectedColor(c)} style={{ width: '35px', height: '35px', backgroundColor: c, border: selectedColor === c ? '3px solid gold' : '1px solid #333', cursor: 'pointer', borderRadius: '5px' }} />
        ))}
      </div>

      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${size}, ${cellSize}px)`, gridTemplateRows: `repeat(${size}, ${cellSize}px)`, backgroundColor: '#333', gap: '1px', border: '2px solid #444' }}>
        {Array.from({ length: size * size }).map((_, i) => {
          const x = i % size; const y = Math.floor(i / size);
          const data = pixels[`${x}-${y}`];

          return (
            <div 
              key={i} 
              onMouseDown={() => { if(isAdmin) setIsMouseDown(true); clickPixel(x, y); }}
              onMouseEnter={() => { 
                if (isAdmin && isMouseDown) clickPixel(x, y);
                if (data) setHoveredInfo({ ...data, x, y });
              }}
              onMouseLeave={() => setHoveredInfo(null)}
              style={{ width: `${cellSize}px`, height: `${cellSize}px`, backgroundColor: data?.color || '#ffffff', cursor: 'crosshair' }}
            />
          );
        })}

        {/* TOOLTIP (ИНФОРМАЦИЯ ПРИ НАВЕДЕНИИ) */}
        {hoveredInfo && (
          <div style={{ 
            position: 'absolute', top: -85, left: '50%', transform: 'translateX(-50%)', 
            backgroundColor: '#222', padding: '10px', borderRadius: '5px', 
            fontSize: '11px', border: '1px solid gold', zIndex: 100, 
            pointerEvents: 'none', textAlign: 'center', boxShadow: '0 5px 15px rgba(0,0,0,0.5)' 
          }}>
            <span style={{color: 'gold'}}>Автор:</span> {String(hoveredInfo.user)} <br/>
            <span style={{color: 'gold'}}>ID:</span> {String(hoveredInfo.userId || 'n/a')} <br/>
            <span style={{color: 'gold'}}>Цвет:</span> {String(hoveredInfo.color)}
          </div>
        )}
      </div>
    </div>
  );
}