'use client';
import { useEffect, useState } from 'react';

export default function Home() {
  const [pixels, setPixels] = useState<Record<string, any>>({});
  const [tool, setTool] = useState<'draw' | 'erase'>('draw');
  const size = 30;

  // Функция для загрузки данных с сервера
  const loadPixels = async () => {
    try {
      const res = await fetch('/api/pixels');
      const data = await res.json();
      setPixels(data || {});
    } catch (e) {
      console.error("Ошибка при обновлении данных", e);
    }
  };

  // 1. Загрузка при первом входе + авто-обновление каждые 2 секунды
  useEffect(() => {
    loadPixels(); // Загрузить сразу

    const interval = setInterval(() => {
      loadPixels(); // Спрашивать сервер каждые 2000 мс (2 секунды)
    }, 2000);

    return () => clearInterval(interval); // Очистить таймер, если закрыли страницу
  }, []);

  const clickPixel = async (x: number, y: number) => {
    const key = `${x}-${y}`;
    const newPixels = { ...pixels };

    if (tool === 'draw') {
      if (pixels[key]) return;
      newPixels[key] = 1;
    } else {
      if (!pixels[key]) return;
      delete newPixels[key];
    }

    setPixels(newPixels); // Мгновенно обновляем у себя

    // Отправляем на сервер
    await fetch('/api/pixels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x, y, action: tool }),
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#f5f5f5', minHeight: '100vh', padding: '20px' }}>
      <h1>Pixel Battle (LIVE 🔴)</h1>

      <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
        <button 
          onClick={() => setTool('draw')}
          style={{
            padding: '10px 20px', fontSize: '20px', cursor: 'pointer',
            backgroundColor: tool === 'draw' ? '#000' : '#fff',
            color: tool === 'draw' ? '#fff' : '#000',
            border: '2px solid #000', borderRadius: '8px'
          }}
        >
          ✏️ Карандаш
        </button>
        <button 
          onClick={() => setTool('erase')}
          style={{
            padding: '10px 20px', fontSize: '20px', cursor: 'pointer',
            backgroundColor: tool === 'erase' ? '#000' : '#fff',
            color: tool === 'erase' ? '#fff' : '#000',
            border: '2px solid #000', borderRadius: '8px'
          }}
        >
          🧼 Ластик
        </button>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: `repeat(${size}, 15px)`,
        backgroundColor: '#fff', border: '2px solid #333'
      }}>
        {Array.from({ length: size * size }).map((_, i) => {
          const x = i % size;
          const y = Math.floor(i / size);
          const isBlack = pixels[`${x}-${y}`];
          return (
            <div
              key={i}
              onClick={() => clickPixel(x, y)}
              style={{
                width: '15px', height: '15px',
                border: '0.5px solid #eee',
                backgroundColor: isBlack ? 'black' : 'white',
                cursor: 'crosshair'
              }}
            />
          );
        })}
      </div>
      <p style={{ color: '#888', marginTop: '10px' }}>Обновление каждые 2 секунды...</p>
    </div>
  );
}