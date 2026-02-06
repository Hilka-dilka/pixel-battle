'use client';
import { useEffect, useState } from 'react';

export default function Home() {
  const [pixels, setPixels] = useState<Record<string, any>>({});
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [auth, setAuth] = useState({ nick: '', pass: '' });
  const [isAuthOk, setIsAuthOk] = useState(false);
  const [cooldown, setCooldown] = useState(100);
  const [canClick, setCanClick] = useState(true);
  const [hoveredInfo, setHoveredInfo] = useState<any>(null);
  
  const [adminData, setAdminData] = useState<{users: string[], banned: string[]}>({users: [], banned: []});
  const [banInput, setBanInput] = useState('');
  const isAdmin = auth.nick.toLowerCase() === 'admin';

  const size = 30; // 30x30 пикселей
  const cellSize = 20; // Размер одного пикселя в браузере (в px)

  useEffect(() => {
    const savedNick = localStorage.getItem('p_nick');
    const savedPass = localStorage.getItem('p_pass');
    if (savedNick && savedPass) {
      setAuth({ nick: savedNick, pass: savedPass });
      setIsAuthOk(true);
    }
    const load = async () => {
      const res = await fetch('/api/pixels');
      const data = await res.json();
      const parsed: any = {};
      for (const k in data) { try { parsed[k] = JSON.parse(data[k]); } catch(e) { parsed[k] = {color: data[k]}; } }
      setPixels(parsed);
    };
    load();
    const interval = setInterval(load, 2000);
    return () => clearInterval(interval);
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
    if (!canClick && !isAdmin) return;
    const key = `${x}-${y}`;
    setPixels({ ...pixels, [key]: { color: selectedColor, user: auth.nick, userId: 'local' } });
    if (!isAdmin) { setCanClick(false); setCooldown(0); }

    await fetch('/api/pixels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x, y, color: selectedColor, nickname: auth.nick, password: auth.pass, userId: localStorage.getItem('p_id') || 'gen_'+auth.nick }),
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
    if (action === 'ban') alert('Забанен!');
  };

  if (!isAuthOk) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#121212', color: '#fff' }}>
        <form onSubmit={(e) => { e.preventDefault(); setIsAuthOk(true); localStorage.setItem('p_nick', auth.nick); localStorage.setItem('p_pass', auth.pass); }} style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '30px', background: '#1e1e1e', borderRadius: '10px' }}>
          <h2>Pixel Battle</h2>
          <input placeholder="Никнейм" value={auth.nick} onChange={e => setAuth({...auth, nick: e.target.value})} style={{ padding: '10px' }} />
          <input type="password" placeholder="Пароль" value={auth.pass} onChange={e => setAuth({...auth, pass: e.target.value})} style={{ padding: '10px' }} />
          <button type="submit" style={{ padding: '10px', backgroundColor: '#4CAF50', color: '#fff', cursor: 'pointer' }}>Войти</button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#121212', color: '#fff', minHeight: '100vh', padding: '20px', fontFamily: 'sans-serif' }}>
      
      {isAdmin && (
        <div style={{ position: 'fixed', right: 10, top: 50, width: '200px', background: '#1e1e1e', padding: '15px', borderRadius: '10px', border: '2px solid gold', fontSize: '12px', zIndex: 1000 }}>
          <h3 style={{ color: 'gold', margin: '0 0 10px 0' }}>ADMIN PANEL</h3>
          <button onClick={() => adminAction('get_users')} style={{ width: '100%', marginBottom: '5px' }}>Обновить списки</button>
          <input placeholder="ID для бана" value={banInput} onChange={e => setBanInput(e.target.value)} style={{ width: '100%', marginBottom: '5px' }} />
          <button onClick={() => adminAction('ban')} style={{ width: '100%', backgroundColor: 'red', color: '#fff' }}>ЗАБАНИТЬ</button>
          <input type="text" placeholder="HEX Цвет: #ffffff" onChange={e => setSelectedColor(e.target.value)} style={{ width: '100%', marginTop: '10px', background: '#000', color: '#fff' }} />
          <p style={{ color: 'gold' }}>⚡ God Mode ON</p>
        </div>
      )}

      <div style={{ position: 'fixed', top: 10, right: 10 }}>
        Привет, {auth.nick}! <button onClick={() => {localStorage.clear(); location.reload();}}>Выход</button>
      </div>

      <h1 style={{ letterSpacing: '3px' }}>PIXEL BATTLE</h1>

      {!isAdmin && (
        <div style={{ width: '300px', height: '8px', backgroundColor: '#333', marginBottom: '20px', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ width: `${cooldown}%`, height: '100%', backgroundColor: '#4CAF50', transition: 'width 0.1s linear' }} />
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {['#000000', '#808080', '#ffffff', '#ff0000'].map(c => (
          <div key={c} onClick={() => setSelectedColor(c)} style={{ 
            width: '35px', height: '35px', backgroundColor: c, 
            border: selectedColor === c ? '3px solid gold' : '1px solid #555', 
            cursor: 'pointer', borderRadius: '5px' 
          }} />
        ))}
      </div>

      {/* ИСПРАВЛЕННАЯ СЕТКА */}
      <div style={{ 
        position: 'relative', 
        display: 'grid', 
        gridTemplateColumns: `repeat(${size}, ${cellSize}px)`, // Фиксированный размер колонки
        gridTemplateRows: `repeat(${size}, ${cellSize}px)`,    // Фиксированный размер строки
        backgroundColor: '#333', // Цвет сетки (линий)
        gap: '1px',             // Толщина линии сетки
        border: '2px solid #444',
        boxShadow: '0 0 30px rgba(0,0,0,0.5)'
      }}>
        {Array.from({ length: size * size }).map((_, i) => {
          const x = i % size; const y = Math.floor(i / size);
          const data = pixels[`${x}-${y}`];
          return (
            <div 
              key={i} 
              onClick={() => clickPixel(x, y)}
              onMouseEnter={() => data && setHoveredInfo({ ...data, x, y })}
              onMouseLeave={() => setHoveredInfo(null)}
              style={{ 
                width: `${cellSize}px`, 
                height: `${cellSize}px`, 
                backgroundColor: data?.color || '#ffffff', 
                cursor: canClick || isAdmin ? 'crosshair' : 'wait'
              }}
            />
          );
        })}

        {/* Инфо при наведении */}
        {hoveredInfo && (
          <div style={{ 
            position: 'absolute', top: -70, left: '50%', transform: 'translateX(-50%)', 
            backgroundColor: '#222', color: '#fff', padding: '10px', borderRadius: '5px', 
            fontSize: '12px', zIndex: 100, border: '1px solid gold', pointerEvents: 'none'
          }}>
            👤 {hoveredInfo.user} <br/> 🆔 {hoveredInfo.userId || 'unknown'} <br/> 🎨 {hoveredInfo.color}
          </div>
        )}
      </div>
    </div>
  );
}