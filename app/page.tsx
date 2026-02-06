'use client';
import { useEffect, useState } from 'react';

export default function Home() {
  const [pixels, setPixels] = useState<Record<string, string>>({});
  const [tool, setTool] = useState<'draw' | 'erase'>('draw');
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [cooldown, setCooldown] = useState(0); // 0 до 100%
  const [canClick, setCanClick] = useState(true);

  const size = 30;
  const colors = [
    { name: 'Черный', hex: '#000000' },
    { name: 'Серый', hex: '#808080' },
    { name: 'Белый', hex: '#ffffff' },
    { name: 'Красный', hex: '#ff0000' },
  ];

  const loadPixels = async () => {
    try {
      const res = await fetch('/api/pixels');
      const data = await res.json();
      setPixels(data || {});
    } catch (e) {}
  };

  useEffect(() => {
    loadPixels();
    const interval = setInterval(loadPixels, 2000);
    return () => clearInterval(interval);
  }, []);

  // Логика полоски задержки
  useEffect(() => {
    if (!canClick) {
      const timer = setInterval(() => {
        setCooldown((prev) => {
          if (prev >= 100) {
            clearInterval(timer);
            setCanClick(true);
            return 100;
          }
          return prev + 5; // Скорость заполнения полоски
        });
      }, 100); // Обновляем полоску каждые 0.1 сек
      return () => clearInterval(timer);
    }
  }, [canClick]);

  const clickPixel = async (x: number, y: number) => {
    if (!canClick) return; // Если задержка еще идет — ничего не делаем

    const key = `${x}-${y}`;
    const newPixels = { ...pixels };

    if (tool === 'draw') {
      newPixels[key] = selectedColor;
    } else {
      delete newPixels[key];
    }

    setPixels(newPixels);
    setCanClick(false);
    setCooldown(0); // Сбрасываем полоску

    await fetch('/api/pixels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x, y, action: tool, color: selectedColor }),
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#f0f0f0', minHeight: '100vh', padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Pixel Battle</h1>

      <div style={{ marginBottom: '10px', display: 'flex', gap: '10px', position: 'relative' }}>
        {/* Кнопка карандаша с выбором цвета */}
        <div style={{ display: 'flex', alignItems: 'center', border: '2px solid #000', borderRadius: '8px', overflow: 'hidden' }}>
          <button 
            onClick={() => setTool('draw')}
            style={{
              padding: '10px', cursor: 'pointer', border: 'none',
              backgroundColor: tool === 'draw' ? selectedColor : '#fff',
              color: tool === 'draw' ? '#fff' : '#000',
              filter: tool === 'draw' && selectedColor === '#ffffff' ? 'invert(1)' : 'none'
            }}
          >
            ✏️ {colors.find(c => c.hex === selectedColor)?.name}
          </button>
          
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            style={{ padding: '10px', cursor: 'pointer', borderLeft: '1px solid #000', backgroundColor: '#fff' }}
          >
            {isMenuOpen ? '▲' : '▼'}
          </button>

          {/* Выпадающее меню цветов */}
          {isMenuOpen && (
            <div style={{ position: 'absolute', top: '50px', left: '0', backgroundColor: '#fff', border: '2px solid #000', borderRadius: '8px', zIndex: 10, width: '150px' }}>
              {colors.map((c) => (
                <div 
                  key={c.hex} 
                  onClick={() => { setSelectedColor(c.hex); setTool('draw'); setIsMenuOpen(false); }}
                  style={{ padding: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid #eee' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff'}
                >
                  <div style={{ width: '15px', height: '15px', backgroundColor: c.hex, border: '1px solid #000' }} />
                  {c.name}
                </div>
              ))}
            </div>
          )}
        </div>

        <button 
          onClick={() => setTool('erase')}
          style={{
            padding: '10px 20px', fontSize: '16px', cursor: 'pointer',
            backgroundColor: tool === 'erase' ? '#000' : '#fff',
            color: tool === 'erase' ? '#fff' : '#000',
            border: '2px solid #000', borderRadius: '8px'
          }}
        >
          🧼 Ластик
        </button>
      </div>

      {/* Полоска задержки */}
      <div style={{ width: '300px', height: '10px', backgroundColor: '#ddd', borderRadius: '5px', marginBottom: '20px', overflow: 'hidden', border: '1px solid #ccc' }}>
        <div style={{ width: `${cooldown}%`, height: '100%', backgroundColor: canClick ? '#4CAF50' : '#FFC107', transition: 'width 0.1s linear' }} />
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: `repeat(${size}, 15px)`,
        backgroundColor: '#fff', border: '2px solid #333', boxShadow: '0 4px 10px rgba(0,0,0,0.2)'
      }}>
        {Array.from({ length: size * size }).map((_, i) => {
          const x = i % size;
          const y = Math.floor(i / size);
          const pixelColor = pixels[`${x}-${y}`];
          return (
            <div
              key={i}
              onClick={() => clickPixel(x, y)}
              style={{
                width: '15px', height: '15px',
                border: '0.5px solid #eee',
                backgroundColor: pixelColor || 'white',
                cursor: canClick ? 'crosshair' : 'wait'
              }}
            />
          );
        })}
      </div>
      {!canClick && <p style={{ color: '#888', fontSize: '12px', marginTop: '5px' }}>Перезарядка...</p>}
    </div>
  );
}