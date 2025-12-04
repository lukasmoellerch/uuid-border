'use client';

import Link from 'next/link';
import { useState, useCallback, useRef } from 'react';
import { RGB, TOTAL_SEGMENTS, decodeFromPixelRow } from '@/lib/uuid-border';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ColorSpectrum } from '@/components/ColorSpectrum';

export default function DecodePage() {
  const [image, setImage] = useState<string | null>(null);
  const [decodedUuids, setDecodedUuids] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  }, [decodeFromImage]);

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

  const copyUuid = useCallback((uuid: string, index: number) => {
    navigator.clipboard.writeText(uuid);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }, []);

  const clearResults = useCallback(() => {
    setImage(null);
    setDecodedUuids([]);
    setDebugInfo('');
  }, []);

  return (
    <main 
      className="min-h-screen bg-[var(--background)] transition-colors duration-300"
      onPaste={handlePaste}
      tabIndex={0}
    >
      <div className="max-w-2xl mx-auto px-6 sm:px-8 py-12 sm:py-16">
        {/* Header */}
        <header className="flex justify-between items-center mb-16 sm:mb-20">
          <div className="flex items-center gap-2">
            <Link 
              href="/" 
              className="text-sm tracking-wider text-[var(--muted)] hover:text-[var(--foreground)] transition-colors uppercase flex items-center gap-1"
            >
              <span className="text-lg">←</span> Encode
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <h1 className="text-2xl sm:text-3xl font-light tracking-wide text-[var(--foreground)]">
              Decode
            </h1>
            <ThemeToggle />
          </div>
        </header>

        {/* Hero */}
        <div className="mb-12 animate-fade-in">
          <h2 className="text-4xl sm:text-5xl font-light leading-tight mb-6 gradient-text">
            Extract the<br />
            hidden data
          </h2>
          <p className="text-[var(--muted)] text-lg font-light max-w-md leading-relaxed">
            Upload a screenshot containing an encoded border to reveal the UUID hidden within the color variations.
          </p>
        </div>

        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`
            cursor-pointer border-2 border-dashed transition-all duration-300 rounded-lg
            ${isDragging 
              ? 'border-[var(--accent)] bg-[var(--surface)] scale-[1.02] shadow-lg' 
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
          
          <div className="py-16 sm:py-20 px-8 text-center">
            <div className="mb-4 mx-auto w-12 h-12 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center">
              <svg className="w-6 h-6 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <p className="text-[var(--foreground)] text-lg font-light mb-2">
              {isDragging ? 'Release to decode...' : 'Drop image here'}
            </p>
            <p className="text-[var(--muted)] text-sm">
              or click to browse · <span className="mono text-xs">⌘V</span> to paste
            </p>
          </div>
        </div>

        {/* Hidden canvas */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Results */}
        {(image || isProcessing || decodedUuids.length > 0 || debugInfo) && (
          <div className="mt-12 space-y-8 animate-fade-in">
            {/* Preview */}
            {image && (
              <div className="relative group">
                <div className="border border-[var(--border)] p-3 rounded-lg bg-[var(--surface)] overflow-hidden">
                  <img 
                    src={image} 
                    alt="Screenshot" 
                    className="max-w-full h-auto rounded"
                  />
                </div>
                <button
                  onClick={clearResults}
                  className="absolute top-5 right-5 p-2 rounded-full bg-[var(--background)]/80 backdrop-blur-sm text-[var(--muted)] hover:text-[var(--foreground)] opacity-0 group-hover:opacity-100 transition-all duration-200 border border-[var(--border)]"
                  title="Clear"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {/* Processing */}
            {isProcessing && (
              <div className="flex items-center gap-3 text-[var(--muted)] text-base font-light">
                <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                Scanning for hidden data...
              </div>
            )}

            {/* Decoded UUIDs */}
            {decodedUuids.length > 0 && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-sm tracking-widest uppercase text-[var(--muted)]">
                    Found {decodedUuids.length} {decodedUuids.length === 1 ? 'UUID' : 'UUIDs'}
                  </span>
                </div>
                
                {decodedUuids.map((uuid, index) => (
                  <div 
                    key={index}
                    className="animate-slide-in"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-lg space-y-4">
                      <div className="flex items-center justify-between">
                        <code className="mono text-sm sm:text-base text-[var(--accent)] tracking-wide">
                          {uuid}
                        </code>
                        <button
                          onClick={() => copyUuid(uuid, index)}
                          className="flex items-center gap-1 text-xs tracking-wider uppercase text-[var(--muted)] hover:text-[var(--foreground)] transition-colors ml-4"
                        >
                          {copiedIndex === index ? (
                            <>
                              <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                              Copied
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              Copy
                            </>
                          )}
                        </button>
                      </div>
                      
                      {/* Show the color spectrum for the decoded UUID */}
                      <div className="pt-3 border-t border-[var(--border)]">
                        <span className="text-[10px] tracking-widest uppercase text-[var(--muted)] block mb-2">
                          Color spectrum
                        </span>
                        <ColorSpectrum uuid={uuid} animated={false} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Debug info / No results */}
            {debugInfo && !isProcessing && decodedUuids.length === 0 && (
              <div className="p-4 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-yellow-500/10 flex items-center justify-center">
                    <svg className="w-4 h-4 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-[var(--foreground)]">No encoded UUIDs found</span>
                </div>
                <p className="mono text-xs text-[var(--muted)] whitespace-pre-line leading-relaxed">
                  {debugInfo}
                </p>
                <p className="text-xs text-[var(--muted)] mt-3">
                  Make sure the screenshot contains a border from the encoder page and has sufficient resolution.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-[var(--border)] text-center">
          <p className="text-xs text-[var(--muted)]">
            Tip: Works best with PNG screenshots · JPEG compression may affect accuracy
          </p>
        </footer>
      </div>
    </main>
  );
}
