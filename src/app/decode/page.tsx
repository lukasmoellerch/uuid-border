'use client';

import Link from 'next/link';
import { useState, useCallback, useRef } from 'react';
import { RGB, TOTAL_SEGMENTS, decodeFromPixelRow } from '@/lib/uuid-border';

export default function DecodePage() {
  const [image, setImage] = useState<string | null>(null);
  const [decodedUuids, setDecodedUuids] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processImage = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImage(dataUrl);
      decodeFromImage(dataUrl);
    };
    reader.onerror = () => {
      setDebugInfo('Failed to read file');
    };
    reader.readAsDataURL(file);
  }, []);

  const decodeFromImage = useCallback((dataUrl: string) => {
    setIsProcessing(true);
    setDecodedUuids([]);
    setDebugInfo('');

    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      
      const { found, debug } = scanForEncodedBorders(imageData);
      
      setDecodedUuids(found);
      setIsProcessing(false);
      
      if (found.length === 0) {
        setDebugInfo(debug || 'No UUIDs found');
      }
    };
    img.onerror = () => {
      setIsProcessing(false);
      setDebugInfo('Failed to load image');
    };
    img.src = dataUrl;
  }, []);

  const scanForEncodedBorders = (imageData: ImageData): { found: string[], debug: string } => {
    const found: string[] = [];
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const debugLines: string[] = [];

    const getPixel = (x: number, y: number): RGB => {
      const idx = (y * width + x) * 4;
      return {
        r: data[idx],
        g: data[idx + 1],
        b: data[idx + 2],
      };
    };

    // Check if a color looks like a border color (grayish)
    const isBorderColor = (c: RGB): boolean => {
      const avg = (c.r + c.g + c.b) / 3;
      return avg > 100 && avg < 180 && Math.abs(c.g - c.b) < 30;
    };

    const processedRows = new Set<number>();
    let candidatesFound = 0;

    for (let y = 0; y < height; y++) {
      // Skip if we already found something on nearby rows
      let skipRow = false;
      for (let dy = -3; dy <= 3; dy++) {
        if (processedRows.has(y + dy)) {
          skipRow = true;
          break;
        }
      }
      if (skipRow) continue;

      for (let x = 0; x < width - 100; x++) {
        const pixel = getPixel(x, y);
        
        // Look for border-like pixels
        if (!isBorderColor(pixel)) continue;

        // Find the extent of this border region
        let borderEnd = x;
        while (borderEnd < width && isBorderColor(getPixel(borderEnd, y))) {
          borderEnd++;
        }
        const borderWidth = borderEnd - x;
        
        // Need enough width for all segments (at least 84 pixels)
        if (borderWidth < TOTAL_SEGMENTS) {
          x = borderEnd;
          continue;
        }

        candidatesFound++;

        // Try different starting positions and widths
        // The detected border region may include padding
        const possibleEncodedWidths = [
          borderWidth,
          Math.floor(borderWidth * 0.95),
          Math.floor(borderWidth * 0.90),
          Math.floor(borderWidth * 0.85),
        ].filter(w => w >= TOTAL_SEGMENTS);

        const possibleOffsets = [0, 5, 10, 15, 20, 25, 30];

        let foundDecode = false;
        for (const encodedWidth of possibleEncodedWidths) {
          if (foundDecode) break;
          for (const offset of possibleOffsets) {
            if (foundDecode) break;
            
            const startX = x + offset;
            if (startX + encodedWidth > width) continue;

            const result = decodeFromPixelRow(
              (px) => getPixel(px, y),
              startX,
              encodedWidth
            );

            if (result) {
              if (debugLines.length < 3) {
                debugLines.push(`Found at y=${y}, x=${startX}, w=${encodedWidth}${result.endMarkerMatch ? '' : ' (end marker mismatch)'}`);
              }
              
              if (!found.includes(result.uuid)) {
                found.push(result.uuid);
                processedRows.add(y);
              }
              foundDecode = true;
            }
          }
        }

        x = borderEnd;
      }
    }

    let debug = '';
    if (found.length === 0) {
      debug = `Scanned ${height} rows, found ${candidatesFound} border candidates`;
      if (debugLines.length > 0) {
        debug += '\n' + debugLines.join('\n');
      }
    } else if (debugLines.length > 0) {
      debug = debugLines.join('\n');
    }

    return { found, debug };
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      processImage(file);
    }
  }, [processImage]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImage(file);
    }
  }, [processImage]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          processImage(file);
        }
        break;
      }
    }
  }, [processImage]);

  return (
    <main 
      className="min-h-screen bg-[var(--background)]"
      onPaste={handlePaste}
      tabIndex={0}
    >
      <div className="max-w-2xl mx-auto px-8 py-16">
        {/* Header */}
        <header className="flex justify-between items-baseline mb-20">
          <Link 
            href="/" 
            className="text-sm tracking-wider text-[var(--muted)] hover:text-[var(--foreground)] transition-colors uppercase"
          >
            <span className="mr-1">←</span> Encode
          </Link>
          <h1 className="text-2xl font-light tracking-wide text-[var(--foreground)]">
            Decode
          </h1>
        </header>

        {/* Subtitle */}
        <p className="text-[var(--muted)] text-lg font-light mb-12 max-w-md leading-relaxed">
          Extract hidden UUIDs from screenshots. Drop an image or paste from your clipboard.
        </p>

        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`
            cursor-pointer border transition-all duration-300 rounded-sm
            ${isDragging 
              ? 'border-[var(--accent)] bg-[var(--surface)] shadow-sm' 
              : 'border-[var(--border)] hover:border-[var(--accent)]/50 hover:bg-[var(--surface)]/50'
            }
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          
          <div className="py-20 px-8 text-center">
            <p className="text-[var(--muted)] text-base font-light italic">
              {isDragging ? 'Release to decode...' : 'Drop image or paste from clipboard'}
            </p>
          </div>
        </div>

        {/* Hidden canvas */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Results */}
        {(image || isProcessing || decodedUuids.length > 0 || debugInfo) && (
          <div className="mt-12 space-y-8">
            {/* Preview */}
            {image && (
              <div className="border border-[var(--border)] p-3 rounded-sm bg-[var(--surface)]">
                <img 
                  src={image} 
                  alt="Screenshot" 
                  className="max-w-full h-auto"
                />
              </div>
            )}

            {/* Processing */}
            {isProcessing && (
              <p className="text-[var(--muted)] text-base font-light italic animate-pulse">
                Scanning for hidden data...
              </p>
            )}

            {/* Decoded UUIDs */}
            {decodedUuids.length > 0 && (
              <div className="space-y-4">
                <span className="text-xs tracking-widest uppercase text-[var(--muted)] block">
                  Discovered {decodedUuids.length === 1 ? 'UUID' : 'UUIDs'}
                </span>
                {decodedUuids.map((uuid, index) => (
                  <div 
                    key={index}
                    className="flex items-center justify-between p-4 bg-[var(--surface)] border border-[var(--border)] rounded-sm"
                  >
                    <code className="mono text-sm text-[var(--accent)] tracking-wide">
                      {uuid}
                    </code>
                    <button
                      onClick={() => navigator.clipboard.writeText(uuid)}
                      className="text-xs tracking-wider uppercase text-[var(--muted)] hover:text-[var(--foreground)] transition-colors ml-4"
                    >
                      Copy
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Debug info */}
            {debugInfo && !isProcessing && (
              <p className="mono text-xs text-[var(--muted)]/70 whitespace-pre-line leading-relaxed">
                {debugInfo}
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
