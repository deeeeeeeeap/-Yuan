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
  const gridSize = 20; 
  const cols = Math.ceil(width / gridSize) + 1;
  const rows = Math.ceil(height / gridSize) + 1;
  
  const grid = new Float32Array(cols * rows);
  for (let i = 0; i < grid.length; i++) {
    grid[i] = (Math.random() - 0.5) * 2; // -1 to 1
  }

  const map = new Float32Array(width * height);
  
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
 * Generates N frames of jittered line art using Backward Mapping to prevent holes
 */
export const generateJitterFrames = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number,
  settings: ProcessingSettings
): ImageData[] => {
  // 1. Draw original image to get source pixel data
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  const sourceData = ctx.getImageData(0, 0, width, height);
  const srcPixels = sourceData.data;

  // 2. Pre-calculate "Line Mask"
  // We determine which pixels in the SOURCE image are lines/shapes we want to keep.
  // This avoids re-calculating edge detection for every frame.
  const lineMask = new Uint8Array(width * height);
  
  const getIdx = (x: number, y: number) => (y * width + x) * 4;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = getIdx(x, y);
      let isLine = false;

      if (settings.detectionMode === 'edge') {
        // RGB Edge Detection
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

          const diffX = Math.abs(r - rx) + Math.abs(g - gx) + Math.abs(b - bx);
          const diffY = Math.abs(r - ry) + Math.abs(g - gy) + Math.abs(b - by);
          const totalDiff = diffX + diffY;

          const cutoff = Math.max(0, 500 - settings.threshold);
          isLine = totalDiff > cutoff;
        }
      } else {
        // Brightness Mode
        const r = srcPixels[idx];
        const g = srcPixels[idx + 1];
        const b = srcPixels[idx + 2];
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        isLine = luma < settings.threshold;
      }

      if (isLine) {
        lineMask[y * width + x] = 1;
      }
    }
  }

  // 3. Generate Frames using Backward Mapping
  const frames: ImageData[] = [];

  const hexToRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  };

  const lineRGB = hexToRgb(settings.lineColor);
  const bgRGB = hexToRgb(settings.bgColor);

  for (let f = 0; f < settings.frameCount; f++) {
    const newImageData = new ImageData(width, height);
    const dstPixels = newImageData.data;

    // Generate noise maps for this frame
    const mapX = createNoiseMap(width, height);
    const mapY = createNoiseMap(width, height);

    // Iterate over DESTINATION pixels
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dstIdx = getIdx(x, y);

        // Find which source pixel lands here (Inverse Mapping)
        // src = dst - distortion
        // We add some per-pixel high-frequency noise here too
        const noiseValX = mapX[y * width + x];
        const noiseValY = mapY[y * width + x];
        
        const hfJitterX = (Math.random() - 0.5) * 0.3; // Small micro-jitter
        const hfJitterY = (Math.random() - 0.5) * 0.3;

        // The displacement vector
        const dx = (noiseValX * settings.jitterAmount) + (hfJitterX * settings.jitterAmount);
        const dy = (noiseValY * settings.jitterAmount) + (hfJitterY * settings.jitterAmount);

        // Look backwards
        const srcX = Math.round(x - dx);
        const srcY = Math.round(y - dy);

        let pixelFound = false;

        // Check bounds
        if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
           const srcMaskIdx = srcY * width + srcX;
           
           if (lineMask[srcMaskIdx] === 1) {
             pixelFound = true;
             
             // Get color from Source
             const srcPixelIdx = (srcY * width + srcX) * 4;
             
             if (settings.useOriginalColors) {
               dstPixels[dstIdx] = srcPixels[srcPixelIdx];
               dstPixels[dstIdx+1] = srcPixels[srcPixelIdx+1];
               dstPixels[dstIdx+2] = srcPixels[srcPixelIdx+2];
               dstPixels[dstIdx+3] = 255;
             } else {
               dstPixels[dstIdx] = lineRGB.r;
               dstPixels[dstIdx+1] = lineRGB.g;
               dstPixels[dstIdx+2] = lineRGB.b;
               dstPixels[dstIdx+3] = 255;
             }
           }
        }

        // Background fallback
        if (!pixelFound) {
          dstPixels[dstIdx] = bgRGB.r;
          dstPixels[dstIdx+1] = bgRGB.g;
          dstPixels[dstIdx+2] = bgRGB.b;
          dstPixels[dstIdx+3] = 255;
        }
      }
    }
    frames.push(newImageData);
  }

  return frames;
};
