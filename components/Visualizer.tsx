import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  isActive: boolean;
  color: string;
}

const Visualizer: React.FC<VisualizerProps> = ({ isActive, color }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let bars: number[] = Array(20).fill(10);

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;
      const barWidth = (width / bars.length) - 4;

      if (isActive) {
        // Randomize bar heights to simulate activity
        bars = bars.map(() => Math.random() * (height * 0.8) + 5);
      } else {
        // Decay to idle state
        bars = bars.map(h => Math.max(4, h * 0.9));
      }

      bars.forEach((h, i) => {
        const x = i * (barWidth + 4) + 2;
        const y = (height - h) / 2;
        
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, h, 4);
        ctx.fill();
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => cancelAnimationFrame(animationRef.current);
  }, [isActive, color]);

  return (
    <canvas 
      ref={canvasRef} 
      width={300} 
      height={60} 
      className="w-full max-w-[300px] h-[60px]"
    />
  );
};

export default Visualizer;
