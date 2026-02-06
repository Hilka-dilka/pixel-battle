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
  const [dragMode, setDragMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  
  // Состояние админки
  const [adminData, setAdminData] = useState<{users: string[], banned: string[]}>({users: [], banned: []});
  const [banInput, setBanInput] = useState('');
  const [holdMode, setHoldMode] = useState(true); // Новое состояние для режима зажима
  const isAdmin = auth.nick.toLowerCase() === 'admin';

  // Увеличенное полотно до 60x60
  const size = 60;
  const cellSize = 15;

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

    const handleGlobalMouseUp = () => {
      setIsMouseDown(false);
      setIsDragging(false);
    };
    
    window.addEventListener('mouseup', handleGlobalMouseUp);
    
    return () => { 
      pusher.unsubscribe('pixel-channel'); 
      window.removeEventListener('mouseup', handleGlobalMouseUp); 
    };
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
    if (action === 'ban') {
      alert('Пользователь забанен!');
      // Обновляем список забаненных после бана
      adminAction('get_users');
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (!isAdmin) return;
    
    if (holdMode) {
      // Режим зажима - рисуем
      setIsMouseDown(true);
    } else {
      // Режим перетаскивания - начинаем перетаскивание
      setIsDragging(true);
      setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!isAdmin) return;
    
    if (holdMode && isMouseDown) {
      // В режиме зажима рисуем при движении мыши
      const rect = e.currentTarget.getBoundingClientRect();
      const scaledCellSize = cellSize * scale;
      const x = Math.floor((e.clientX - rect.left - offset.x) / scaledCellSize);
      const y = Math.floor((e.clientY - rect.top - offset.y) / scaledCellSize);
      
      if (x >= 0 && x < size && y >= 0 && y < size) {
        clickPixel(x, y);
      }
    } else if (!holdMode && isDragging) {
      // В режиме перетаскивания двигаем канвас
      const newOffset = {
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      };
      setOffset(newOffset);
    }
  };

  const handleCanvasWheel = (e: React.WheelEvent) => {
    if (!isAdmin) return;
    
    e.preventDefault();
    const zoomIntensity = 0.1;
    const newScale = e.deltaY < 0 ? scale + zoomIntensity : scale - zoomIntensity;
    setScale(Math.min(Math.max(0.5, newScale), 3)); // Ограничиваем масштаб от 0.5x до 3x
  };

  const resetView = () => {
    setOffset({ x: 0, y: 0 });
    setScale(1);
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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#121212', color: '#fff', minHeight: '100vh', padding: '20px', fontFamily: 'sans-serif', userSelect: 'none' }}>
      
      {/* ПАНЕЛЬ АДМИНА */}
      {isAdmin && (
        <div style={{ position: 'fixed', left: 10, top: 10, width: '250px', background: '#1e1e1e', padding: '15px', borderRadius: '10px', border: '2px solid gold', fontSize: '11px', zIndex: 1000, maxHeight: '90vh', overflowY: 'auto' }}>
          <h4 style={{ color: 'gold', margin: '0 0 10px 0' }}>ADMIN PANEL</h4>
          
          {/* Тоггл режима зажима */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px', padding: '8px', background: '#000', borderRadius: '5px' }}>
            <span style={{ fontSize: '12px' }}>Режим зажима (Paint):</span>
            <div 
              onClick={() => setHoldMode(!holdMode)}
              style={{
                width: '50px',
                height: '24px',
                background: holdMode ? '#4CAF50' : '#666',
                borderRadius: '12px',
                position: 'relative',
                cursor: 'pointer',
                transition: 'background 0.3s'
              }}
            >
              <div style={{
                position: 'absolute',
                top: '2px',
                left: holdMode ? '28px' : '2px',
                width: '20px',
                height: '20px',
                background: '#fff',
                borderRadius: '50%',
                transition: 'left 0.3s'
              }} />
            </div>
          </div>
          
          <div style={{ fontSize: '10px', color: '#aaa', marginBottom: '10px', padding: '5px', background: '#000', borderRadius: '3px' }}>
            {holdMode ? '🖌️ Режим Paint: Зажмите и рисуйте' : '✋ Режим Drag: Перетаскивайте канвас'}
          </div>
          
          {/* Управление видом */}
          <div style={{ display: 'flex', gap: '5px', marginBottom: '15px' }}>
            <button 
              onClick={resetView}
              style={{ flex: 1, padding: '6px', background: '#333', border: 'none', color: '#fff', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}
            >
              Сброс вида
            </button>
            <div style={{ flex: 1, padding: '6px', background: '#000', borderRadius: '3px', textAlign: 'center', fontSize: '10px' }}>
              Zoom: {Math.round(scale * 100)}%
            </div>
          </div>
          
          <button onClick={() => adminAction('get_users')} style={{ width: '100%', marginBottom: '10px', padding: '8px' }}>Обновить списки</button>
          
          <div style={{ marginBottom: '10px', background: '#000', padding: '5px', borderRadius: '3px' }}>
            <b style={{color: '#4CAF50'}}>Игроки:</b>
            <div style={{ maxHeight: '100px', overflowY: 'auto', marginTop: '5px' }}>
              {adminData.users?.map((user, i) => (
                <div key={i} style={{padding: '2px 0', fontSize: '10px'}}>{user}</div>
              ))}
            </div>
          </div>
          
          <div style={{ marginBottom: '10px', background: '#000', padding: '5px', borderRadius: '3px' }}>
            <b style={{color: 'red'}}>Забаненные (ID):</b>
            <div style={{ maxHeight: '100px', overflowY: 'auto', marginTop: '5px' }}>
              {adminData.banned?.map((id, i) => (
                <div key={i} style={{padding: '2px 0', fontSize: '10px', color: '#ff6666'}}>{id}</div>
              ))}
            </div>
          </div>
          
          <input 
            placeholder="ID для бана (gen_ник)" 
            value={banInput} 
            onChange={e => setBanInput(e.target.value)} 
            style={{ width: '100%', marginBottom: '5px', background: '#000', color: '#fff', border: '1px solid #444', padding: '5px' }} 
          />
          <button 
            onClick={() => adminAction('ban')} 
            style={{ width: '100%', backgroundColor: 'red', color: '#fff', marginBottom: '10px', border: 'none', padding: '8px', borderRadius: '3px', cursor: 'pointer' }}
          >
            ЗАБАНИТЬ ПО ID
          </button>
          
          <button 
            onClick={() => { if(confirm('Очистить поле?')) adminAction('clear_all') }} 
            style={{ width: '100%', backgroundColor: '#444', color: '#fff', border: 'none', padding: '8px', borderRadius: '3px', marginBottom: '10px', cursor: 'pointer' }}
          >
            ОЧИСТИТЬ ПОЛЕ
          </button>
          
          <input 
            type="text" 
            placeholder="Цвет HEX: #ff00ff" 
            onChange={e => setSelectedColor(e.target.value)} 
            value={selectedColor}
            style={{ width: '100%', background: '#000', color: '#fff', border: '1px solid #444', padding: '5px', borderRadius: '3px' }} 
          />
        </div>
      )}

      <div style={{ position: 'fixed', top: 10, right: 10, zIndex: 1000 }}>
        <span style={{marginRight: '10px'}}>{auth.nick}</span>
        <button onClick={() => {localStorage.clear(); location.reload();}} style={{fontSize:'10px', padding: '5px 10px'}}>Выход</button>
      </div>

      <h1 style={{ letterSpacing: '3px', marginTop: '20px' }}>PIXEL BATTLE LIVE (60x60)</h1>

      {!isAdmin && (
        <div style={{ width: '300px', height: '6px', backgroundColor: '#333', marginBottom: '20px', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ width: `${cooldown}%`, height: '100%', backgroundColor: '#4CAF50' }} />
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {['#000000', '#808080', '#ffffff', '#ff0000'].map(c => (
          <div 
            key={c} 
            onClick={() => setSelectedColor(c)} 
            style={{ 
              width: '35px', 
              height: '35px', 
              backgroundColor: c, 
              border: selectedColor === c ? '3px solid gold' : '1px solid #333', 
              cursor: 'pointer', 
              borderRadius: '5px' 
            }} 
          />
        ))}
      </div>

      <div 
        style={{ 
          position: 'relative', 
          backgroundColor: '#333', 
          border: '2px solid #444',
          marginBottom: '50px',
          overflow: 'hidden',
          cursor: isAdmin ? (holdMode ? 'crosshair' : (isDragging ? 'grabbing' : 'grab')) : 'default',
          transformOrigin: '0 0'
        }}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={() => { setIsMouseDown(false); setIsDragging(false); }}
        onWheel={handleCanvasWheel}
      >
        <div 
          style={{ 
            display: 'grid', 
            gridTemplateColumns: `repeat(${size}, ${cellSize}px)`, 
            gridTemplateRows: `repeat(${size}, ${cellSize}px)`, 
            gap: '1px',
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: '0 0',
            transition: isDragging ? 'none' : 'transform 0.1s'
          }}
        >
          {Array.from({ length: size * size }).map((_, i) => {
            const x = i % size; 
            const y = Math.floor(i / size);
            const data = pixels[`${x}-${y}`];

            return (
              <div 
                key={i} 
                onMouseEnter={(e) => {
                  if (isAdmin && holdMode && isMouseDown) {
                    // В режиме зажима рисуем при наведении с зажатой кнопкой
                    clickPixel(x, y);
                  }
                  if (data) setHoveredInfo({ ...data, x, y });
                }}
                onMouseLeave={() => setHoveredInfo(null)}
                onClick={() => {
                  if (!isAdmin) {
                    clickPixel(x, y);
                  } else if (holdMode) {
                    // В режиме зажима клик тоже рисует
                    clickPixel(x, y);
                  }
                }}
                style={{ 
                  width: `${cellSize}px`, 
                  height: `${cellSize}px`, 
                  backgroundColor: data?.color || '#ffffff', 
                  transition: 'background-color 0.2s'
                }}
              />
            );
          })}

          {/* TOOLTIP (ИНФОРМАЦИЯ ПРИ НАВЕДЕНИИ) */}
          {hoveredInfo && isAdmin && (
            <div style={{ 
              position: 'absolute', 
              top: -85, 
              left: '50%', 
              transform: 'translateX(-50%)', 
              backgroundColor: '#222', 
              padding: '10px', 
              borderRadius: '5px', 
              fontSize: '11px', 
              border: '1px solid gold', 
              zIndex: 100, 
              pointerEvents: 'none', 
              textAlign: 'center', 
              boxShadow: '0 5px 15px rgba(0,0,0,0.5)',
              minWidth: '150px'
            }}>
              <div><span style={{color: 'gold'}}>Координаты:</span> {hoveredInfo.x}, {hoveredInfo.y}</div>
              <div><span style={{color: 'gold'}}>Автор:</span> {String(hoveredInfo.user)}</div>
              <div><span style={{color: 'gold'}}>ID:</span> {String(hoveredInfo.userId || 'n/a')}</div>
              <div><span style={{color: 'gold'}}>Цвет:</span> {String(hoveredInfo.color)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}