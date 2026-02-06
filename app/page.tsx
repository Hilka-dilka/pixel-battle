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
  const [authError, setAuthError] = useState<string>('');
  
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
  
  // Для предотвращения случайного рисования при перемещении
  const dragStartPosRef = useRef<{x: number, y: number} | null>(null);
  const isClickActionRef = useRef<boolean>(true);

  const size = 60;
  const cellSize = 20;

  useEffect(() => {
    const savedNick = localStorage.getItem('p_nick');
    const savedPass = localStorage.getItem('p_pass');
    if (savedNick && savedPass) { 
      // Проверяем сохраненные данные при загрузке
      checkAuth(savedNick, savedPass);
    }

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

    // Предотвращаем скролл страницы колесиком
    const handleWheelGlobal = (e: WheelEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('[data-canvas]')) {
        e.preventDefault();
      }
    };

    window.addEventListener('wheel', handleWheelGlobal, { passive: false });

    return () => { 
      pusher.unsubscribe('pixel-channel'); 
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('wheel', handleWheelGlobal);
      
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, [isAdmin]);

  // Проверка авторизации
  const checkAuth = async (nickname: string, password: string) => {
    try {
      const res = await fetch('/api/pixels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname, password, action: 'auth_check' }),
      });
      
      const data = await res.json();
      if (res.ok) {
        setAuth({ nick: nickname, pass: password });
        setIsAuthOk(true);
        setAuthError('');
        localStorage.setItem('p_nick', nickname);
        localStorage.setItem('p_pass', password);
      } else {
        setAuthError(data.error || 'Auth failed');
        localStorage.removeItem('p_nick');
        localStorage.removeItem('p_pass');
      }
    } catch (error) {
      setAuthError('Network error');
    }
  };

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

    const res = await fetch('/api/pixels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x, y, color: selectedColor, nickname: auth.nick, password: auth.pass, userId }),
    });
    
    if (!res.ok) {
      const data = await res.json();
      if (data.error === 'Invalid password' || data.error === 'Auth') {
        setAuthError('Session expired. Please login again.');
        setIsAuthOk(false);
        localStorage.clear();
      }
    }
  };

  const adminAction = async (action: string, target?: string) => {
    const res = await fetch('/api/pixels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: auth.nick, password: auth.pass, action, targetId: target || banInput }),
    });
    const data = await res.json();
    if (res.ok) {
      if (action === 'get_users') setAdminData(data);
      if (action === 'ban') alert('Пользователь забанен!');
    } else {
      if (data.error === 'Invalid admin password') {
        setAuthError('Invalid admin password');
        setIsAuthOk(false);
        localStorage.clear();
      }
    }
  };

  // Обработчики для перемещения полотна (для всех)
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) { // ЛКМ
      dragStartPosRef.current = { x: e.clientX, y: e.clientY };
      isClickActionRef.current = true;
      e.preventDefault();
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!isDragging && dragStartPosRef.current) {
      const dx = e.clientX - dragStartPosRef.current.x;
      const dy = e.clientY - dragStartPosRef.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > 10) {
        setIsDragging(true);
        isClickActionRef.current = false;
        setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
      }
    }
    
    if (isDragging) {
      setOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleCanvasMouseUp = () => {
    setIsDragging(false);
    dragStartPosRef.current = null;
    isClickActionRef.current = true;
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
    }, 2000);
  };

  const handlePixelLeave = () => {
    setHoveredInfo(null);
    setShowHoveredInfo(false);
    
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  // Клик по пикселю
  const handlePixelClick = (e: React.MouseEvent, x: number, y: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isAdmin ? isSpaceDown : true) {
      clickPixel(x, y);
    }
  };

  // Сброс камеры
  const resetView = () => {
    setOffset({ x: 0, y: 0 });
    setScale(1);
  };

  // Авторизация
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    await checkAuth(auth.nick, auth.pass);
  };

  if (!isAuthOk) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#121212', color: '#fff' }}>
        <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '30px', background: '#1e1e1e', borderRadius: '10px', width: '300px' }}>
          <h2>Pixel Battle</h2>
          {authError && (
            <div style={{ color: '#ff4444', fontSize: '14px', padding: '8px', background: '#2a1a1a', borderRadius: '4px' }}>
              {authError}
            </div>
          )}
          <input 
            placeholder="Ник" 
            value={auth.nick} 
            onChange={e => setAuth({...auth, nick: e.target.value})} 
            style={{ padding: '10px' }} 
            required
          />
          <input 
            type="password" 
            placeholder="Пароль" 
            value={auth.pass} 
            onChange={e => setAuth({...auth, pass: e.target.value})} 
            style={{ padding: '10px' }} 
            required
          />
          <div style={{ fontSize: '12px', color: '#aaa', marginTop: '-5px' }}>
            {auth.nick.toLowerCase() === 'admin' ? 'Введите пароль админа' : 'Создаст аккаунт, если не существует'}
          </div>
          <button type="submit" style={{ padding: '10px', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Войти
          </button>
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
      fontFamily: 'sans-serif', 
      userSelect: 'none',
      overflow: 'hidden',
      position: 'fixed',
      width: '100%',
      height: '100%',
      top: 0,
      left: 0,
      margin: 0
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

      {/* ЗАГОЛОВОК */}
      <div style={{ 
        position: 'fixed', 
        top: 10, 
        left: '50%', 
        transform: 'translateX(-50%)',
        zIndex: 2000,
        textAlign: 'center',
        width: '100%',
        pointerEvents: 'none'
      }}>
        <h1 style={{ 
          letterSpacing: '3px', 
          fontSize: '28px',
          textShadow: '0 2px 8px rgba(0,0,0,0.8)',
          margin: 0,
          color: '#fff'
        }}>
          PIXEL BATTLE LIVE
        </h1>
      </div>

      {/* КНОПКА ВЫХОДА */}
      <div style={{ 
        position: 'fixed', 
        top: 10, 
        right: 10, 
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}>
        <span style={{ 
          fontSize: '14px',
          color: '#4CAF50',
          fontWeight: 'bold'
        }}>{auth.nick}</span>
        <button 
          onClick={() => {localStorage.clear(); location.reload();}} 
          style={{
            fontSize: '11px', 
            padding: '5px 10px',
            backgroundColor: '#333',
            border: '1px solid #555',
            borderRadius: '4px',
            color: '#fff',
            cursor: 'pointer'
          }}
        >
          Выход
        </button>
      </div>

      {/* КУЛДАУН БАР */}
      {!isAdmin && (
        <div style={{ 
          position: 'fixed', 
          bottom: '170px',
          left: '50%', 
          transform: 'translateX(-50%)',
          width: '300px', 
          height: '8px', 
          backgroundColor: '#222', 
          borderRadius: '4px', 
          overflow: 'hidden',
          zIndex: 2000,
          border: '1px solid #333',
          boxShadow: '0 3px 10px rgba(0,0,0,0.5)'
        }}>
          <div style={{ 
            width: `${cooldown}%`, 
            height: '100%', 
            backgroundColor: cooldown === 100 ? '#4CAF50' : '#FF9800',
            transition: 'width 0.1s linear, background-color 0.3s ease'
          }} />
          <div style={{
            position: 'absolute',
            top: '-22px',
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: '12px',
            color: cooldown === 100 ? '#4CAF50' : '#FF9800',
            whiteSpace: 'nowrap',
            fontWeight: 'bold',
            textShadow: '0 1px 2px rgba(0,0,0,0.8)'
          }}>
            {cooldown === 100 ? '✅ Готов к рисованию' : `⏳ Ожидание: ${cooldown}%`}
          </div>
        </div>
      )}

      {/* ПАЛИТРА ЦВЕТОВ */}
      <div style={{ 
        position: 'fixed', 
        bottom: '100px',
        left: '50%', 
        transform: 'translateX(-50%)',
        display: 'flex', 
        gap: '15px', 
        zIndex: 2000,
        backgroundColor: 'rgba(20, 20, 20, 0.95)',
        padding: '15px 25px',
        borderRadius: '15px',
        border: '2px solid #444',
        boxShadow: '0 6px 20px rgba(0,0,0,0.7)',
        alignItems: 'center'
      }}>
        <div style={{ 
          fontSize: '13px', 
          color: '#aaa',
          marginRight: '15px',
          whiteSpace: 'nowrap'
        }}>
          Выбор цвета:
        </div>
        {['#000000', '#808080', '#ffffff', '#ff0000'].map(c => (
          <div 
            key={c} 
            onClick={() => setSelectedColor(c)} 
            style={{ 
              width: '45px', 
              height: '45px', 
              backgroundColor: c, 
              border: selectedColor === c ? '4px solid gold' : '3px solid #666', 
              cursor: 'pointer', 
              borderRadius: '10px',
              boxShadow: '0 3px 8px rgba(0,0,0,0.5)',
              transition: 'all 0.2s ease',
              position: 'relative'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.2)';
              e.currentTarget.style.boxShadow = '0 5px 15px rgba(0,0,0,0.7)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 3px 8px rgba(0,0,0,0.5)';
            }}
            title={c}
          />
        ))}
      </div>

      {/* ОБЛАСТЬ С ПОЛОТНОМ */}
      <div 
        ref={canvasRef}
        data-canvas="true"
        style={{ 
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
          cursor: isDragging ? 'grabbing' : 'grab',
          transition: isDragging ? 'none' : 'transform 0.1s ease',
          zIndex: 1
        }}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={() => {
          setIsDragging(false);
          dragStartPosRef.current = null;
          isClickActionRef.current = true;
        }}
        onWheel={handleWheel}
      >
        {/* СЕТКА ПИКСЕЛЕЙ */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: `repeat(${size}, ${cellSize}px)`, 
          gridTemplateRows: `repeat(${size}, ${cellSize}px)`, 
          backgroundColor: '#333', 
          gap: '1px', 
          border: '2px solid #444',
          boxShadow: '0 8px 24px rgba(0,0,0,0.8)'
        }}>
          {Array.from({ length: size * size }).map((_, i) => {
            const x = i % size; 
            const y = Math.floor(i / size);
            const data = pixels[`${x}-${y}`];

            return (
              <div 
                key={i} 
                onClick={(e) => handlePixelClick(e, x, y)}
                onMouseEnter={() => { 
                  if (isAdmin && isSpaceDown) {
                    clickPixel(x, y);
                  }
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

      {/* TOOLTIP */}
      {showHoveredInfo && hoveredInfo && (
        <div style={{ 
          position: 'fixed',
          top: mousePosition.y + 15,
          left: mousePosition.x + 15,
          backgroundColor: '#222',
          padding: '12px',
          borderRadius: '6px',
          fontSize: '12px',
          border: '1px solid gold',
          zIndex: 3000,
          pointerEvents: 'none',
          boxShadow: '0 5px 20px rgba(0,0,0,0.8)',
          minWidth: '200px',
          animation: 'fadeIn 0.3s ease',
          backdropFilter: 'blur(2px)'
        }}>
          <div style={{ marginBottom: '6px' }}>
            <span style={{color: 'gold', fontWeight: 'bold'}}>Позиция:</span> {hoveredInfo.x}, {hoveredInfo.y}
          </div>
          <div style={{ marginBottom: '6px' }}>
            <span style={{color: 'gold', fontWeight: 'bold'}}>Автор:</span> {String(hoveredInfo.user)}
          </div>
          <div style={{ marginBottom: '6px' }}>
            <span style={{color: 'gold', fontWeight: 'bold'}}>ID:</span> {String(hoveredInfo.userId || 'n/a')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{color: 'gold', fontWeight: 'bold'}}>Цвет:</span> 
            <div style={{ 
              width: '20px', 
              height: '20px', 
              backgroundColor: hoveredInfo.color, 
              border: '1px solid #fff',
              borderRadius: '3px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.5)'
            }} />
            <span style={{fontSize: '11px'}}>{String(hoveredInfo.color)}</span>
          </div>
        </div>
      )}

      {/* ИНФОРМАЦИЯ О КАМЕРЕ */}
      <div style={{ 
        position: 'fixed', 
        bottom: 10, 
        left: 10, 
        background: 'rgba(0,0,0,0.8)', 
        padding: '10px 12px', 
        borderRadius: '6px',
        fontSize: '12px',
        border: '1px solid #444',
        zIndex: 2000,
        boxShadow: '0 3px 10px rgba(0,0,0,0.5)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ color: '#aaa' }}>
            Камера: <span style={{color: '#4CAF50'}}>x:{offset.x.toFixed(0)} y:{offset.y.toFixed(0)}</span> | 
            Масштаб: <span style={{color: '#4CAF50'}}>{scale.toFixed(2)}x</span>
          </div>
          <button 
            onClick={resetView} 
            style={{ 
              padding: '3px 10px', 
              fontSize: '11px', 
              backgroundColor: '#333', 
              color: '#fff',
              border: '1px solid #555',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Сброс
          </button>
        </div>
      </div>

      {/* ИНСТРУКЦИЯ */}
      <div style={{ 
        position: 'fixed', 
        bottom: 10, 
        right: 10, 
        background: 'rgba(0,0,0,0.8)', 
        padding: '10px 12px', 
        borderRadius: '6px',
        fontSize: '12px',
        border: '1px solid #444',
        maxWidth: '250px',
        zIndex: 2000,
        boxShadow: '0 3px 10px rgba(0,0,0,0.5)'
      }}>
        <div style={{ color: '#4CAF50', marginBottom: '4px', fontWeight: 'bold' }}>Управление:</div>
        <div>• Перемещение: зажать ЛКМ и тянуть</div>
        <div>• Зум: колёсико мыши</div>
        <div>• Рисование: клик по пикселю</div>
        {isAdmin && <div>• Режим рисования админа: ПРОБЕЛ</div>}
        <div>• Информация: навести (2 сек)</div>
      </div>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        body, html {
          margin: 0;
          padding: 0;
          overflow: hidden;
          width: 100%;
          height: 100%;
        }
      `}</style>
    </div>
  );
}