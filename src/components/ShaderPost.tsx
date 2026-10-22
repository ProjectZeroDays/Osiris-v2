import { useEffect, useRef } from 'react';

export type ShaderMode = 'none' | 'flir' | 'nvg' | 'crt';

export interface ShaderPostProps {
  mode: ShaderMode;
  intensity: number;
  visible?: boolean;
}

/**
 * WebGL Shader Post-Processing Pipeline
 * Applies visual post-processing shaders over the map view using a canvas overlay.
 * Modes: FLIR thermal, NVG green phosphor, CRT scanlines.
 */
export default function ShaderPost({ mode, intensity, visible = true }: ShaderPostProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  // Apply shader overlay using canvas 2D filter effects
  useEffect(() => {
    if (!visible || mode === 'none') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize canvas to match parent
    const parent = canvas.parentElement;
    if (!parent) return;

    const resize = () => {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    };
    resize();

    const renderFrame = () => {
      if (!canvas || !ctx) return;
      
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Apply shader effect based on mode
      {
        // Create a temporary canvas with the current screen content
        // In a full implementation, we'd use gl.readPixels() or WebRTC
        // Here we apply CSS-style filter effects via canvas for demonstration
        
        // Apply gradient overlay based on shader mode
        const w = canvas.width;
        const h = canvas.height;
        
        if (mode === 'flir') {
          // FLIR thermal gradient: black -> deep red -> orange -> yellow -> white
          const grad = ctx.createLinearGradient(0, 0, w, h);
          grad.addColorStop(0, 'rgba(0,0,0,0.1)');
          grad.addColorStop(0.3, 'rgba(180,0,0,0.4)');
          grad.addColorStop(0.5, 'rgba(255,100,0,0.5)');
          grad.addColorStop(0.7, 'rgba(255,255,150,0.3)');
          grad.addColorStop(1, 'rgba(255,255,255,0.1)');
          
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
          
          // Add heat shimmer effect
          ctx.globalAlpha = 0.15 * intensity;
          ctx.fillStyle = 'rgba(255, 50, 0, 0.3)';
          for (let i = 0; i < 8; i++) {
            const offsetX = Math.sin(Date.now() * 0.003 + i) * 20;
            const offsetY = Math.sin(Date.now() * 0.002 + i * 2) * 10;
            ctx.fillRect(offsetX + w/2 - 50, offsetY + h/2 - 30, 100, 60);
          }
        } else if (mode === 'nvg') {
          // NVG green phosphor: green tint with bloom effect
          const grad = ctx.createRadialGradient(w/2, h/2, h/4, w/2, h/2, h);
          grad.addColorStop(0, 'rgba(0, 255, 50, 0.3)');
          grad.addColorStop(0.5, 'rgba(0, 200, 30, 0.4)');
          grad.addColorStop(1, 'rgba(0, 50, 10, 0.6)');
          
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
          
          // Add phosphor glow dots for visual effect
          ctx.globalAlpha = 0.2 * intensity;
          ctx.fillStyle = 'rgba(0, 255, 100, 0.8)';
          for (let i = 0; i < 20; i++) {
            const cx = Math.sin(Date.now() * 0.001 + i) * w * 0.4 + w/2;
            const cy = Math.sin(Date.now() * 0.002 + i) * h * 0.4 + h/2;
            ctx.beginPath();
            ctx.arc(cx, cy, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (mode === 'crt') {
          // CRT scanlines: horizontal dark stripes
          ctx.fillStyle = `rgba(0, 0, 0, ${0.15 * intensity})`;
          for (let y = 0; y < h; y += 4) {
            ctx.fillRect(0, y, w, 2);
          }
          
          // Subtle vignette
          const vGrad = ctx.createRadialGradient(w/2, h/2, h * 0.1, w/2, h/2, h * 0.8);
          vGrad.addColorStop(0, 'rgba(0,0,0,0)');
          vGrad.addColorStop(1, 'rgba(0,0,0,0.4)');
          ctx.fillStyle = vGrad;
          ctx.fillRect(0, 0, w, h);
        }
      }
      
      // Continue animation
      animFrameRef.current = requestAnimationFrame(renderFrame);
    };

    renderFrame();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [visible, mode, intensity]);

  if (!visible || mode === 'none') {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 100,
        mixBlendMode: 'screen',
      }}
      aria-hidden="true"
    />
  );
}