'use client';
import { useEffect, useState } from 'react';

export default function Home() {
  const [pixels, setPixels] = useState<Record<string, any>>({});
  const [tool, setTool] = useState<'draw' | 'erase'>('draw'); // draw или erase
  const size = 30;

  useEffect(() => {
    fetch('/api/pixels').then((res) => res.json()).then((data) => setPixels(data || {}));
  }, []);

  const clickPixel = async (x: number, y: number) => {
    const key = `${x}-${y}`;
    
    // Новое состояние пикселей для экрана
    const newPixels = { ...pixels };

    if (tool === 'draw') {
      if (pixels[key]) return;
      newPixels[key] = 1;
    } else {
      if (!pixels[key]) return;
      delete newPixels[key];
    }

    setPixels(newPixels); // Сразу обновляем экран

    // Отправляем запрос на сервер с указанием действия
    await fetch('/api/pixels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x, y, action: tool }),
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#f5f5f5', minHeight: '100vh', padding: '20px' }}>
      <h1>Pixel Battle</h1>

      {/* Панель инструментов */}
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

      {/* Сетка */}
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
                cursor: tool === 'draw' ? 'crosshair' : 'not-allowed'
              }}
            />
          );
        })}
      </div>
    </div>
  );
}