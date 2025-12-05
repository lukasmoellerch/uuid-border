'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { drawEncodedBorder } from '@/lib/uuid-border';

interface UUIDInputProps {
  uuid: string;
  onRegenerate: () => void;
  placeholder?: string;
  className?: string;
}

const BORDER_WIDTH = 2;
const BORDER_RADIUS = 16;

export function UUIDInput({ 
  uuid,  
  onRegenerate,
  placeholder = "Type something...",
  className = "",
}: UUIDInputProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [copied, setCopied] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  // Update dimensions on resize and initial mount
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        });
      }
    };

    const timeoutId = setTimeout(updateDimensions, 50);
    
    window.addEventListener('resize', updateDimensions);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updateDimensions);
    };
  }, []);

  // Draw the encoded border
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0 || dimensions.height === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    drawEncodedBorder(ctx, dimensions.width, dimensions.height, uuid, BORDER_WIDTH, BORDER_RADIUS);
  }, [uuid, dimensions]);

  const copyUuid = useCallback(() => {
    navigator.clipboard.writeText(uuid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [uuid]);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Input container with encoded border */}
      <div 
        ref={containerRef}
        className={`
          relative flex-1 
          bg-[var(--surface)] 
          backdrop-blur-xl
          transition-all duration-300
          ${isFocused ? 'glow' : ''}
        `}
        style={{ 
          minHeight: `${60 + BORDER_WIDTH * 2}px`,
          borderRadius: `${BORDER_RADIUS}px`,
        }}
      >
        {/* Gradient border overlay */}
        <div 
          className={`
            absolute inset-0 rounded-[16px] pointer-events-none
            transition-opacity duration-300
            ${isFocused ? 'opacity-100' : 'opacity-0'}
          `}
          style={{
            background: 'linear-gradient(135deg, rgba(167, 139, 250, 0.3), rgba(56, 189, 248, 0.2))',
            padding: '2px',
            WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
          }}
        />
        
        {/* Canvas for encoded border */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none"
          style={{
            width: dimensions.width || '100%',
            height: dimensions.height || '100%',
            imageRendering: 'pixelated',
            borderRadius: `${BORDER_RADIUS}px`,
          }}
        />
        
        {/* Actual input */}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          className="
            w-full h-full bg-transparent outline-none 
            mono text-[var(--foreground)]
            placeholder:text-[var(--muted)]/40 
            placeholder:font-light 
            placeholder:italic 
            tracking-wide
            transition-all duration-200
          "
          style={{
            fontSize: '1rem',
            margin: `${BORDER_WIDTH}px`,
            width: `calc(100% - ${BORDER_WIDTH * 2}px)`,
            height: '56px',
            borderRadius: `${BORDER_RADIUS - BORDER_WIDTH}px`,
            paddingLeft: `${BORDER_RADIUS + 8}px`,
            paddingRight: `${BORDER_RADIUS + 8}px`,
          }}
        />
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1">
        {/* Copy button */}
        <button
          onClick={copyUuid}
          className="btn-ghost group relative"
          title={copied ? 'Copied!' : 'Copy UUID'}
        >
          <div className={`
            transition-all duration-300
            ${copied ? 'scale-110 text-green-400' : 'group-hover:scale-110'}
          `}>
            {copied ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </div>
        </button>

        {/* New UUID button */}
        <button
          onClick={onRegenerate}
          className="btn-ghost group"
          title="Generate new UUID"
        >
          <svg 
            className="w-5 h-5 transition-transform duration-500 group-hover:rotate-180" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor" 
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
    </div>
  );
}
