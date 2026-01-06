export interface ProcessingSettings {
  threshold: number;      // 0-500, sensitivity
  jitterAmount: number;   // 0-10, pixel displacement
  jitterSpeed: number;    // ms per frame
  frameCount: number;     // Number of unique jitter frames to loop
  lineColor: string;      // Hex color (used if useOriginalColors is false)
  bgColor: string;        // Hex color
  scale: number;          // Output scale
  useOriginalColors: boolean; // Whether to use the pixel's original color
  detectionMode: 'brightness' | 'edge'; // Algorithm for finding lines
}

export enum AppStatus {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  EXPORTING = 'EXPORTING',
  ERROR = 'ERROR'
}

// Minimal definition for the global GIF library loaded via CDN
export interface GIFOptions {
  workers?: number;
  quality?: number;
  width?: number;
  height?: number;
  workerScript?: string;
  background?: string;
  repeat?: number; // 0 for loop
}

export interface GIFInstance {
  addFrame: (element: HTMLCanvasElement | ImageData, options?: { delay?: number; copy?: boolean }) => void;
  on: (event: 'finished' | 'progress', callback: (data: any) => void) => void;
  render: () => void;
}

declare global {
  interface Window {
    GIF: new (options: GIFOptions) => GIFInstance;
  }
}