'use client';
import { useEffect, useState } from 'react';

export default function Home() {
  const [pixels, setPixels] = useState<Record<string, string>>({});
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [cooldown, setCooldown] = useState(100); 
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

  useEffect(() => {
    if (!canClick) {
      const timer = setInterval(() => {
        setCooldown((prev) => {
          if (prev >= 100) {
            clearInterval(timer);
            setCanClick(true);
            return 100;
          }
          return prev + 5;
        });
      }, 100);
      return () => clearInterval(timer);
    }
  }, [canClick]);

  const clickPixel = async (x: number, y: number) => {
    if (!canClick) return;

    const key = `${x}-${y}`;
    const newPixels = { ...pixels };
    newPixels[key] = selectedColor;

    setPixels(newPixels);
    setCanClick(false);
    setCooldown(0);

    await fetch('/api/pixels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x, y, action: 'draw', color: selectedColor }),
    });
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      backgroundColor: '#121212', // Глубокий темный цвет фона
      color: '#ffffff', // Белый текст
      minHeight: '100vh', 
      padding: '20px', 
      fontFamily: 'sans-serif' 
    }}>
      <h1 style={{ marginBottom: '20px', letterSpacing: '2px' }}>PIXEL BATTLE</h1>

      <div style={{ marginBottom: '15px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
        
        {/* Панель выбора цвета */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', border: '2px solid #333', borderRadius: '8px', backgroundColor: '#1e1e1e' }}>
          <div style={{ 
            padding: '10px 20px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '10px',
            borderRight: '1px solid #333'
          }}>
            <div style={{ width: '15px', height: '15px', backgroundColor: selectedColor, border: '1px solid #fff' }} />
            <span style={{ fontWeight: 'bold' }}>{colors.find(c => c.hex === selectedColor)?.name}</span>
          </div>
          
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            style={{ 
              padding: '10px 15px', 
              cursor: 'pointer', 
              backgroundColor: 'transparent', 
              color: '#fff', 
              border: 'none',
              fontSize: '14px'
            }}
          >
            {isMenuOpen ? '▲' : '▼ Выбрать цвет'}
          </button>

          {isMenuOpen && (
            <div style={{ 
              position: 'absolute', 
              top: '50px', 
              left: '0', 
              backgroundColor: '#1e1e1e', 
              border: '2px solid #333', 
              borderRadius: '8px', 
              zIndex: 10, 
              width: '100%' 
            }}>
              {colors.map((c) => (
                <div 
                  key={c.hex} 
                  onClick={() => { setSelectedColor(c.hex); setIsMenuOpen(false); }}
                  style={{ 
                    padding: '12px', 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '10px', 
                    borderBottom: '1px solid #333' 
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#252525'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <div style={{ width: '15px', height: '15px', backgroundColor: c.hex, border: '1px solid #fff' }} />
                  {c.name}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Полоска кулдауна */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
          <div style={{ 
            width: '250px', 
            height: '6px', 
            backgroundColor: '#333', 
            borderRadius: '3px', 
            overflow: 'hidden' 
          }}>
            <div style={{ 
              width: `${cooldown}%`, 
              height: '100%', 
              backgroundColor: canClick ? '#4CAF50' : '#888', 
              transition: 'width 0.1s linear' 
            }} />
          </div>
          <span style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase' }}>
            {canClick ? 'Готов' : 'Перезарядка...'}
          </span>
        </div>
      </div>

      {/* Сетка полотна */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: `repeat(${size}, 18px)`,
        backgroundColor: '#1e1e1e', 
        border: '3px solid #333', 
        boxShadow: '0 0 20px rgba(0,0,0,0.5)',
        cursor: canClick ? 'crosshair' : 'wait'
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
                width: '18px', 
                height: '18px',
                border: '0.1px solid #252525',
                backgroundColor: pixelColor || '#ffffff', // По умолчанию белое полотно
              }}
            />
          );
        })}
      </div>

      <footer style={{ marginTop: '30px', color: '#444', fontSize: '12px' }}>
        Pixel Battle v2.0 • Dark Mode
      </footer>
    </div>
  );
}