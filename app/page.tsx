'use client';
import { useEffect, useState, useRef } from 'react';
import Pusher from 'pusher-js';

export default function Home() {
  const [pixels, setPixels] = useState<Record<string, any>>({});
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [auth, setAuth] = useState({ nick: '', pass: '' });
  const [isAuthOk, setIsAuthOk] = useState(false);
  const [cooldown, setCooldown] = useState(100);
  const [canClick, setCanClick] = useState(true);
  const [hoveredInfo, setHoveredInfo] = useState<any>(null);
  const [showHoveredInfo, setShowHoveredInfo] = useState(false);
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  
  // Состояние админки
  const [adminData, setAdminData] = useState<{users: string[], banned: string[]}>({users: [], banned: []});
  const [banInput, setBanInput] = useState('');
  const isAdmin = auth.nick.toLowerCase() === 'admin';

  // Состояние для перемещения и зума
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const size = 60;
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

    // Обработчики для зажатия ПРОБЕЛА (только админ)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && isAdmin) {
        e.preventDefault();
        setIsSpaceDown(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && isAdmin) {
        setIsSpaceDown(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Отслеживание позиции мыши для tooltip
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => { 
      pusher.unsubscribe('pixel-channel'); 
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, [isAdmin]);

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

  // Обработчики для перемещения полотна (для всех)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) { // ЛКМ
      setIsDragging(true);
      setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.5, Math.min(3, scale * delta));
    setScale(newScale);
  };

  // Обработчики для tooltip с задержкой
  const handlePixelEnter = (data: any) => {
    setHoveredInfo(data);
    setShowHoveredInfo(false);
    
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    
    hoverTimeoutRef.current = setTimeout(() => {
      setShowHoveredInfo(true);
    }, 2000); // 2 секунды задержки
  };

  const handlePixelLeave = () => {
    setHoveredInfo(null);
    setShowHoveredInfo(false);
    
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  // Сброс камеры
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
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      backgroundColor: '#121212', 
      color: '#fff', 
      minHeight: '100vh', 
      padding: '20px', 
      fontFamily: 'sans-serif', 
      userSelect: 'none',
      overflow: 'hidden',
      position: 'relative'
    }}>
      
      {/* ПАНЕЛЬ АДМИНА */}
      {isAdmin && (
        <div style={{ position: 'fixed', left: 10, top: 10, width: '220px', background: '#1e1e1e', padding: '15px', borderRadius: '10px', border: '2px solid gold', fontSize: '11px', zIndex: 2000 }}>
          <h4 style={{ color: 'gold', margin: '0 0 10px 0' }}>ADMIN PANEL</h4>
          <div style={{ fontSize: '10px', color: '#ccc', marginBottom: '10px', padding: '5px', background: '#222', borderRadius: '3px' }}>
            <div>ЗАЖАТИЕ: {isSpaceDown ? '✔️ ПРОБЕЛ' : '❌ ПРОБЕЛ'}</div>
          </div>
          <button onClick={() => adminAction('get_users')} style={{ width: '100%', marginBottom: '10px' }}>Список игроков</button>
          <div style={{ maxHeight: '80px', overflowY: 'auto', marginBottom: '10px', background: '#000', padding: '5px' }}>
            <b>Юзеры:</b> {adminData.users?.join(', ')}
          </div>
          <div style={{ maxHeight: '80px', overflowY: 'auto', marginBottom: '10px', background: '#000', padding: '5px', border: '1px solid red' }}>
            <b style={{ color: '#ff6666' }}>Забаненные ID:</b> {adminData.banned?.join(', ') || 'нет'}
          </div>
          <input placeholder="ID для бана" value={banInput} onChange={e => setBanInput(e.target.value)} style={{ width: '100%', marginBottom: '5px' }} />
          <button onClick={() => adminAction('ban')} style={{ width: '100%', backgroundColor: 'red', color: '#fff', marginBottom: '10px' }}>ЗАБАНИТЬ ПО ID</button>
          <button onClick={() => { if(confirm('Очистить поле?')) adminAction('clear_all') }} style={{ width: '100%', backgroundColor: '#444', color: '#fff' }}>ОЧИСТИТЬ ПОЛЕ</button>
        </div>
      )}

      {/* ВЫБОР ЦВЕТА (ФИКСИРОВАННЫЙ) */}
      <div style={{ 
        position: 'fixed', 
        top: '50%', 
        left: '20px', 
        transform: 'translateY(-50%)',
        display: 'flex', 
        flexDirection: 'column',
        gap: '8px', 
        zIndex: 2000,
        backgroundColor: 'rgba(30, 30, 30, 0.9)',
        padding: '15px',
        borderRadius: '10px',
        border: '1px solid #444',
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
      }}>
        {['#000000', '#808080', '#ffffff', '#ff0000'].map(c => (
          <div 
            key={c} 
            onClick={() => setSelectedColor(c)} 
            style={{ 
              width: '40px', 
              height: '40px', 
              backgroundColor: c, 
              border: selectedColor === c ? '3px solid gold' : '1px solid #333', 
              cursor: 'pointer', 
              borderRadius: '5px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
              transition: 'transform 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            title={c}
          />
        ))}
        <div style={{ 
          fontSize: '11px', 
          textAlign: 'center', 
          marginTop: '5px', 
          color: '#aaa',
          borderTop: '1px solid #444',
          paddingTop: '5px'
        }}>
          Выбран: <br/>
          <div style={{ 
            width: '20px', 
            height: '20px', 
            backgroundColor: selectedColor, 
            margin: '5px auto',
            border: '1px solid #fff',
            borderRadius: '3px'
          }} />
        </div>
      </div>

      <div style={{ position: 'fixed', top: 10, right: 10, zIndex: 2000 }}>
        {auth.nick} <button onClick={() => {localStorage.clear(); location.reload();}} style={{fontSize:'10px'}}>Выход</button>
      </div>

      <h1 style={{ letterSpacing: '3px', marginBottom: '10px', zIndex: 1000 }}>PIXEL BATTLE LIVE</h1>
      
      {!isAdmin && (
        <div style={{ 
          width: '300px', 
          height: '6px', 
          backgroundColor: '#333', 
          marginBottom: '20px', 
          borderRadius: '3px', 
          overflow: 'hidden',
          zIndex: 1000 
        }}>
          <div style={{ width: `${cooldown}%`, height: '100%', backgroundColor: '#4CAF50' }} />
        </div>
      )}

      {/* ОБЛАСТЬ С ПОЛОТНОМ */}
      <div 
        ref={canvasRef}
        style={{ 
          position: 'relative',
          cursor: isDragging ? 'grabbing' : 'grab',
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: 'center center',
          transition: isDragging ? 'none' : 'transform 0.1s ease',
          marginBottom: '50px'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {/* СЕТКА ПИКСЕЛЕЙ */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: `repeat(${size}, ${cellSize}px)`, 
          gridTemplateRows: `repeat(${size}, ${cellSize}px)`, 
          backgroundColor: '#333', 
          gap: '1px', 
          border: '2px solid #444'
        }}>
          {Array.from({ length: size * size }).map((_, i) => {
            const x = i % size; 
            const y = Math.floor(i / size);
            const data = pixels[`${x}-${y}`];

            return (
              <div 
                key={i} 
                onMouseDown={(e) => { 
                  e.preventDefault();
                  if (isAdmin ? isSpaceDown : true) {
                    clickPixel(x, y);
                  }
                }}
                onMouseEnter={() => { 
                  if (isAdmin && isSpaceDown) clickPixel(x, y);
                  if (data) handlePixelEnter({ ...data, x, y });
                }}
                onMouseLeave={handlePixelLeave}
                style={{ 
                  width: `${cellSize}px`, 
                  height: `${cellSize}px`, 
                  backgroundColor: data?.color || '#ffffff', 
                  cursor: (isAdmin && isSpaceDown) ? 'crosshair' : 'pointer'
                }}
              />
            );
          })}
        </div>
      </div>

      {/* TOOLTIP С ИНФОРМАЦИЕЙ (ПОЯВЛЯЕТСЯ У КУРСОРА С ЗАДЕРЖКОЙ) */}
      {showHoveredInfo && hoveredInfo && (
        <div style={{ 
          position: 'fixed',
          top: mousePosition.y + 15,
          left: mousePosition.x + 15,
          backgroundColor: '#222',
          padding: '10px',
          borderRadius: '5px',
          fontSize: '12px',
          border: '1px solid gold',
          zIndex: 3000,
          pointerEvents: 'none',
          boxShadow: '0 5px 15px rgba(0,0,0,0.7)',
          minWidth: '200px',
          animation: 'fadeIn 0.3s ease'
        }}>
          <div style={{ marginBottom: '5px' }}>
            <span style={{color: 'gold'}}>Позиция:</span> {hoveredInfo.x}, {hoveredInfo.y}
          </div>
          <div style={{ marginBottom: '5px' }}>
            <span style={{color: 'gold'}}>Автор:</span> {String(hoveredInfo.user)}
          </div>
          <div style={{ marginBottom: '5px' }}>
            <span style={{color: 'gold'}}>ID:</span> {String(hoveredInfo.userId || 'n/a')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{color: 'gold'}}>Цвет:</span> 
            <div style={{ 
              width: '20px', 
              height: '20px', 
              backgroundColor: hoveredInfo.color, 
              border: '1px solid #fff',
              borderRadius: '3px'
            }} />
            <span>{String(hoveredInfo.color)}</span>
          </div>
        </div>
      )}

      {/* ИНФОРМАЦИЯ О КАМЕРЕ */}
      <div style={{ 
        position: 'fixed', 
        bottom: 10, 
        left: 10, 
        background: 'rgba(0,0,0,0.7)', 
        padding: '8px', 
        borderRadius: '5px',
        fontSize: '12px',
        border: '1px solid #444',
        zIndex: 2000
      }}>
        Камера: x:{offset.x.toFixed(0)} y:{offset.y.toFixed(0)} масштаб: {scale.toFixed(2)}x
        <button 
          onClick={resetView} 
          style={{ 
            marginLeft: '10px', 
            padding: '2px 6px', 
            fontSize: '10px', 
            backgroundColor: '#333', 
            color: '#fff',
            border: '1px solid #555',
            borderRadius: '3px',
            cursor: 'pointer'
          }}
        >
          Сброс
        </button>
      </div>

      {/* ИНСТРУКЦИЯ */}
      <div style={{ 
        position: 'fixed', 
        bottom: 10, 
        right: 10, 
        background: 'rgba(0,0,0,0.7)', 
        padding: '8px', 
        borderRadius: '5px',
        fontSize: '12px',
        border: '1px solid #444',
        maxWidth: '250px',
        zIndex: 2000
      }}>
        <div style={{ color: '#4CAF50', marginBottom: '3px' }}>Управление:</div>
        <div>• Перемещение: зажать ЛКМ и тянуть</div>
        <div>• Зум: колёсико мыши</div>
        {isAdmin && <div>• Рисование: зажать ПРОБЕЛ и кликать</div>}
        <div>• Информация: навести на пиксель (2 сек)</div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}