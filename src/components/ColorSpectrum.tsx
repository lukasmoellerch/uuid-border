'use client';

import { useEffect, useRef, useMemo } from 'react';
import { uuidToColorSequence, RGB } from '@/lib/uuid-border';

interface ColorSpectrumProps {
  uuid: string;
  className?: string;
  animated?: boolean;
  showLabels?: boolean;
}

export function ColorSpectrum({ 
  uuid, 
  className = '', 
  animated = true,
  showLabels = false 
}: ColorSpectrumProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colors = useMemo(() => {
    try {
      return uuidToColorSequence(uuid);
    } catch {
      return [];
    }
  }, [uuid]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || colors.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const segmentWidth = width / colors.length;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw each color segment
    colors.forEach((color, i) => {
      ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
      ctx.fillRect(i * segmentWidth, 0, segmentWidth + 1, height);
    });
  }, [colors]);

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        width={840}
        height={20}
        className={`w-full h-5 rounded-sm ${animated ? 'animate-fade-in' : ''}`}
        style={{ imageRendering: 'pixelated' }}
      />
      {showLabels && (
        <div className="flex justify-between mt-2 text-[10px] text-[var(--muted)] uppercase tracking-wider">
          <span>Start marker</span>
          <span>Index colors</span>
          <span>UUID data (64 segments)</span>
          <span>End marker</span>
        </div>
      )}
    </div>
  );
}

interface ColorBreakdownProps {
  uuid: string;
  className?: string;
}

export function ColorBreakdown({ uuid, className = '' }: ColorBreakdownProps) {
  const colors = useMemo(() => {
    try {
      return uuidToColorSequence(uuid);
    } catch {
      return [];
    }
  }, [uuid]);

  // Break down into sections
  const startMarker = colors.slice(0, 6);
  const indexColors = colors.slice(6, 14);
  const dataColors = colors.slice(14, 78);
  const endMarker = colors.slice(78, 84);

  const renderColorGroup = (group: RGB[], label: string, delay: number) => (
    <div className="space-y-2 animate-fade-in" style={{ animationDelay: `${delay}ms` }}>
      <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{label}</span>
      <div className="flex gap-0.5">
        {group.map((color, i) => (
          <div
            key={i}
            className="w-3 h-6 rounded-sm transition-transform hover:scale-110"
            style={{ backgroundColor: `rgb(${color.r}, ${color.g}, ${color.b})` }}
            title={`RGB(${color.r}, ${color.g}, ${color.b})`}
          />
        ))}
      </div>
    </div>
  );

  if (colors.length === 0) return null;

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {renderColorGroup(startMarker, 'Start (6)', 0)}
        {renderColorGroup(indexColors, 'Index (8)', 100)}
        <div className="col-span-2 md:col-span-1 space-y-2 animate-fade-in" style={{ animationDelay: '200ms' }}>
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Data (64)</span>
          <div className="flex flex-wrap gap-0.5 max-w-xs">
            {dataColors.slice(0, 16).map((color, i) => (
              <div
                key={i}
                className="w-2 h-3 rounded-[2px]"
                style={{ backgroundColor: `rgb(${color.r}, ${color.g}, ${color.b})` }}
              />
            ))}
            <span className="text-[var(--muted)] text-xs px-1">...</span>
          </div>
        </div>
        {renderColorGroup(endMarker, 'End (6)', 300)}
      </div>
    </div>
  );
}
