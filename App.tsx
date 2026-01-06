import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI } from "@google/genai";
import Controls from './components/Controls';
import Button from './components/Button';
import { loadImage, setupCanvas, generateJitterFrames } from './utils/imageProcessing';
import { DEFAULT_SETTINGS, GIF_WORKER_URL } from './constants';
import { ProcessingSettings, AppStatus } from './types';
import { translations, Language } from './utils/translations';

// Icons
const UploadIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);

const SparklesIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

const GlobeIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const App: React.FC = () => {
  // State
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [settings, setSettings] = useState<ProcessingSettings>(DEFAULT_SETTINGS);
  const [generatedFrames, setGeneratedFrames] = useState<ImageData[]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [lang, setLang] = useState<Language>('zh');
  const [workerBlobUrl, setWorkerBlobUrl] = useState<string | null>(null);

  const t = translations[lang];

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const animationReqRef = useRef<number>();
  const originalImageRef = useRef<HTMLImageElement | null>(null);
  const loadedSrcRef = useRef<string | null>(null); // Track loaded src to avoid re-decoding

  // --- Initialization ---
  
  // Load the GIF worker script from CDN and create a Blob URL
  // This avoids "SecurityError" when trying to load a cross-origin worker directly
  useEffect(() => {
    const loadWorker = async () => {
      try {
        const response = await fetch(GIF_WORKER_URL);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setWorkerBlobUrl(url);
      } catch (error) {
        console.error("Failed to load GIF worker script:", error);
      }
    };
    loadWorker();

    return () => {
      if (workerBlobUrl) URL.revokeObjectURL(workerBlobUrl);
    };
  }, []); // Only run once

  // --- Handlers ---

  // Handle file upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImageSrc(url);
      setDownloadUrl(null);
    }
  };

  // Generate Sample via Gemini
  const handleGenerateSample = async () => {
    if (!process.env.API_KEY) {
      alert(t.apiKeyAlert);
      return;
    }

    try {
      setIsAiLoading(true);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      // Use standard image generation model
      const model = 'gemini-2.5-flash-image'; 
      
      const response = await ai.models.generateContent({
        model,
        contents: {
          parts: [{ text: t.prompt }]
        }
      });

      // Extract image
      let foundImage = false;
      const candidates = response.candidates;
      if (candidates && candidates.length > 0) {
        for (const part of candidates[0].content.parts) {
          if (part.inlineData && part.inlineData.data) {
             const base64 = part.inlineData.data;
             const mimeType = part.inlineData.mimeType || 'image/png';
             setImageSrc(`data:${mimeType};base64,${base64}`);
             setDownloadUrl(null);
             foundImage = true;
             break;
          }
        }
      }
      
      if (!foundImage) {
        alert(t.geminiError);
      }

    } catch (error) {
      console.error(error);
      alert(t.generalError);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleUpdateSettings = useCallback((newSettings: Partial<ProcessingSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  const toggleLanguage = () => {
    setLang(prev => prev === 'en' ? 'zh' : 'en');
  };

  // --- Core Logic: Process Image & Animation Loop ---

  // 1. When Image or Settings change, regenerate frames
  useEffect(() => {
    let isMounted = true;
    
    const process = async () => {
      if (!imageSrc || !canvasRef.current) return;
      
      if (isMounted) setStatus(AppStatus.PROCESSING);
      try {
        // Only load image if source actually changed
        if (loadedSrcRef.current !== imageSrc) {
           originalImageRef.current = await loadImage(imageSrc);
           loadedSrcRef.current = imageSrc;
        }
        
        const img = originalImageRef.current;
        const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
        
        if (!ctx || !img) return;

        // Resize canvas
        const dimensions = setupCanvas(canvasRef.current, img, settings.scale);
        
        // Generate Frames
        const frames = generateJitterFrames(
          ctx, 
          img, 
          dimensions.width, 
          dimensions.height, 
          settings
        );
        
        if (isMounted) {
          setGeneratedFrames(frames);
          setStatus(AppStatus.IDLE);
        }
      } catch (err) {
        console.error(err);
        if (isMounted) setStatus(AppStatus.ERROR);
      }
    };

    process();

    return () => {
      isMounted = false;
    };
  }, [
    imageSrc, 
    settings.threshold, 
    settings.jitterAmount, 
    settings.frameCount, 
    settings.lineColor, 
    settings.bgColor, 
    settings.scale,
    settings.detectionMode,
    settings.useOriginalColors,
    settings.jitterSpeed // Although jitterSpeed affects animation, regenerating frames isn't strictly necessary unless we burn it in. But let's keep it consistent.
  ]);

  // 2. Animation Loop
  useEffect(() => {
    if (generatedFrames.length === 0 || !canvasRef.current) return;

    let frameIndex = 0;
    let lastTime = 0;
    const ctx = canvasRef.current.getContext('2d');
    let animationId: number;

    const animate = (time: number) => {
      if (!ctx) return;

      if (time - lastTime > settings.jitterSpeed) {
        ctx.putImageData(generatedFrames[frameIndex], 0, 0);
        frameIndex = (frameIndex + 1) % generatedFrames.length;
        lastTime = time;
      }
      
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [generatedFrames, settings.jitterSpeed]);


  // --- Export Logic ---

  const handleExport = async () => {
    if (generatedFrames.length === 0 || !canvasRef.current) return;

    setStatus(AppStatus.EXPORTING);
    setDownloadUrl(null);

    // Ensure gif.js is loaded
    if (!window.GIF) {
      alert(t.gifLibError);
      setStatus(AppStatus.IDLE);
      return;
    }
    
    // Ensure worker is loaded
    if (!workerBlobUrl) {
      alert("Worker script not loaded yet. Please wait a moment and try again.");
      setStatus(AppStatus.IDLE);
      return;
    }

    const gif = new window.GIF({
      workers: 2,
      quality: 10,
      width: generatedFrames[0].width,
      height: generatedFrames[0].height,
      workerScript: workerBlobUrl,
      background: settings.bgColor
    });

    // Add frames to GIF
    generatedFrames.forEach(frame => {
      gif.addFrame(frame, { delay: settings.jitterSpeed });
    });

    gif.on('finished', (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setStatus(AppStatus.IDLE);
    });

    gif.render();
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen w-full bg-[#09090b] text-gray-100 overflow-hidden">
      
      {/* Sidebar Controls */}
      <Controls 
        settings={settings}
        updateSettings={handleUpdateSettings}
        onGenerate={() => {}} // Not used directly in sidebar anymore
        onExport={handleExport}
        isGenerating={status === AppStatus.PROCESSING}
        isExporting={status === AppStatus.EXPORTING}
        hasImage={!!imageSrc}
        t={t}
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative h-full">
        
        {/* Header / Top Bar */}
        <header className="h-16 border-b border-gray-800 flex items-center justify-between px-6 bg-[#09090b]/90 backdrop-blur z-10">
          <div className="flex items-center">
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center mr-6">
              <span className="text-indigo-500 mr-2">✦</span> {t.appTitle}
            </h1>
            
            <button 
              onClick={toggleLanguage}
              className="flex items-center space-x-1 text-xs font-medium text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-full transition-colors"
            >
              <GlobeIcon />
              <span>{lang === 'en' ? 'EN / 中文' : '中文 / EN'}</span>
            </button>
          </div>
          
          <div className="flex items-center space-x-3">
             {downloadUrl && (
              <a 
                href={downloadUrl} 
                download="wiggle-export.gif"
                className="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-green-900/20"
              >
                {t.downloadGif}
              </a>
            )}
            
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="image/*" 
              className="hidden" 
            />
            
            <Button 
              variant="secondary" 
              onClick={() => fileInputRef.current?.click()}
              icon={<UploadIcon />}
            >
              {t.uploadImage}
            </Button>

            <Button
              variant="primary"
              onClick={handleGenerateSample}
              isLoading={isAiLoading}
              icon={<SparklesIcon />}
            >
              {t.generateSample}
            </Button>
          </div>
        </header>

        {/* Canvas Area */}
        <div className="flex-1 flex items-center justify-center p-8 bg-[#0c0c0e] overflow-auto relative">
          
          {!imageSrc && !isAiLoading && (
            <div className="text-center max-w-md">
              <div className="w-20 h-20 bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-6 text-gray-500">
                <UploadIcon />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">{t.startCreating}</h2>
              <p className="text-gray-400 mb-6">
                {t.introText}
              </p>
              <div className="flex justify-center gap-4">
                 <Button onClick={() => fileInputRef.current?.click()}>
                    {t.uploadSketch}
                 </Button>
                 <span className="text-gray-600 self-center">{t.or}</span>
                 <button 
                  onClick={handleGenerateSample}
                  className="text-indigo-400 hover:text-indigo-300 font-medium text-sm underline underline-offset-4"
                 >
                   {t.generateWithAi}
                 </button>
              </div>
            </div>
          )}

          {isAiLoading && (
            <div className="flex flex-col items-center animate-pulse">
               <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
               <p className="text-indigo-400 font-medium">{t.dreaming}</p>
            </div>
          )}

          <div className={`relative shadow-2xl rounded-sm overflow-hidden border border-gray-800 transition-opacity duration-300 ${imageSrc && !isAiLoading ? 'opacity-100' : 'opacity-0 hidden'}`}>
             <canvas ref={canvasRef} className="block max-w-full max-h-[80vh]" />
             
             {/* Status Overlay */}
             {status === AppStatus.EXPORTING && (
               <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center z-20">
                 <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin mb-3"></div>
                 <p className="text-white font-medium tracking-wide">{t.rendering}</p>
               </div>
             )}
          </div>
          
        </div>
      </main>
    </div>
  );
};

export default App;