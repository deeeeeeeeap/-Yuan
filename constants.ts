import { ProcessingSettings } from "./types";

// Default settings for the application
export const DEFAULT_SETTINGS: ProcessingSettings = {
  threshold: 350,          // Higher sensitivity by default (scale is now 0-500)
  jitterAmount: 3,         // Moderate jitter
  jitterSpeed: 120,        // Slightly slower for hand-drawn feel
  frameCount: 5,           // Enough unique frames for a good loop
  lineColor: '#000000',
  bgColor: '#ffffff',
  scale: 1,
  useOriginalColors: true,
  detectionMode: 'edge'    // Edge mode is more robust for colored lines
};

export const GIF_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js';