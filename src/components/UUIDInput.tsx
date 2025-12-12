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

// Minimum width needed for reliable encoding (148 segments * 3 pixels minimum)
const MIN_ENCODING_WIDTH = 450;

/**
 * Get the cumulative CSS zoom factor applied to an element
 * This walks up the DOM tree to find any zoom styles
 */
function getEffectiveZoom(element: HTMLElement | null): number {
  let zoom = 1;
  let el = element;
  
  while (el && el !== document.documentElement) {
    const style = window.getComputedStyle(el);
    const elementZoom = parseFloat(style.zoom) || 1;
    zoom *= elementZoom;
    el = el.parentElement;
  }
  
  // Also check body and html
  const bodyZoom = parseFloat(window.getComputedStyle(document.body).zoom) || 1;
  const htmlZoom = parseFloat(window.getComputedStyle(document.documentElement).zoom) || 1;
  zoom *= bodyZoom * htmlZoom;
  
  return zoom;
}

export function UUIDInput({ 
  uuid,  
  onRegenerate,
  placeholder = "Type something...",
  className = "",
}: UUIDInputProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [dimensions, setDimensions] = useState({ width: 0, height: 0, zoom: 1 });
  const [copied, setCopied] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  // Update dimensions on resize, zoom change, and initial mount
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const zoom = getEffectiveZoom(containerRef.current);
        
        setDimensions(prev => {
          const newDimensions = {
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            zoom: zoom
          };
          // Only update if something changed
          if (prev.width !== newDimensions.width || 
              prev.height !== newDimensions.height || 
              prev.zoom !== newDimensions.zoom) {
            return newDimensions;
          }
          return prev;
        });
      }
    };

    // Initial update after a short delay to ensure DOM is ready
    const timeoutId = setTimeout(updateDimensions, 50);
    
    // Listen for window resize
    window.addEventListener('resize', updateDimensions);
    
    // Use MutationObserver to detect zoom changes on body/html
    // CSS zoom changes don't trigger resize events
    const observer = new MutationObserver(() => {
      updateDimensions();
    });
    
    // Observe style changes on body and html
    observer.observe(document.body, { 
      attributes: true, 
      attributeFilter: ['style'] 
    });
    observer.observe(document.documentElement, { 
      attributes: true, 
      attributeFilter: ['style'] 
    });
    
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updateDimensions);
      observer.disconnect();
    };
  }, []);

  // Calculate canvas dimensions that ensure minimum encoding width
  // When zoomed out, we need to render at higher resolution to maintain pixel density
  const visualWidth = dimensions.width;
  const visualHeight = dimensions.height;
  
  // Calculate the minimum canvas width needed to ensure encoding works
  // We need at least MIN_ENCODING_WIDTH pixels for the encoding
  const minCanvasWidth = Math.max(visualWidth, MIN_ENCODING_WIDTH);
  const scaleFactor = visualWidth > 0 ? minCanvasWidth / visualWidth : 1;
  const canvasWidth = Math.round(minCanvasWidth);
  const canvasHeight = Math.round(visualHeight * scaleFactor);

  // Draw the encoded border
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0 || dimensions.height === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas internal dimensions
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw the encoded border at the canvas resolution
    drawEncodedBorder(ctx, canvasWidth, canvasHeight, uuid, BORDER_WIDTH, BORDER_RADIUS);
  }, [uuid, dimensions, canvasWidth, canvasHeight]);

  const copyUuid = useCallback(() => {
    navigator.clipboard.writeText(uuid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [uuid]);

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Input container with encoded border */}
      <div 
        ref={containerRef}
        className={`
          relative flex-1 bg-[var(--surface)] 
          transition-all duration-300 ease-out
          ${isFocused ? 'shadow-lg shadow-[var(--glow)]' : 'shadow-sm'}
        `}
        style={{ 
          minHeight: `${56 + BORDER_WIDTH * 2}px`,
          borderRadius: `${BORDER_RADIUS}px`,
        }}
      >
        {/* Canvas for encoded border */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none"
          style={{
            // Canvas CSS dimensions match the container's visual size
            // The canvas internal resolution may be higher (canvasWidth x canvasHeight)
            // and the browser will scale it down to fit
            width: dimensions.width || '100%',
            height: dimensions.height || '100%',
            // pixelated rendering prevents blur when canvas is scaled
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
          className="w-full h-full bg-transparent outline-none mono placeholder:text-[var(--muted)] placeholder:opacity-50 placeholder:font-light placeholder:italic tracking-wide text-[var(--foreground)]"
          style={{
            fontSize: '1rem',
            margin: `${BORDER_WIDTH}px`,
            width: `calc(100% - ${BORDER_WIDTH * 2}px)`,
            height: '54px',
            borderRadius: `${BORDER_RADIUS - BORDER_WIDTH}px`,
            paddingLeft: `${BORDER_RADIUS + 8}px`,
            paddingRight: `${BORDER_RADIUS + 8}px`,
          }}
        />
        
        {/* Subtle inner glow on focus */}
        <div 
          className={`
            absolute inset-0 rounded-[14px] pointer-events-none transition-opacity duration-300
            ${isFocused ? 'opacity-100' : 'opacity-0'}
          `}
          style={{
            margin: `${BORDER_WIDTH}px`,
            boxShadow: 'inset 0 0 20px rgba(184, 149, 110, 0.05)',
          }}
        />
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1">
        {/* Copy button */}
        <button
          onClick={copyUuid}
          className="icon-btn group"
          title={copied ? 'Copied!' : 'Copy UUID'}
          aria-label={copied ? 'Copied!' : 'Copy UUID'}
        >
          {copied ? (
            <svg 
              className="w-5 h-5 text-[var(--success)]" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor" 
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg 
              className="w-5 h-5 transition-transform group-hover:scale-110" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor" 
              strokeWidth={1.5}
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" 
              />
            </svg>
          )}
        </button>

        {/* Regenerate button */}
        <button
          onClick={onRegenerate}
          className="icon-btn group"
          title="Generate new UUID"
          aria-label="Generate new UUID"
        >
          <svg 
            className="w-5 h-5 transition-transform group-hover:rotate-180 duration-500" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor" 
            strokeWidth={1.5}
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" 
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
