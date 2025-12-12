'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { drawEncodedBorder } from '@/lib/uuid-border';

interface UUIDInputProps {
  uuid: string;
  onRegenerate: () => void;
  placeholder?: string;
  className?: string;
}

const BORDER_WIDTH = 1;
const BORDER_RADIUS = 8;

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
        className="relative flex-1 bg-[var(--surface)]"
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
          placeholder={placeholder}
          className="w-full h-full px-4 py-2 bg-transparent outline-none mono placeholder:text-[var(--muted)]/50 placeholder:font-light placeholder:italic"
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
        className="p-3 text-[var(--muted)] hover:text-[var(--accent)] transition-colors duration-200"
        title={copied ? 'Copied!' : 'Copy UUID'}
      >
        {copied ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.25}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.25}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </button>

      {/* New UUID button */}
      <button
        onClick={onRegenerate}
        className="p-3 text-[var(--muted)] hover:text-[var(--accent)] transition-colors duration-200"
        title="Generate new UUID"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.25}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    </div>
  );
}
