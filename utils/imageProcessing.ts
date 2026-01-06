import { ProcessingSettings } from '../types';

/**
 * Loads an image from a source string (URL or Base64)
 */
export const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
};

/**
 * Resizes the canvas to match the image, respecting max constraints
 */
export const setupCanvas = (
  canvas: HTMLCanvasElement, 
  img: HTMLImageElement, 
  scale: number
): { width: number, height: number } => {
  const maxWidth = 800;
  let width = img.width;
  let height = img.height;

  if (width > maxWidth) {
    const ratio = maxWidth / width;
    width = maxWidth;
    height = height * ratio;
  }

  // Apply output scale
  width = Math.floor(width * scale);
  height = Math.floor(height * scale);

  canvas.width = width;
  canvas.height = height;

  return { width, height };
};

/**
 * Generates a smooth noise map for coherent distortion
 */
const createNoiseMap = (width: number, height: number): Float32Array => {
  // We create a low-frequency noise grid and upscale it to creating smooth waves
  // rather than per-pixel static.
  const gridSize = 20; // The size of the "waviness"
  const cols = Math.ceil(width / gridSize) + 1;
  const rows = Math.ceil(height / gridSize) + 1;
  
  const grid = new Float32Array(cols * rows);
  for (let i = 0; i < grid.length; i++) {
    grid[i] = (Math.random() - 0.5) * 2; // -1 to 1
  }

  const map = new Float32Array(width * height);

  // Bilinear interpolation (simplified)
  // For performance in JS, we can just do nearest neighbor of the grid 
  // with a slight smoothing, or simple interpolation. 
  // Let's do a simple interpolation loop.
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx = x / gridSize;
      const gy = y / gridSize;
      
      const gxi = Math.floor(gx);
      const gyi = Math.floor(gy);
      
      const tx = gx - gxi;
      const ty = gy - gyi;
      
      const c00 = grid[gyi * cols + gxi];
      const c10 = grid[gyi * cols + (gxi + 1)];
      const c01 = grid[(gyi + 1) * cols + gxi];
      const c11 = grid[(gyi + 1) * cols + (gxi + 1)];
      
      // Interpolate
      const top = c00 + (c10 - c00) * tx;
      const bottom = c01 + (c11 - c01) * tx;
      const val = top + (bottom - top) * ty;
      
      map[y * width + x] = val;
    }
  }
  
  return map;
};

/**
 * Generates N frames of jittered line art with optional edge detection and color preservation
 */
export const generateJitterFrames = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number,
  settings: ProcessingSettings
): ImageData[] => {
  // 1. Draw original image to get pixel data
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  const sourceData = ctx.getImageData(0, 0, width, height);
  const srcPixels = sourceData.data;

  const frames: ImageData[] = [];

  // Parse hex colors
  const hexToRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  };

  const lineRGB = hexToRgb(settings.lineColor);
  const bgRGB = hexToRgb(settings.bgColor);

  // Helper: Get pixel data
  const getIdx = (x: number, y: number) => (y * width + x) * 4;

  // 2. Generate frames
  for (let f = 0; f < settings.frameCount; f++) {
    const newImageData = new ImageData(width, height);
    const dstPixels = newImageData.data;

    // Fill background
    for (let i = 0; i < dstPixels.length; i += 4) {
      dstPixels[i] = bgRGB.r;
      dstPixels[i + 1] = bgRGB.g;
      dstPixels[i + 2] = bgRGB.b;
      dstPixels[i + 3] = 255; 
    }

    // Generate displacement maps for this frame (X and Y axis)
    // We use coherent noise so the lines "wobble" instead of "fuzz"
    const mapX = createNoiseMap(width, height);
    const mapY = createNoiseMap(width, height);

    // Iterate through source pixels
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = getIdx(x, y);
        let isLine = false;

        // --- Improved Detection Logic ---
        if (settings.detectionMode === 'edge') {
          // RGB Edge Detection (Sobel-like difference)
          // Checks neighbors to the right and bottom
          
          if (x < width - 1 && y < height - 1) {
            const r = srcPixels[idx];
            const g = srcPixels[idx + 1];
            const b = srcPixels[idx + 2];

            const rx = srcPixels[idx + 4];
            const gx = srcPixels[idx + 5];
            const bx = srcPixels[idx + 6];

            const ry = srcPixels[idx + width * 4];
            const gy = srcPixels[idx + width * 4 + 1];
            const by = srcPixels[idx + width * 4 + 2];

            // Sum of absolute differences in RGB
            const diffX = Math.abs(r - rx) + Math.abs(g - gx) + Math.abs(b - bx);
            const diffY = Math.abs(r - ry) + Math.abs(g - gy) + Math.abs(b - by);
            
            const totalDiff = diffX + diffY;

            // Threshold Logic (0-500 scale)
            // settings.threshold is 0 (Low sensitivity) to 500 (High sensitivity)
            // Cutoff determines how big the difference must be to count as an edge.
            // 0 input -> 500 cutoff (Must be huge difference)
            // 500 input -> 0 cutoff (Any difference triggers it)
            const cutoff = Math.max(0, 500 - settings.threshold);
            
            isLine = totalDiff > cutoff;
          }

        } else {
          // Brightness/Darkness Mode (Standard)
          // Good for dark lines on light background.
          const r = srcPixels[idx];
          const g = srcPixels[idx + 1];
          const b = srcPixels[idx + 2];
          
          // Simple luminance
          const luma = 0.299 * r + 0.587 * g + 0.114 * b;
          
          // Threshold: High value = Include lighter things.
          // Since max Luma is 255, if threshold is > 255, it includes everything.
          isLine = luma < settings.threshold;
        }

        // --- Distortion & Rendering ---
        if (isLine) {
          // Calculate displacement
          // mapX/Y are -1 to 1. JitterAmount is 0-10 pixels.
          // We add some extra randomness per pixel to keep it organic but guided by the map
          // purely coherent noise can look like "underwater" effect, 
          // so we mix: 70% coherent, 30% jitter.
          
          const coherentX = mapX[y * width + x] * settings.jitterAmount;
          const coherentY = mapY[y * width + x] * settings.jitterAmount;
          
          // Small high-frequency jitter (1px) for "ink bleed" texture
          const rawX = (Math.random() - 0.5) * (settings.jitterAmount * 0.3);
          const rawY = (Math.random() - 0.5) * (settings.jitterAmount * 0.3);

          let newX = Math.round(x + coherentX + rawX);
          let newY = Math.round(y + coherentY + rawY);

          // Clamp
          newX = Math.max(0, Math.min(width - 1, newX));
          newY = Math.max(0, Math.min(height - 1, newY));

          const newIdx = (newY * width + newX) * 4;

          // Write Pixel
          if (settings.useOriginalColors) {
            dstPixels[newIdx] = srcPixels[idx];
            dstPixels[newIdx + 1] = srcPixels[idx + 1];
            dstPixels[newIdx + 2] = srcPixels[idx + 2];
            dstPixels[newIdx + 3] = 255;
          } else {
            dstPixels[newIdx] = lineRGB.r;
            dstPixels[newIdx + 1] = lineRGB.g;
            dstPixels[newIdx + 2] = lineRGB.b;
            dstPixels[newIdx + 3] = 255;
          }
          
          // Anti-aliasing / Gap filling (Primitive)
          // Since we are moving pixels, we might leave holes. 
          // A simple hack for thicker sketchy lines is to draw the neighbor too if jitter is high.
          if (settings.jitterAmount > 2) {
             const rightIdx = newIdx + 4;
             if (rightIdx < dstPixels.length) {
                if (settings.useOriginalColors) {
                    dstPixels[rightIdx] = srcPixels[idx];
                    dstPixels[rightIdx+1] = srcPixels[idx+1];
                    dstPixels[rightIdx+2] = srcPixels[idx+2];
                    dstPixels[rightIdx+3] = 255;
                } else {
                    dstPixels[rightIdx] = lineRGB.r;
                    dstPixels[rightIdx+1] = lineRGB.g;
                    dstPixels[rightIdx+2] = lineRGB.b;
                    dstPixels[rightIdx+3] = 255;
                }
             }
          }
        }
      }
    }
    frames.push(newImageData);
  }

  return frames;
};