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
  
  // Админ-состояния
  const [adminData, setAdminData] = useState<{users: string[], banned: string[]}>({users: [], banned: []});
  const [banInput, setBanInput] = useState('');
  const isAdmin = auth.nick.toLowerCase() === 'admin';

  const size = 30;

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
    if (!canClick && !isAdmin) { // Админу кулдаун не нужен
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
      
      {/* ПАНЕЛЬ АДМИНА */}
      {isAdmin && (
        <div style={{ position: 'fixed', right: 10, top: 50, width: '200px', background: '#1e1e1e', padding: '15px', borderRadius: '10px', border: '2px solid gold', fontSize: '12px', zIndex: 1000 }}>
          <h3 style={{ color: 'gold', margin: '0 0 10px 0' }}>ADMIN PANEL</h3>
          <button onClick={() => adminAction('get_users')} style={{ width: '100%', marginBottom: '5px' }}>Обновить списки</button>
          <div style={{ maxHeight: '100px', overflow: 'auto', marginBottom: '10px', border: '1px solid #333' }}>
            <b>Юзеры:</b> {adminData.users.join(', ')}
          </div>
          <input placeholder="ID для бана" value={banInput} onChange={e => setBanInput(e.target.value)} style={{ width: '100%', marginBottom: '5px', fontSize: '10px' }} />
          <button onClick={() => adminAction('ban')} style={{ width: '100%', backgroundColor: 'red', color: '#fff' }}>ЗАБАНИТЬ</button>
          <div style={{ marginTop: '10px' }}>
            <b>Свой цвет:</b>
            <input type="text" placeholder="#ffffff" onChange={e => setSelectedColor(e.target.value)} style={{ width: '100%', background: '#000', color: '#fff', border: '1px solid #555' }} />
          </div>
          <p style={{ color: 'gold', marginTop: '10px' }}>⚡ God Mode ON</p>
        </div>
      )}

      <div style={{ position: 'fixed', top: 10, right: 10 }}>
        Привет, {auth.nick}! <button onClick={() => {localStorage.clear(); location.reload();}}>Выход</button>
      </div>

      <h1>PIXEL BATTLE</h1>

      {!isAdmin && (
        <div style={{ width: '300px', height: '6px', backgroundColor: '#333', marginBottom: '20px' }}>
          <div style={{ width: `${cooldown}%`, height: '100%', backgroundColor: '#4CAF50' }} />
        </div>
      )}

      <div style={{ display: 'flex', gap: '5px', marginBottom: '20px' }}>
        {['#000000', '#808080', '#ffffff', '#ff0000'].map(c => (
          <div key={c} onClick={() => setSelectedColor(c)} style={{ width: '30px', height: '30px', backgroundColor: c, border: selectedColor === c ? '2px solid gold' : '1px solid #333', cursor: 'pointer' }} />
        ))}
      </div>

      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${size}, 18px)`, backgroundColor: '#e0e0e0', gap: '0.5px' }}>
        {Array.from({ length: size * size }).map((_, i) => {
          const x = i % size; const y = Math.floor(i / size);
          const data = pixels[`${x}-${y}`];
          return (
            <div key={i} onClick={() => clickPixel(x, y)}
              onMouseEnter={() => data && setHoveredInfo({ ...data, x, y })}
              onMouseLeave={() => setHoveredInfo(null)}
              style={{ width: '18px', height: '18px', backgroundColor: data?.color || '#ffffff', cursor: 'crosshair' }}
            />
          );
        })}
        {hoveredInfo && (
          <div style={{ position: 'absolute', top: -80, left: '50%', transform: 'translateX(-50%)', backgroundColor: '#333', padding: '10px', borderRadius: '5px', zIndex: 100 }}>
            👤 {hoveredInfo.user} <br/> 🆔 {hoveredInfo.userId} <br/> 🎨 {hoveredInfo.color}
          </div>
        )}
      </div>
    </div>
  );
}