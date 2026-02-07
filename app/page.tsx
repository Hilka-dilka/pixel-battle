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
  const [cooldown, setCooldown] = useState(100);
  const [canClick, setCanClick] = useState(true);
  const [hoveredInfo, setHoveredInfo] = useState<any>(null);
  const [showHoveredInfo, setShowHoveredInfo] = useState(false);
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [authError, setAuthError] = useState<string>('');
  const [loadingStats, setLoadingStats] = useState(false);
  
  // Статистика игроков (доступна всем)
  const [playerStats, setPlayerStats] = useState<PlayerStats[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);

  // Состояние админки (только для админа)
  const [adminData, setAdminData] = useState<{
    users: string[], 
    banned: string[],
    userStats: Record<string, number>,
    onlineUsers: string[]
  }>({ users: [], banned: [], userStats: {}, onlineUsers: [] });
  
  const [banInput, setBanInput] = useState('');
  const isAdmin = auth.nick.toLowerCase() === 'admin';
  
  // Состояния для чата и статистики
  const [chatOpen, setChatOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  
  // Состояния чата
  const [chatMessages, setChatMessages] = useState<{nickname: string, text: string, time: string}[]>([]);
  const [chatInput, setChatInput] = useState('');

  // Состояние для перемещения и зума
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const statsRefreshRef = useRef<NodeJS.Timeout | null>(null);
  
  // Для предотвращения случайного рисования при перемещении
  const dragStartPosRef = useRef<{x: number, y: number} | null>(null);
  const isClickActionRef = useRef<boolean>(true);

  const size = 90;
  const cellSize = 20;

  useEffect(() => {
    const savedNick = localStorage.getItem('p_nick');
    const savedPass = localStorage.getItem('p_pass');
    if (savedNick && savedPass) { 
      setAuth({ nick: savedNick, pass: savedPass });
      checkAuth(savedNick, savedPass);
    }

    // Загрузка полотна
    fetch('/api/pixels')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then(data => {
        const parsed: any = {};
        for (const k in data) {
          try { 
            parsed[k] = typeof data[k] === 'string' ? JSON.parse(data[k]) : data[k]; 
          } catch(e) { 
            parsed[k] = { color: data[k], user: '???' }; 
          }
        }
        setPixels(parsed);
      })
      .catch(err => console.error('Failed to load pixels:', err));

    // Pusher
    const pusher = new Pusher("428b10fa704e1012072a", { cluster: "eu" });
    const channel = pusher.subscribe('pixel-channel');
    
    channel.bind('new-pixel', (update: any) => {
      setPixels(prev => ({ ...prev, [update.key]: update.data }));
    });

    channel.bind('chat-message', (update: any) => {
      setChatMessages(prev => [...prev, { 
        nickname: update.nickname, 
        text: update.text, 
        time: new Date().toLocaleTimeString() 
      }]);
    });

    channel.bind('clear', () => setPixels({}));

    // Обработчики для зажатия ПРОБЕЛА
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

    // Очистка при размонтировании
    return () => { 
      pusher.unsubscribe('pixel-channel'); 
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('wheel', handleWheelGlobal);
      
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (statsRefreshRef.current) clearInterval(statsRefreshRef.current);
    };
  }, [isAdmin]);

  // Загрузка статистики игроков (для всех пользователей)
const loadPlayerStats = async () => {
  setLoadingStats(true);
  try {
    const res = await fetch('/api/pixels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        nickname: auth.nick, 
        password: auth.pass,
        action: isAdmin ? 'get_users' : 'get_stats' 
      }),
    });
    
    if (res.ok) {
      const data = await res.json();
      
      // Для админа сохраняем полные данные
      if (isAdmin) {
        setAdminData({
          users: data.users || [],
          banned: data.banned || [],
          userStats: data.userStats || {},
          onlineUsers: data.onlineUsers || []
        });
      }
      
      // Для всех пользователей формируем статистику
      const userStats: Record<string, number> = data.userStats || {};
      const onlineUsers: string[] = data.onlineUsers || [];
      
      // Собираем всех пользователей из разных источников
      const allUsersSet = new Set<string>();
      
      // Добавляем пользователей из userStats
      Object.keys(userStats).forEach((user: string) => allUsersSet.add(user));
      
      // Добавляем онлайн пользователей
      onlineUsers.forEach((user: string) => allUsersSet.add(user));
      
      // Для админа добавляем всех зарегистрированных пользователей
      if (isAdmin && data.users) {
        (data.users as string[]).forEach((user: string) => allUsersSet.add(user));
      }
      
      // Формируем статистику игроков
      const stats: PlayerStats[] = Array.from(allUsersSet)
        .filter((user: string) => user && user !== 'admin')
        .map((user: string) => ({
          nickname: user,
          pixelsCount: userStats[user] || 0,
          isOnline: onlineUsers.includes(user)
        }));
      
      // Сортируем по количеству пикселей (по убыванию)
      stats.sort((a: PlayerStats, b: PlayerStats) => b.pixelsCount - a.pixelsCount);
      setPlayerStats(stats);
      setOnlineCount(onlineUsers.length);
    } else {
      const errorData = await res.json().catch(() => ({}));
      console.error('Failed to load stats:', errorData);
    }
  } catch (error) {
    console.error('Failed to load player stats:', error);
  } finally {
    setLoadingStats(false);
  }
};

  // Автоматическое обновление статистики для всех
  useEffect(() => {
    if (isAuthOk) {
      // Загружаем сразу
      loadPlayerStats();
      
      // Затем каждые 30 секунд
      statsRefreshRef.current = setInterval(loadPlayerStats, 30000);
      
      return () => {
        if (statsRefreshRef.current) clearInterval(statsRefreshRef.current);
      };
    }
  }, [isAuthOk, auth]);

  // Проверка авторизации
  const checkAuth = async (nickname: string, password: string) => {
    setAuthError('');
    try {
      const res = await fetch('/api/pixels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname, password }),
      });
      
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Server returned non-JSON response");
      }
      
      const data = await res.json();
      
      if (res.ok) {
        setIsAuthOk(true);
        setAuthError('');
        localStorage.setItem('p_nick', nickname);
        localStorage.setItem('p_pass', password);
        
        // Загружаем статистику после успешной авторизации
        setTimeout(() => loadPlayerStats(), 1000);
      } else {
        setAuthError(data.error || 'Authentication failed');
        localStorage.removeItem('p_nick');
        localStorage.removeItem('p_pass');
      }
    } catch (error) {
      console.error('Auth error:', error);
      setAuthError('Network error. Check if server is running.');
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

    try {
      const res = await fetch('/api/pixels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          x, 
          y, 
          color: selectedColor, 
          nickname: auth.nick, 
          password: auth.pass, 
          userId 
        }),
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === 'Invalid password' || data.error === 'Auth') {
          setAuthError('Session expired. Please login again.');
          setIsAuthOk(false);
          localStorage.clear();
        }
      } else {
        // Обновляем статистику после успешной установки пикселя
        setTimeout(() => loadPlayerStats(), 500);
      }
    } catch (error) {
      console.error('Pixel click error:', error);
    }
  };

  const adminAction = async (action: string, target?: string) => {
    try {
      const res = await fetch('/api/pixels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          nickname: auth.nick, 
          password: auth.pass, 
          action, 
          targetId: target || banInput 
        }),
      });
      
      const data = await res.json();
      if (res.ok) {
        if (action === 'get_users') {
          setAdminData(data);
          alert('Статистика обновлена!');
        }
        if (action === 'ban') alert('Пользователь забанен!');
      } else {
        if (data.error === 'Invalid admin password') {
          setAuthError('Invalid admin password');
          setIsAuthOk(false);
          localStorage.clear();
        }
      }
    } catch (error) {
      console.error('Admin action error:', error);
      alert('Error performing admin action');
    }
  };

  // Отправка сообщения в чат
  const sendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    
    try {
      await fetch('/api/pixels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'chat',
          nickname: auth.nick,
          password: auth.pass,
          text: chatInput.trim()
        }),
      });
      setChatInput('');
    } catch (error) {
      console.error('Chat error:', error);
    }
  };

  // Обработчики для перемещения полотна
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
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
    }, 500); // 0.5 секунды задержки
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
      
      {/* ПАНЕЛЬ АДМИНА (только для админа) */}
      {isAdmin && (
        <div style={{ position: 'fixed', left: 10, top: 10, width: '220px', background: '#1e1e1e', padding: '15px', borderRadius: '10px', border: '2px solid gold', fontSize: '11px', zIndex: 2000 }}>
          <h4 style={{ color: 'gold', margin: '0 0 10px 0' }}>ADMIN PANEL</h4>
          <div style={{ fontSize: '10px', color: '#ccc', marginBottom: '10px', padding: '5px', background: '#222', borderRadius: '3px' }}>
            <div>ЗАЖАТИЕ: {isSpaceDown ? '✔️ ПРОБЕЛ' : '❌ ПРОБЕЛ'}</div>
          </div>
          <button onClick={() => adminAction('get_users')} style={{ width: '100%', marginBottom: '10px' }}>Обновить статистику</button>
          <div style={{ maxHeight: '80px', overflowY: 'auto', marginBottom: '10px', background: '#000', padding: '5px' }}>
            <b>Все юзеры:</b> {adminData.users?.join(', ')}
          </div>
          <div style={{ maxHeight: '80px', overflowY: 'auto', marginBottom: '10px', background: '#000', padding: '5px', border: '1px solid red' }}>
            <b style={{ color: '#ff6666' }}>Забаненные ID:</b> {adminData.banned?.join(', ') || 'нет'}
          </div>
          <input placeholder="ID для бана" value={banInput} onChange={e => setBanInput(e.target.value)} style={{ width: '100%', marginBottom: '5px' }} />
          <button onClick={() => adminAction('ban')} style={{ width: '100%', backgroundColor: 'red', color: '#fff', marginBottom: '10px' }}>ЗАБАНИТЬ ПО ID</button>
          <button onClick={() => { if(confirm('Очистить поле?')) adminAction('clear_all') }} style={{ width: '100%', backgroundColor: '#444', color: '#fff' }}>ОЧИСТИТЬ ПОЛЕ</button>
        </div>
      )}

      {/* ПАНЕЛЬ СТАТИСТИКИ ИГРОКОВ (для всех) */}
      <div style={{ 
        position: 'fixed', 
        top: 10, 
        right: 10, 
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        gap: '15px',
        width: '280px'
      }}>
        {/* ИНФОРМАЦИЯ О ТЕКУЩЕМ ПОЛЬЗОВАТЕЛЕ */}
        <div style={{ 
          background: 'rgba(30, 30, 30, 0.95)',
          padding: '12px',
          borderRadius: '8px',
          border: `1px solid ${isAdmin ? 'gold' : '#444'}`,
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          {/* Кнопка статистики */}
          <button
            onClick={() => { setStatsOpen(!statsOpen); setChatOpen(false); }}
            style={{
              background: statsOpen ? '#4CAF50' : '#333',
              border: '1px solid #555',
              borderRadius: '4px',
              padding: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Статистика"
          >
            <img src="/graph.svg" alt="Статистика" width="20" height="20" />
          </button>
          
          {/* Никнейм */}
          <span style={{ 
            fontSize: '14px',
            color: isAdmin ? 'gold' : '#4CAF50',
            fontWeight: 'bold',
            flex: 1
          }}>
            {auth.nick} {isAdmin && '👑'}
          </span>
          
          {/* Иконка чата */}
          <button
            onClick={() => { setChatOpen(!chatOpen); setStatsOpen(false); }}
            style={{
              background: chatOpen ? '#4CAF50' : '#333',
              border: '1px solid #555',
              borderRadius: '4px',
              padding: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Чат"
          >
            <img src="/message.svg" alt="Чат" width="20" height="20" />
          </button>
          
          {/* Кнопка выхода */}
          <button 
            onClick={() => {localStorage.clear(); location.reload();}} 
            style={{
              fontSize: '11px', 
              padding: '6px 10px',
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
        
        {/* МЕНЮ СТАТИСТИКИ */}
        {statsOpen && (
          <div style={{ 
            background: 'rgba(30, 30, 30, 0.95)',
            padding: '12px',
            borderRadius: '8px',
            border: `1px solid ${isAdmin ? 'gold' : '#444'}`,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            animation: 'fadeIn 0.3s ease'
          }}>
          {/* СТАТИСТИКА ОНЛАЙН */}
          <div style={{ 
            fontSize: '11px', 
            color: '#aaa',
            padding: '6px',
            background: '#222',
            borderRadius: '4px',
            marginBottom: '8px',
            textAlign: 'center'
          }}>
            <span style={{ color: '#4CAF50' }}>🟢 Онлайн: {onlineCount} игроков</span>
            {!isAdmin && (
              <span style={{ marginLeft: '10px', color: '#FF9800' }}>
                Ваши пиксели: {playerStats.find(p => p.nickname === auth.nick)?.pixelsCount || 0}
              </span>
            )}
          </div>
          
          {/* СПИСОК ИГРОКОВ */}
          <div style={{ 
            maxHeight: '300px',
            overflowY: 'auto',
            fontSize: '11px'
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              padding: '4px 6px',
              background: '#333',
              borderRadius: '3px',
              marginBottom: '5px',
              fontWeight: 'bold',
              color: '#4CAF50'
            }}>
              <span>Игрок</span>
              <span>Пиксели</span>
              <span>Статус</span>
            </div>
            
            {playerStats.length > 0 ? (
              playerStats.map((player, index) => (
                <div 
                  key={index}
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 8px',
                    background: index % 2 === 0 ? '#222' : '#1a1a1a',
                    borderRadius: '3px',
                    marginBottom: '3px',
                    borderLeft: `3px solid ${player.isOnline ? '#4CAF50' : '#666'}`,
                    borderRight: player.nickname === auth.nick ? '2px solid #4CAF50' : 'none'
                  }}
                >
                  <span style={{ 
                    color: player.nickname === auth.nick ? '#4CAF50' : '#fff',
                    fontWeight: player.nickname === auth.nick ? 'bold' : 'normal'
                  }}>
                    {player.nickname === auth.nick ? '👉 ' : ''}
                    {player.nickname}
                  </span>
                  <span style={{ 
                    color: player.pixelsCount > 0 ? '#FF9800' : '#aaa',
                    fontWeight: 'bold'
                  }}>
                    {player.pixelsCount}
                  </span>
                  <span style={{ 
                    color: player.isOnline ? '#4CAF50' : '#666',
                    fontSize: '10px'
                  }}>
                    {player.isOnline ? '🟢 онлайн' : '⚫ офлайн'}
                  </span>
                </div>
              ))
            ) : (
              <div style={{ 
                padding: '10px', 
                textAlign: 'center', 
                color: '#666', 
                fontSize: '10px'
              }}>
                {loadingStats ? 'Загрузка статистики...' : 'Нет данных об игроках'}
              </div>
            )}
          </div>
          
          {/* КНОПКА ОБНОВЛЕНИЯ */}
          <button 
            onClick={loadPlayerStats}
            disabled={loadingStats}
            style={{
              width: '100%',
              fontSize: '10px',
              padding: '6px',
              backgroundColor: loadingStats ? '#555' : '#333',
              border: '1px solid #444',
              borderRadius: '4px',
              color: '#fff',
              cursor: loadingStats ? 'not-allowed' : 'pointer',
              marginTop: '8px',
              opacity: loadingStats ? 0.7 : 1
            }}
          >
            {loadingStats ? '🔄 Загрузка...' : '🔄 Обновить статистику'}
          </button>
        </div>
        )}
        
        {/* МЕНЮ ЧАТА */}
        {chatOpen && (
          <div style={{ 
            background: 'rgba(30, 30, 30, 0.95)',
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid #444',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            animation: 'fadeIn 0.3s ease'
          }}>
            {/* Список сообщений */}
            <div style={{ 
              maxHeight: '200px',
              overflowY: 'auto',
              fontSize: '11px',
              marginBottom: '8px'
            }}>
              {chatMessages.length > 0 ? (
                chatMessages.map((msg, index) => (
                  <div 
                    key={index}
                    style={{ 
                      padding: '6px 8px',
                      background: '#222',
                      borderRadius: '4px',
                      marginBottom: '5px',
                      borderLeft: `3px solid ${msg.nickname === auth.nick ? '#4CAF50' : '#2196F3'}`
                    }}
                  >
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      marginBottom: '4px'
                    }}>
                      <span style={{ 
                        color: msg.nickname === auth.nick ? '#4CAF50' : '#2196F3',
                        fontWeight: 'bold'
                      }}>
                        {msg.nickname === auth.nick ? 'Вы' : msg.nickname}
                      </span>
                      <span style={{ color: '#666', fontSize: '10px' }}>
                        {msg.time}
                      </span>
                    </div>
                    <div style={{ color: '#fff' }}>
                      {msg.text}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ 
                  padding: '10px', 
                  textAlign: 'center', 
                  color: '#666', 
                  fontSize: '11px'
                }}>
                  Нет сообщений. Напишите первое!
                </div>
              )}
            </div>
            
            {/* Форма отправки */}
            <form onSubmit={sendChatMessage} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Сообщение..."
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #444',
                  background: '#222',
                  color: '#fff',
                  fontSize: '11px'
                }}
              />
              <button 
                type="submit"
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#4CAF50',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '11px'
                }}
              >
                →
              </button>
            </form>
          </div>
        )}
      </div>

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
            {cooldown === 100}
          </div>
        </div>
      )}

      {/* ПАЛИТРА ЦВЕТОВ */}
      <div style={{ 
        position: 'fixed', 
        bottom: '80px',
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
        
        /* Стили для скроллбара */
        ::-webkit-scrollbar {
          width: 6px;
        }
        
        ::-webkit-scrollbar-track {
          background: #222;
          border-radius: 3px;
        }
        
        ::-webkit-scrollbar-thumb {
          background: #444;
          border-radius: 3px;
        }
        
        ::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
      `}</style>
    </div>
  );
}