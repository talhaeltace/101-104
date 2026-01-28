import React, { useState, useRef, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';

interface SwipeConfirmProps {
  onConfirm: () => void;
  text: string;
  confirmText?: string;
  backgroundColor?: string;
  textColor?: string;
  disabled?: boolean;
}

const SwipeConfirm: React.FC<SwipeConfirmProps> = ({
  onConfirm,
  text,
  confirmText = '✓',
  backgroundColor = '#10b981',
  disabled = false
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const maxDragRef = useRef(0);
  const dragXRef = useRef(0);

  const setDragXSync = (value: number) => {
    dragXRef.current = value;
    setDragX(value);
  };

  useEffect(() => {
    let raf = 0;

    const measure = () => {
      const container = containerRef.current;
      const slider = sliderRef.current;
      if (!container || !slider) return;
      try {
        const containerWidth = container.offsetWidth;
        const sliderWidth = slider.offsetWidth;
        maxDragRef.current = Math.max(0, containerWidth - sliderWidth - 8); // 8px padding
      } catch {
        // ignore
      }
    };

    // Measure after layout settles
    raf = window.requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      try { window.cancelAnimationFrame(raf); } catch { /* ignore */ }
      window.removeEventListener('resize', measure);
    };
  }, []);

  const handleStart = (clientX: number) => {
    if (disabled || isConfirmed) return;
    setIsDragging(true);
    startXRef.current = clientX - dragXRef.current;
  };

  // Mouse events
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleStart(e.clientX);
  };

  // Touch events
  const handleTouchStart = (e: React.TouchEvent) => {
    handleStart(e.touches[0].clientX);
  };

  useEffect(() => {
    if (!isDragging) return;

    const move = (clientX: number) => {
      if (disabled || isConfirmed) return;
      const newX = clientX - startXRef.current;
      const clampedX = Math.max(0, Math.min(newX, maxDragRef.current));
      setDragXSync(clampedX);
    };

    const end = () => {
      if (disabled || isConfirmed) return;
      setIsDragging(false);

      // Check if dragged past threshold (80%)
      const threshold = maxDragRef.current * 0.8;
      if (dragXRef.current >= threshold) {
        // Confirmed!
        setIsConfirmed(true);
        setDragXSync(maxDragRef.current);
        setTimeout(() => {
          onConfirm();
          // Reset after animation
          setTimeout(() => {
            setIsConfirmed(false);
            setDragXSync(0);
          }, 300);
        }, 200);
      } else {
        // Reset
        setDragXSync(0);
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      move(e.clientX);
    };
    const onMouseUp = () => {
      end();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) move(e.touches[0].clientX);
    };
    const onTouchEnd = () => {
      end();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onTouchEnd);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [isDragging, disabled, isConfirmed, onConfirm]);

  const progress = maxDragRef.current > 0 ? (dragX / maxDragRef.current) * 100 : 0;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '56px',
        backgroundColor: 'rgba(229,231,235,0.15)',
        borderRadius: '16px',
        overflow: 'hidden',
        cursor: disabled ? 'not-allowed' : 'pointer',
        userSelect: 'none',
        opacity: disabled ? 0.5 : 1,
        border: '1px solid rgba(255,255,255,0.1)'
      }}
    >
      {/* Progress background */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          height: '100%',
          width: `${progress}%`,
          backgroundColor: backgroundColor,
          transition: isDragging ? 'none' : 'width 0.3s ease',
          borderRadius: '16px',
          opacity: 0.9
        }}
      />

      {/* Text */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '15px',
          fontWeight: '600',
          color: progress > 40 ? '#ffffff' : '#d1d5db',
          transition: 'color 0.2s ease',
          pointerEvents: 'none',
          letterSpacing: '0.02em'
        }}
      >
        {text}
      </div>

      {/* Slider button */}
      <div
        ref={sliderRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        style={{
          position: 'absolute',
          left: `${dragX}px`,
          top: '4px',
          width: '48px',
          height: '48px',
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          transition: isDragging ? 'none' : 'left 0.3s ease',
          cursor: disabled ? 'not-allowed' : 'grab',
          touchAction: 'none',
          border: '2px solid rgba(255,255,255,0.5)'
        }}
      >
        {isConfirmed ? (
          <span style={{ fontSize: '24px', color: backgroundColor }}>{confirmText}</span>
        ) : (
          <ChevronRight className="w-6 h-6" style={{ color: '#6b7280' }} />
        )}
      </div>
    </div>
  );
};

export default SwipeConfirm;
