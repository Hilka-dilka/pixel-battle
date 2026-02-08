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
  
  const [playerStats, setPlayerStats] = useState<PlayerStats[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);

  const [adminData, setAdminData] = useState<{
    users: string[], 
    banned: string[],
    userStats: Record<string, number>,
    onlineUsers: string[]
  }>({ users: [], banned: [], userStats: {}, onlineUsers: [] });
  
  const [banInput, setBanInput] = useState('');
  const isAdmin = auth.nick.toLowerCase() === 'admin';
  
  const [chatOpen, setChatOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [canvasVisible, setCanvasVisible] = useState(true);
  const [hoveredPixel, setHoveredPixel] = useState<{x: number, y: number} | null>(null);
  const [canvasLoaded, setCanvasLoaded] = useState(false);
  
  const [chatMessages, setChatMessages] = useState<{nickname: string, text: string, time: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatMuteInput, setChatMuteInput] = useState('');
  const [chatMuteDuration, setChatMuteDuration] = useState('5');
  
  // Image upload state
  const [imageUploadX, setImageUploadX] = useState('0');
  const [imageUploadY, setImageUploadY] = useState('0');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const isSendingRef = useRef(false);
  const chatLoadedRef = useRef(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasElementRef = useRef<HTMLCanvasElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const statsRefreshRef = useRef<NodeJS.Timeout | null>(null);
  
  const dragStartPosRef = useRef<{x: number, y: number} | null>(null);
  const isClickActionRef = useRef<boolean>(true);
  const sizeX = 180;
  const sizeY = 180;
  const pixelScale = 10;

  const drawCanvas = () => {
    const canvas = canvasElementRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sizeX * pixelScale, sizeY * pixelScale);
    
    // Draw all pixels
    for (const key in pixels) {
      const [x, y] = key.split('-').map(Number);
      ctx.fillStyle = pixels[key].color || '#ffffff';
      ctx.fillRect(x * pixelScale, y * pixelScale, pixelScale, pixelScale);
    }
  };

  // Redraw canvas when pixels change
  useEffect(() => {
    drawCanvas();
  }, [pixels]);

  const downloadCanvas = () => {
    const canvas = canvasElementRef.current;
    if (!canvas) return;
    
    // Create a temporary canvas without grid
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = sizeX * pixelScale;
    tempCanvas.height = sizeY * pixelScale;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;
    
    // Fill white background
    tempCtx.fillStyle = '#ffffff';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    
    // Draw pixels
    for (const key in pixels) {
      const [x, y] = key.split('-').map(Number);
      tempCtx.fillStyle = pixels[key].color || '#ffffff';
      tempCtx.fillRect(x * pixelScale, y * pixelScale, pixelScale, pixelScale);
    }
    
    // Download
    const link = document.createElement('a');
    link.download = 'pixel-battle.png';
    link.href = tempCanvas.toDataURL('image/png');
    link.click();
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!isClickActionRef.current) return;
    
    const canvas = canvasElementRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;
    
    const x = Math.floor(clickX / pixelScale);
    const y = Math.floor(clickY / pixelScale);
    
    if (x >= 0 && x < sizeX && y >= 0 && y < sizeY) {
      handlePixelClick(e as any, x, y);
    }
  };

  const handlePixelCanvasMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasElementRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;
    
    const x = Math.floor(mouseX / pixelScale);
    const y = Math.floor(mouseY / pixelScale);
    
    if (x >= 0 && x < sizeX && y >= 0 && y < sizeY) {
      setHoveredPixel({ x, y });
      const data = pixels[`${x}-${y}`];
      if (data) {
        handlePixelEnter({ ...data, x, y });
      } else {
        handlePixelLeave();
      }
      
      if (isAdmin && isSpaceDown) {
        clickPixel(x, y);
      }
    } else {
      setHoveredPixel(null);
    }
  };

  const handlePixelCanvasMouseLeave = () => {
    handlePixelLeave();
    setHoveredPixel(null);
  };

  const loadChatMessages = async () => {
    // Всегда пытаемся загрузить с сервера
    try {
      const res = await fetch('/api/messages');
      if (res.ok) {
        const data = await res.json();
        const serverMsgs = data.messages || [];
        
        if (serverMsgs.length > 0) {
          // Если есть сообщения на сервере, используем их
          const msgs = serverMsgs.map((m: any) => ({
            ...m,
            time: new Date(m.time).toLocaleTimeString()
          }));
          setChatMessages(msgs);
          localStorage.setItem('chat_messages', JSON.stringify(msgs));
          chatLoadedRef.current = true;
          return;
        }
        
        // Если сервер вернул пустой массив, пробуем загрузить из localStorage
        const saved = localStorage.getItem('chat_messages');
        if (saved) {
          try {
            const msgs = JSON.parse(saved);
            if (Array.isArray(msgs) && msgs.length > 0) {
              setChatMessages(msgs);
              chatLoadedRef.current = true;
            }
          } catch (e) {
            console.error('Failed to parse saved messages:', e);
          }
        } else {
          // Нет сообщений нигде - используем пустой массив
          setChatMessages([]);
          chatLoadedRef.current = true;
        }
        return;
      }
    } catch (error) {
      console.error('Failed to load chat from server:', error);
    }
    
    // Если сервер недоступен - загружаем из localStorage
    const saved = localStorage.getItem('chat_messages');
    if (saved) {
      try {
        const msgs = JSON.parse(saved);
        if (Array.isArray(msgs)) {
          setChatMessages(msgs);
          chatLoadedRef.current = true;
        }
      } catch (e) {
        console.error('Failed to parse saved messages:', e);
      }
    }
  };

  useEffect(() => {
    const savedNick = localStorage.getItem('p_nick');
    const savedPass = localStorage.getItem('p_pass');
    if (savedNick && savedPass) { 
      setAuth({ nick: savedNick, pass: savedPass });
      checkAuth(savedNick, savedPass);
    }

    fetch('/api/pixels')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then(data => {
        const parsed: any = {};
        for (const k in data.pixels || {}) {
          try { 
            parsed[k] = typeof data.pixels[k] === 'string' ? JSON.parse(data.pixels[k]) : data.pixels[k]; 
          } catch(e) { 
            parsed[k] = { color: data.pixels[k], user: '???' }; 
          }
        }
        setPixels(parsed);
        setCanvasLoaded(true);
        // Если canvasVisible явно false (от админа), используем это значение
        if (data.canvasVisible === false) {
          setCanvasVisible(false);
        }
      })
      .catch(err => console.error('Failed to load pixels:', err));

    const pusher = new Pusher("428b10fa704e1012072a", { cluster: "eu" });
    const channel = pusher.subscribe('pixel-channel');
    
    channel.bind('new-pixel', (update: any) => {
      setPixels(prev => ({ ...prev, [update.key]: update.data }));
    });

    channel.bind('chat-message', (update: any) => {
      setChatMessages(prev => {
        const newMsg = { 
          nickname: update.nickname, 
          text: update.text, 
          time: new Date().toLocaleTimeString() 
        };
        const updated = [...prev, newMsg];
        localStorage.setItem('chat_messages', JSON.stringify(updated.slice(-100)));
        return updated.slice(-100);
      });
      
      // Скролл к низу
      setTimeout(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
      }, 100);
    });

    channel.bind('clear', () => setPixels({}));

    channel.bind('clear_chat', () => {
      setChatMessages([]);
      localStorage.removeItem('chat_messages');
    });

    channel.bind('canvas_toggle', (update: any) => {
      setCanvasVisible(update.visible);
      if (!update.visible) {
        alert('Canvas отключён админом');
      }
    });

    channel.bind('user_muted', (update: any) => {
      const userId = localStorage.getItem('p_id');
      if (userId && update.targetId === userId) {
        alert(`Вы были замьючены админом ${update.by} до ${new Date(update.expires).toLocaleTimeString()}`);
      }
    });

    channel.bind('user_unmuted', (update: any) => {
      const userId = localStorage.getItem('p_id');
      if (userId && update.targetId === userId) {
        alert('Вы были размьючены!');
      }
    });

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

    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);

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
      
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (statsRefreshRef.current) clearInterval(statsRefreshRef.current);
    };
  }, [isAdmin]);

  useEffect(() => {
    // Load chat messages on initial page load
    chatLoadedRef.current = false;
    loadChatMessages();
  }, []);

  useEffect(() => {
    if (chatOpen && !chatLoadedRef.current) {
      chatLoadedRef.current = false; // Сбрасываем флаг чтобы перезагрузить сообщения
      loadChatMessages();
    }
  }, [chatOpen]);

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
        
        if (isAdmin) {
          setAdminData({
            users: data.users || [],
            banned: data.banned || [],
            userStats: data.userStats || {},
            onlineUsers: data.onlineUsers || []
          });
        }
        
        const userStats: Record<string, number> = data.userStats || {};
        const onlineUsers: string[] = data.onlineUsers || [];
        
        const allUsersSet = new Set<string>();
        Object.keys(userStats).forEach((user: string) => allUsersSet.add(user));
        onlineUsers.forEach((user: string) => allUsersSet.add(user));
        
        if (isAdmin && data.users) {
          (data.users as string[]).forEach((user: string) => allUsersSet.add(user));
        }
        
        const stats: PlayerStats[] = Array.from(allUsersSet)
          .filter((user: string) => user && user !== 'admin')
          .map((user: string) => ({
            nickname: user,
            pixelsCount: userStats[user] || 0,
            isOnline: onlineUsers.includes(user)
          }));
        
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

  useEffect(() => {
    if (isAuthOk) {
      loadPlayerStats();
      statsRefreshRef.current = setInterval(loadPlayerStats, 30000);
      
      return () => {
        if (statsRefreshRef.current) clearInterval(statsRefreshRef.current);
      };
    }
  }, [isAuthOk, auth]);

  // Если canvas отключён, проверяем каждую секунду чтобы скрыть его
  useEffect(() => {
    if (!canvasVisible) {
      const checkCanvas = setInterval(async () => {
        try {
          const res = await fetch('/api/pixels');
          const data = await res.json();
          if (data.canvasVisible !== false) {
            setCanvasVisible(false);
          }
        } catch (e) {
          console.error('Check canvas error:', e);
        }
      }, 1000);
      
      return () => clearInterval(checkCanvas);
    }
  }, [canvasVisible]);

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
        setTimeout(() => loadPlayerStats(), 500);
      }
    } catch (error) {
      console.error('Pixel click error:', error);
    }
  };

  // Draw image on canvas
  const drawImageOnCanvas = async () => {
    const input = imageInputRef.current;
    if (!input?.files?.length) {
      alert('Выберите изображение');
      return;
    }
    
    const file = input.files[0];
    const startX = parseInt(imageUploadX) || 0;
    const startY = parseInt(imageUploadY) || 0;
    
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      ctx.drawImage(img, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let pixelsToDraw: {x: number, y: number, color: string}[] = [];
      
      for (let py = 0; py < canvas.height; py++) {
        for (let px = 0; px < canvas.width; px++) {
          const index = (py * canvas.width + px) * 4;
          const r = imageData.data[index];
          const g = imageData.data[index + 1];
          const b = imageData.data[index + 2];
          const a = imageData.data[index + 3];
          
          if (a < 128) continue; // Skip transparent pixels
          
          const color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
          pixelsToDraw.push({ x: startX + px, y: startY + py, color });
        }
      }
      
      if (!confirm(`Нарисовать ${pixelsToDraw.length} пикселей?`)) return;
      
      // Send all pixels in parallel batches for speed
      const userId = localStorage.getItem('p_id') || 'admin';
      const batchSize = 50; // Send 50 pixels at a time
      const batches = [];
      
      for (let i = 0; i < pixelsToDraw.length; i += batchSize) {
        batches.push(pixelsToDraw.slice(i, i + batchSize));
      }
      
      // Send all batches in parallel
      await Promise.all(batches.map(batch => 
        fetch('/api/pixels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pixels: batch,
            nickname: auth.nick,
            password: auth.pass,
            userId
          }),
        }).catch(error => console.error('Batch failed:', error))
      ));
      
      alert('Изображение нарисовано!');
      setImagePreview(null);
      if (input) input.value = '';
    };
    
    img.onerror = () => {
      alert('Ошибка загрузки изображения');
    };
    
    img.src = URL.createObjectURL(file);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImagePreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
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
        if (action === 'canvas_toggle') {
          setCanvasVisible(data.visible);
        }
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

  const chatAdminAction = async (action: string, data?: any) => {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          action,
          adminPassword: 'admin123'
        }),
      });
      
      const result = await res.json();
      if (res.ok) {
        if (action === 'clear_chat') {
          setChatMessages([]);
          localStorage.removeItem('chat_messages');
          alert('Чат очищен!');
        }
        if (action === 'mute') {
          alert(`${data.targetId} замьючен на ${data.duration} мин`);
        }
        if (action === 'unmute') {
          alert(`${data.targetId} размьючен`);
        }
      } else {
        alert(result.error || 'Ошибка');
      }
    } catch (error) {
      console.error('Chat admin action error:', error);
      alert('Error performing chat admin action');
    }
  };

  const sendChatMessage = async (e?: React.FormEvent | React.KeyboardEvent) => {
    if (e) e.preventDefault();
    const text = chatInput.trim();
    if (!text || isSendingRef.current) return;
    
    isSendingRef.current = true;
    setChatInput('');
    
    const newMessage = { 
      nickname: auth.nick || 'Anonymous', 
      text: text, 
      time: new Date().toLocaleTimeString() 
    };
    
    setChatMessages(prev => {
      const updated = [...prev, newMessage];
      localStorage.setItem('chat_messages', JSON.stringify(updated.slice(-100)));
      return updated.slice(-100);
    });
    
    // Скролл к низу
    setTimeout(() => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    }, 100);
    
    try {
      const userId = localStorage.getItem('p_id') || '';
      await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname: auth.nick,
          text: text,
          action: 'send',
          userId: userId
        }),
      });
    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      isSendingRef.current = false;
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  };

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
    // Only reset isClickActionRef to true if we weren't dragging
    // If we were dragging, keep it false to prevent click
    if (!isDragging) {
      isClickActionRef.current = true;
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(10, scale * delta));
    setScale(newScale);
  };

  const handlePixelEnter = (data: any) => {
    setHoveredInfo(data);
    setShowHoveredInfo(false);
    
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    
    hoverTimeoutRef.current = setTimeout(() => {
      setShowHoveredInfo(true);
    }, 500);
  };

  const handlePixelLeave = () => {
    setHoveredInfo(null);
    setShowHoveredInfo(false);
    
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  const handlePixelClick = (e: React.MouseEvent, x: number, y: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isAdmin ? isSpaceDown : true) {
      clickPixel(x, y);
    }
  };

  const resetView = () => {
    setOffset({ x: 0, y: 0 });
    setScale(1);
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await checkAuth(auth.nick, auth.pass);
  };

  if (!isAuthOk) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#121212', color: '#fff' }}>
        <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '30px', background: '#1a1a1a', borderRadius: '10px', width: '300px', border: '2px solid #FFD700' }}>
          <h2 style={{ color: '#FFD700', textAlign: 'center', margin: '0 0 10px 0' }}>Pixel Battle</h2>
          {authError && (
            <div style={{ color: '#ff4444', fontSize: '14px', padding: '8px', background: '#2a1a1a', borderRadius: '4px' }}>
              {authError}
            </div>
          )}
          <input 
            placeholder="Ник" 
            value={auth.nick} 
            onChange={e => setAuth({...auth, nick: e.target.value})} 
            style={{ padding: '10px', borderRadius: '4px', border: '1px solid #444', background: '#222', color: '#fff' }} 
            required
          />
          <input 
            type="password" 
            placeholder="Пароль" 
            value={auth.pass} 
            onChange={e => setAuth({...auth, pass: e.target.value})} 
            style={{ padding: '10px', borderRadius: '4px', border: '1px solid #444', background: '#222', color: '#fff' }} 
            required
          />
          <div style={{ fontSize: '12px', color: '#FFD700', marginTop: '-5px' }}>
            {auth.nick.toLowerCase() === 'admin' ? 'Введите пароль админа' : 'Создаст аккаунт, если не существует'}
          </div>
          <button type="submit" style={{ padding: '10px', backgroundColor: '#FFD700', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
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
      
      {isAdmin && (
        <div style={{ position: 'fixed', left: 10, top: 10, width: '280px', background: '#1a1a1a', padding: '12px', borderRadius: '10px', border: '2px solid #FFD700', fontSize: '11px', zIndex: 2000 }}>
          <h4 style={{ color: '#FFD700', margin: '0 0 8px 0' }}>ADMIN PANEL</h4>
          
          {/* Canvas Management - Separated Buttons */}
          <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
            <button 
              onClick={() => adminAction('canvas_toggle')}
              style={{ 
                flex: 1,
                padding: '8px', 
                background: canvasVisible ? '#ff4444' : '#4CAF50', 
                border: 'none', 
                borderRadius: '4px', 
                color: '#fff', 
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '10px'
              }}
            >
              {canvasVisible ? '❌ ОТКЛ CANVAS' : '✅ ВКЛ CANVAS'}
            </button>
            <button 
              onClick={() => { if(confirm('Очистить поле?')) adminAction('clear_all') }}
              style={{ 
                flex: 1,
                backgroundColor: '#333', 
                color: '#fff', 
                padding: '8px', 
                border: '1px solid #444', 
                borderRadius: '4px', 
                cursor: 'pointer',
                fontSize: '10px'
              }}
            >
              🗑️ ОЧИСТИТЬ
            </button>
          </div>
          
          <div style={{ borderTop: '1px solid #444', margin: '8px 0', paddingTop: '8px' }}>
            <div style={{ fontSize: '10px', color: '#FFD700', marginBottom: '5px' }}>ВСЕ ЮЗЕРЫ</div>
            <div style={{ maxHeight: '50px', overflowY: 'auto', marginBottom: '5px', background: '#000', padding: '5px', fontSize: '9px', wordBreak: 'break-all' }}>
              {adminData.users?.join(', ') || 'нет'}
            </div>
            <div style={{ fontSize: '10px', color: '#ff6666', marginBottom: '5px' }}>ЗАБАНЕННЫЕ</div>
            <div style={{ maxHeight: '50px', overflowY: 'auto', background: '#000', padding: '5px', fontSize: '9px', wordBreak: 'break-all', border: '1px solid #ff4444', borderRadius: '4px' }}>
              {adminData.banned?.join(', ') || 'нет'}
            </div>
          </div>
          
          {/* Image Upload Section */}
          <div style={{ borderTop: '1px solid #444', margin: '8px 0', paddingTop: '8px' }}>
            <div style={{ fontSize: '10px', color: '#FFD700', marginBottom: '5px' }}>НАРИСОВАТЬ КАРТИНКУ</div>
            <div style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
              <input 
                type="number" 
                placeholder="X" 
                value={imageUploadX} 
                onChange={e => setImageUploadX(e.target.value)}
                style={{ width: '60px', padding: '6px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '4px' }} 
              />
              <input 
                type="number" 
                placeholder="Y" 
                value={imageUploadY} 
                onChange={e => setImageUploadY(e.target.value)}
                style={{ width: '60px', padding: '6px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '4px' }} 
              />
            </div>
            <input 
              type="file" 
              accept="image/*"
              ref={imageInputRef}
              onChange={handleImageSelect}
              style={{ display: 'none' }}
            />
            <button 
              onClick={() => imageInputRef.current?.click()}
              style={{ 
                width: '100%', 
                marginBottom: '5px', 
                padding: '8px', 
                background: '#333', 
                border: '1px solid #FFD700', 
                borderRadius: '4px', 
                color: '#FFD700', 
                cursor: 'pointer',
                fontSize: '10px'
              }}
            >
              📁 ВЫБРАТЬ КАРТИНКУ
            </button>
            {imagePreview && (
              <div style={{ marginBottom: '5px' }}>
                <img src={imagePreview} alt="Preview" style={{ width: '100%', borderRadius: '4px', border: '1px solid #444' }} />
              </div>
            )}
            <button 
              onClick={drawImageOnCanvas}
              disabled={!imagePreview}
              style={{ 
                width: '100%', 
                padding: '8px', 
                background: imagePreview ? '#4CAF50' : '#333', 
                border: 'none', 
                borderRadius: '4px', 
                color: '#fff', 
                cursor: imagePreview ? 'pointer' : 'not-allowed',
                fontWeight: 'bold',
                fontSize: '10px'
              }}
            >
              🎨 НАРИСОВАТЬ
            </button>
          </div>
          
          <div style={{ borderTop: '1px solid #444', margin: '8px 0', paddingTop: '8px' }}>
            <div style={{ fontSize: '10px', color: '#FFD700', marginBottom: '5px' }}>СТАТИСТИКА</div>
            <div style={{ maxHeight: '60px', overflowY: 'auto', marginBottom: '5px', background: '#000', padding: '5px', fontSize: '9px' }}>
              <b>Онлайн:</b> {adminData.onlineUsers?.join(', ') || 'нет'}
            </div>
            <button onClick={() => adminAction('get_users')} style={{ width: '100%', padding: '6px', background: '#333', border: '1px solid #FFD700', borderRadius: '4px', color: '#FFD700', cursor: 'pointer', fontSize: '10px' }}>🔄 ОБНОВИТЬ</button>
          </div>
          
          <div style={{ borderTop: '1px solid #444', margin: '8px 0', paddingTop: '8px' }}>
            <div style={{ fontSize: '10px', color: '#FFD700', marginBottom: '5px' }}>БАН/МУТ</div>
            <input placeholder="ID для бана" value={banInput} onChange={e => setBanInput(e.target.value)} style={{ width: '100%', marginBottom: '5px', padding: '6px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '4px', fontSize: '10px' }} />
            <button onClick={() => adminAction('ban')} style={{ width: '100%', backgroundColor: '#ff4444', color: '#fff', marginBottom: '8px', padding: '6px', border: 'none', borderRadius: '4px', fontWeight: 'bold', fontSize: '10px' }}>🚫 ЗАБАНИТЬ</button>
            
            <div style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
              <input placeholder="ID (gen_ник)" value={chatMuteInput} onChange={e => setChatMuteInput(e.target.value)} style={{ flex: 1, padding: '6px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '4px', fontSize: '10px' }} />
              <input type="number" placeholder="Мин" value={chatMuteDuration} onChange={e => setChatMuteDuration(e.target.value)} style={{ width: '50px', padding: '6px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '4px', fontSize: '10px' }} />
            </div>
            
            <div style={{ display: 'flex', gap: '5px' }}>
              <button onClick={() => { if(chatMuteInput && chatMuteDuration) { chatAdminAction('mute', { targetId: chatMuteInput, duration: parseInt(chatMuteDuration) }); setChatMuteInput(''); } }} style={{ flex: 1, backgroundColor: '#ff6600', color: '#fff', padding: '6px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}>🔇 МУТ</button>
              <button onClick={() => { if(chatMuteInput) { chatAdminAction('unmute', { targetId: chatMuteInput }); setChatMuteInput(''); } }} style={{ flex: 1, backgroundColor: '#4CAF50', color: '#fff', padding: '6px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}>🔊 РАЗМУТ</button>
            </div>
          </div>
          
          <div style={{ borderTop: '1px solid #444', margin: '8px 0', paddingTop: '8px' }}>
            <button onClick={() => { if(confirm('Очистить чат?')) chatAdminAction('clear_chat') }} style={{ width: '100%', backgroundColor: '#ff4444', color: '#fff', padding: '8px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}>💬 ОЧИСТИТЬ ЧАТ</button>
          </div>
        </div>
      )}

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
        <div style={{ 
          background: '#1a1a1a',
          padding: '12px',
          borderRadius: '8px',
          border: '2px solid #FFD700',
          boxShadow: '0 4px 12px rgba(255, 215, 0, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <button
            onClick={() => { setStatsOpen(!statsOpen); setChatOpen(false); }}
            style={{
              background: statsOpen ? '#FFD700' : '#333',
              border: '1px solid #FFD700',
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
          
          <span style={{ 
            fontSize: '14px',
            color: isAdmin ? '#FFD700' : '#4CAF50',
            fontWeight: 'bold',
            flex: 1
          }}>
            {auth.nick} {isAdmin && '👑'}
          </span>
          
          <button
            onClick={() => { setChatOpen(!chatOpen); setStatsOpen(false); }}
            style={{
              background: chatOpen ? '#FFD700' : '#333',
              border: '1px solid #FFD700',
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
          
          <button 
            onClick={downloadCanvas}
            style={{
              fontSize: '11px', 
              padding: '6px 10px',
              backgroundColor: '#333',
              border: '1px solid #FFD700',
              borderRadius: '4px',
              color: '#FFD700',
              cursor: 'pointer'
            }}
            title="Скачать как PNG"
          >
            💾
          </button>
          <button 
            onClick={() => {localStorage.clear(); location.reload();}} 
            style={{
              fontSize: '11px', 
              padding: '6px 10px',
              backgroundColor: '#333',
              border: '1px solid #FFD700',
              borderRadius: '4px',
              color: '#FFD700',
              cursor: 'pointer'
            }}
          >
            Выход
          </button>
        </div>
        
        {statsOpen && (
          <div style={{ 
            background: '#1a1a1a',
            padding: '12px',
            borderRadius: '8px',
            border: '2px solid #FFD700',
            boxShadow: '0 4px 12px rgba(255, 215, 0, 0.3)',
            animation: 'fadeIn 0.3s ease'
          }}>
          <div style={{ 
            fontSize: '11px', 
            color: '#FFD700',
            padding: '8px',
            background: '#222',
            borderRadius: '4px',
            marginBottom: '8px',
            textAlign: 'center',
            border: '1px solid #FFD700'
          }}>
            <span style={{ color: '#4CAF50' }}>🟢 Онлайн: {onlineCount} игроков</span>
            {!isAdmin && (
              <span style={{ marginLeft: '10px', color: '#FFD700' }}>
                Ваши пиксели: {playerStats.find(p => p.nickname === auth.nick)?.pixelsCount || 0}
              </span>
            )}
          </div>
          
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
              color: '#FFD700'
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
                    color: player.pixelsCount > 0 ? '#FFD700' : '#aaa',
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
          
          <button 
            onClick={loadPlayerStats}
            disabled={loadingStats}
            style={{
              width: '100%',
              fontSize: '10px',
              padding: '8px',
              backgroundColor: loadingStats ? '#555' : '#333',
              border: '1px solid #FFD700',
              borderRadius: '4px',
              color: '#FFD700',
              cursor: loadingStats ? 'not-allowed' : 'pointer',
              marginTop: '8px',
              opacity: loadingStats ? 0.7 : 1
            }}
          >
            {loadingStats ? '🔄 Загрузка...' : '🔄 Обновить статистику'}
          </button>
        </div>
        )}
        
        {chatOpen && (
          <div style={{ 
            background: '#1a1a1a',
            padding: '12px',
            borderRadius: '8px',
            border: '2px solid #FFD700',
            boxShadow: '0 4px 12px rgba(255, 215, 0, 0.3)',
            animation: 'fadeIn 0.3s ease'
          }}>
            <div style={{ 
              maxHeight: '200px',
              overflowY: 'auto',
              fontSize: '11px',
              marginBottom: '8px'
            }} ref={chatContainerRef}>
              {chatMessages.length > 0 ? (
                chatMessages.map((msg, index) => (
                  <div 
                    key={index}
                    style={{ 
                      padding: '6px 8px',
                      background: '#222',
                      borderRadius: '4px',
                      marginBottom: '5px',
                      borderLeft: `3px solid ${msg.nickname === auth.nick ? '#FFD700' : '#FFD700'}`
                    }}
                  >
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      marginBottom: '4px'
                    }}>
                      <span style={{ 
                        color: msg.nickname === auth.nick ? '#FFD700' : '#FFD700',
                        fontWeight: 'bold'
                      }}>
                        {msg.nickname === auth.nick ? 'Вы' : msg.nickname}
                      </span>
                      <span style={{ color: '#FFD700', fontSize: '10px' }}>
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
            
            <form onSubmit={sendChatMessage} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                placeholder="Сообщение..."
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '4px',
                  border: '1px solid #FFD700',
                  background: '#1a1a1a',
                  color: '#fff',
                  fontSize: '12px'
                }}
              />
              <button 
                type="submit"
                style={{
                  padding: '10px 14px',
                  backgroundColor: '#FFD700',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#000',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}
              >
                →
              </button>
            </form>
          </div>
        )}
      </div>

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
          color: '#FFD700'
        }}>
          PIXEL BATTLE P1V3
        </h1>
      </div>

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
            backgroundColor: cooldown === 100 ? '#4CAF50' : '#FFD700',
            transition: 'width 0.1s linear, background-color 0.3s ease'
          }} />
          <div style={{
            position: 'absolute',
            top: '-22px',
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: '12px',
            color: cooldown === 100 ? '#4CAF50' : '#FFD700',
            whiteSpace: 'nowrap',
            fontWeight: 'bold',
            textShadow: '0 1px 2px rgba(0,0,0,0.8)'
          }}>
            {cooldown === 100}
          </div>
        </div>
      )}

      <div style={{ 
        position: 'fixed', 
        bottom: '70px',
        left: '50%', 
        transform: 'translateX(-50%)',
        padding: '6px 12px',
        borderRadius: '8px',
        border: '2px solid #FFD700',
        boxShadow: '0 4px 12px rgba(255, 215, 0, 0.3)',
        display: 'flex',
        gap: '6px',
        flexWrap: 'wrap',
        justifyContent: 'center',
        maxWidth: '360px',
        zIndex: 2000,
        backgroundColor: '#1a1a1a'
      }}>
        {['#000000', '#808080', '#ffffff', '#ff0000', '#00fff7', '#006aff', '#001aff', '#00ff8c', '#00ff00', '#a2ff00', '#fff700', '#ff7700', '#8c00ff', '#f700ff', '#ff0099'].map(c => (
          <div 
            key={c} 
            onClick={() => setSelectedColor(c)} 
            style={{ 
              width: '24px', 
              height: '24px', 
              backgroundColor: c, 
              border: selectedColor === c ? '2px solid #FFD700' : '1px solid #444', 
              cursor: 'pointer', 
              borderRadius: '4px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
              transition: 'all 0.2s ease',
              position: 'relative'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.1)';
              e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.7)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.5)';
            }}
            title={c}
          />
        ))}
      </div>

      {canvasVisible && canvasLoaded && (
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
          <canvas
            ref={canvasElementRef}
            width={sizeX * pixelScale}
            height={sizeY * pixelScale}
            onClick={handleCanvasClick}
            onMouseMove={handlePixelCanvasMouseMove}
            onMouseLeave={handlePixelCanvasMouseLeave}
            style={{
              display: 'block',
              cursor: (isAdmin && isSpaceDown) ? 'crosshair' : 'pointer',
              imageRendering: 'pixelated'
            }}
          />
          {/* Grid overlay */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            imageRendering: 'pixelated',
            backgroundImage: `
              linear-gradient(to right, rgba(0,0,0,0.3) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(0,0,0,0.3) 1px, transparent 1px)
            `,
            backgroundSize: `${pixelScale}px ${pixelScale}px`
          }} />
        </div>
      )}

      {!canvasVisible && canvasLoaded && (
        <div style={{ 
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0,0,0,0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{ 
            color: '#FFD700',
            fontSize: '24px',
            fontWeight: 'bold',
            textAlign: 'center',
            padding: '20px'
          }}>
            Кхм.. что-то сломалось, попробуйте перезагрузить сайт.
          </div>
        </div>
      )}

      {!canvasLoaded && (
        <div style={{ 
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#FFD700',
          fontSize: '18px',
          textAlign: 'center',
          zIndex: 1
        }}>
          Загрузка...
        </div>
      )}

      {showHoveredInfo && hoveredInfo && (
        <div style={{ 
          position: 'fixed',
          top: mousePosition.y + 15,
          left: mousePosition.x + 15,
          backgroundColor: '#222',
          padding: '12px',
          borderRadius: '6px',
          fontSize: '12px',
          border: '1px solid #FFD700',
          zIndex: 3000,
          pointerEvents: 'none',
          boxShadow: '0 5px 20px rgba(0,0,0,0.8)',
          minWidth: '200px',
          animation: 'fadeIn 0.3s ease',
          backdropFilter: 'blur(2px)'
        }}>
          <div style={{ marginBottom: '6px' }}>
            <span style={{color: '#FFD700', fontWeight: 'bold'}}>Позиция:</span> {hoveredInfo.x}, {hoveredInfo.y}
          </div>
          <div style={{ marginBottom: '6px' }}>
            <span style={{color: '#FFD700', fontWeight: 'bold'}}>Автор:</span> {String(hoveredInfo.user)}
          </div>
          <div style={{ marginBottom: '6px' }}>
            <span style={{color: '#FFD700', fontWeight: 'bold'}}>ID:</span> {String(hoveredInfo.userId || 'n/a')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{color: '#FFD700', fontWeight: 'bold'}}>Цвет:</span> 
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

      <div style={{ 
        position: 'fixed', 
        bottom: 20, 
        left: '50%', 
        transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.8)', 
        padding: '8px 16px', 
        borderRadius: '6px',
        fontSize: '14px',
        border: '1px solid #FFD700',
        zIndex: 2000,
        boxShadow: '0 3px 10px rgba(255, 215, 0, 0.3)'
      }}>
        {hoveredPixel && (
          <div style={{ color: '#FFD700', fontWeight: 'bold' }}>
            X: <span style={{color: '#4CAF50'}}>{hoveredPixel.x}, Y: {hoveredPixel.y}</span>
          </div>
        )}
      </div>

      <div style={{ 
        position: 'fixed', 
        bottom: 10, 
        left: 10, 
        background: 'rgba(0,0,0,0.8)', 
        padding: '8px 12px', 
        borderRadius: '6px',
        fontSize: '11px',
        border: '1px solid #FFD700',
        zIndex: 2000,
        boxShadow: '0 3px 10px rgba(255, 215, 0, 0.3)'
      }}>
        <div style={{ color: '#FFD700', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span>Камера: <span style={{color: '#fff'}}>{offset.x.toFixed(0)}, {offset.y.toFixed(0)}</span></span>
          <span>Масштаб: <span style={{color: '#fff'}}>{scale.toFixed(2)}x</span></span>
          <button 
            onClick={resetView} 
            style={{ 
              padding: '3px 8px', 
              fontSize: '10px', 
              backgroundColor: '#333', 
              color: '#FFD700',
              border: '1px solid #FFD700',
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
