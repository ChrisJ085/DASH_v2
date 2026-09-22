// src/components/SignatureCanvas.tsx

import React, { useRef, useState, useEffect } from 'react';
import { Eraser, Check, RotateCcw } from 'lucide-react';

interface SignatureCanvasProps {
  onSave: (dataUrl: string) => void;
  onClear?: () => void;
  existingSignatureUrl?: string | null;
  disabled?: boolean;
}

export default function SignatureCanvas({
  onSave,
  onClear,
  existingSignatureUrl,
  disabled = false
}: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions based on client width
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width || 400;
    canvas.height = 160;

    // Line style settings
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a'; // slate-900

    // Fill background with white
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    if ('touches' in e && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    } else if ('clientX' in e) {
      return {
        x: (e as React.MouseEvent).clientX - rect.left,
        y: (e as React.MouseEvent).clientY - rect.top
      };
    }
    return { x: 0, y: 0 };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    setIsDrawing(true);
    setHasDrawn(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    if (onClear) onClear();
  };

  const handleConfirm = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl);
  };

  if (existingSignatureUrl) {
    return (
      <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-slate-700">
          <span>Captured Signature</span>
          {!disabled && onClear && (
            <button
              type="button"
              onClick={onClear}
              className="text-red-600 hover:text-red-800 text-[10px] uppercase font-bold flex items-center cursor-pointer"
            >
              <RotateCcw className="w-3 h-3 mr-1" /> Re-sign
            </button>
          )}
        </div>
        <img
          src={existingSignatureUrl}
          alt="Signature"
          className="w-full h-32 object-contain bg-white border border-slate-200 rounded-lg p-2"
        />
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-xl p-3 bg-white space-y-3 shadow-3xs">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-800">Sign Below (Touch / Mouse)</span>
        <button
          type="button"
          onClick={handleClear}
          disabled={disabled}
          className="text-slate-500 hover:text-slate-800 text-xs flex items-center font-semibold cursor-pointer"
        >
          <Eraser className="w-3.5 h-3.5 mr-1" /> Clear
        </button>
      </div>

      <div className="relative border border-slate-200 rounded-lg overflow-hidden touch-none bg-white">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full h-40 cursor-crosshair block"
        />
        {!hasDrawn && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 text-xs font-medium italic">
            Draw signature inside box...
          </div>
        )}
      </div>

      {!disabled && (
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!hasDrawn}
          className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center cursor-pointer"
        >
          <Check className="w-4 h-4 mr-1.5" /> Confirm Signature
        </button>
      )}
    </div>
  );
}
