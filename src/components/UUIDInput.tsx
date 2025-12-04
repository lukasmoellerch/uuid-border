'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { drawEncodedBorder, uuidToColorSequence } from '@/lib/uuid-border';

interface UUIDInputProps {
  uuid: string;
  onRegenerate: () => void;
  onUuidChange?: (uuid: string) => void;
  placeholder?: string;
  className?: string;
}

const BORDER_WIDTH = 1;
const BORDER_RADIUS = 8;

export function UUIDInput({ 
  uuid,  
  onRegenerate,
  onUuidChange,
  placeholder = "Type something...",
  className = "",
}: UUIDInputProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editUuid, setEditUuid] = useState('');

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

  const handleEditStart = () => {
    setEditUuid(uuid);
    setIsEditing(true);
  };

  const handleEditSubmit = () => {
    // Validate UUID format
    const cleanUuid = editUuid.replace(/-/g, '').toLowerCase();
    if (cleanUuid.length === 32 && /^[0-9a-f]+$/.test(cleanUuid)) {
      // Format it properly
      const formatted = `${cleanUuid.slice(0, 8)}-${cleanUuid.slice(8, 12)}-${cleanUuid.slice(12, 16)}-${cleanUuid.slice(16, 20)}-${cleanUuid.slice(20)}`;
      onUuidChange?.(formatted);
    }
    setIsEditing(false);
  };

  const handleEditCancel = () => {
    setIsEditing(false);
    setEditUuid('');
  };

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Input container with encoded border */}
      <div 
        ref={containerRef}
        className="relative flex-1 bg-[var(--surface)] hover-lift"
        style={{ 
          minHeight: `${52 + BORDER_WIDTH * 2}px`,
          borderRadius: `${BORDER_RADIUS}px`,
        }}
      >
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
          placeholder={placeholder}
          className="w-full h-full px-4 py-2 bg-transparent outline-none mono placeholder:text-[var(--muted)]/50 placeholder:font-light placeholder:italic tracking-wide"
          style={{
            fontSize: '1rem',
            margin: `${BORDER_WIDTH}px`,
            width: `calc(100% - ${BORDER_WIDTH * 2}px)`,
            height: '50px',
            borderRadius: `${BORDER_RADIUS - BORDER_WIDTH}px`,
            paddingLeft: `${BORDER_RADIUS + 4}px`,
            paddingRight: `${BORDER_RADIUS + 4}px`,
          }}
        />
      </div>

      {/* Copy button */}
      <button
        onClick={copyUuid}
        className="p-3 text-[var(--muted)] hover:text-[var(--accent)] transition-colors duration-200 relative group"
        title={copied ? 'Copied!' : 'Copy UUID'}
      >
        {copied ? (
          <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.25}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
        <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-[var(--muted)]">
          {copied ? 'Copied!' : 'Copy'}
        </span>
      </button>

      {/* Edit UUID button */}
      {onUuidChange && (
        <button
          onClick={handleEditStart}
          className="p-3 text-[var(--muted)] hover:text-[var(--accent)] transition-colors duration-200 relative group"
          title="Edit UUID"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.25}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
          </svg>
          <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-[var(--muted)]">
            Edit
          </span>
        </button>
      )}

      {/* New UUID button */}
      <button
        onClick={onRegenerate}
        className="p-3 text-[var(--muted)] hover:text-[var(--accent)] transition-colors duration-200 relative group"
        title="Generate new UUID"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.25}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-[var(--muted)]">
          New UUID
        </span>
      </button>

      {/* Edit modal */}
      {isEditing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-[var(--surface)] p-6 rounded-lg border border-[var(--border)] max-w-md w-full mx-4 animate-slide-in">
            <h3 className="text-lg font-medium mb-4">Edit UUID</h3>
            <input
              type="text"
              value={editUuid}
              onChange={(e) => setEditUuid(e.target.value)}
              className="w-full p-3 bg-[var(--background)] border border-[var(--border)] rounded-md mono text-sm focus:border-[var(--accent)] focus:outline-none"
              placeholder="Enter UUID..."
              autoFocus
            />
            <div className="flex gap-3 mt-4 justify-end">
              <button onClick={handleEditCancel} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleEditSubmit} className="btn-primary">
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Color visualization component
export function ColorVisualization({ uuid }: { uuid: string }) {
  const colors = uuidToColorSequence(uuid);
  
  return (
    <div className="w-full overflow-hidden rounded-md">
      <div className="flex h-3">
        {colors.map((color, i) => (
          <div
            key={i}
            className="flex-1 transition-all duration-300"
            style={{ backgroundColor: `rgb(${color.r}, ${color.g}, ${color.b})` }}
            title={`Segment ${i}: rgb(${color.r}, ${color.g}, ${color.b})`}
          />
        ))}
      </div>
    </div>
  );
}
