'use client';
import { useEffect, useState } from 'react';

export default function Home() {
  // Тут хранятся закрашенные пиксели
  const [pixels, setPixels] = useState<Record<string, number>>({});
  
  // Размер сетки (30 на 30 пикселей)
  const size = 30; 

  // 1. Загружаем пиксели из базы при открытии сайта
  useEffect(() => {
    fetch('/api/pixels')
      .then((res) => res.json())
      .then((data) => {
        if (data) setPixels(data);
      })
      .catch(err => console.error("Ошибка загрузки:", err));
  }, []);

  // 2. Функция при клике на клетку
  const clickPixel = async (x: number, y: number) => {
    const key = `${x}-${y}`;
    
    // Если пиксель уже черный, ничего не делаем
    if (pixels[key]) return;

    // Сразу красим в черный в браузере (чтобы не тупило)
    setPixels((prev) => ({ ...prev, [key]: 1 }));

    // Отправляем запрос в базу данных
    await fetch('/api/pixels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x, y }),
    });
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center',
      minHeight: '100vh', 
      backgroundColor: '#f5f5f5',
      fontFamily: 'sans-serif' 
    }}>
      <h1 style={{ marginBottom: '20px' }}>Pixel Battle</h1>
      
      {/* Сетка игры */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: `repeat(${size}, 15px)`, // 15px - размер одного пикселя
        gap: '1px', 
        backgroundColor: '#ddd', // Цвет линий сетки
        border: '2px solid #333' 
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
                width: '15px',
                height: '15px',
                backgroundColor: isBlack ? '#000' : '#fff',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
            />
          );
        })}
      </div>

      <p style={{ marginTop: '20px', color: '#666' }}>
        Кликни на клетку, чтобы закрасить её навсегда!
      </p>
    </div>
  );
}