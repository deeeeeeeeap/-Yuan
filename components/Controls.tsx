import React from 'react';
import { ProcessingSettings } from '../types';
import { translations } from '../utils/translations';

interface ControlsProps {
  settings: ProcessingSettings;
  updateSettings: (s: Partial<ProcessingSettings>) => void;
  onGenerate: () => void;
  onExport: () => void;
  isGenerating: boolean;
  isExporting: boolean;
  hasImage: boolean;
  t: typeof translations.en;
}

const Slider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
}> = ({ label, value, min, max, step = 1, onChange }) => (
  <div className="mb-4">
    <div className="flex justify-between mb-1">
      <label className="text-xs font-medium text-gray-400">{label}</label>
      <span className="text-xs font-mono text-gray-500">{value}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
    />
  </div>
);

const ColorPicker: React.FC<{
  label: string;
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}> = ({ label, value, onChange, disabled }) => (
  <div className={`mb-4 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
    <label className="text-xs font-medium text-gray-400 block mb-1">{label}</label>
    <div className="flex items-center space-x-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-8 w-12 bg-transparent border-0 p-0 cursor-pointer"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="flex-1 bg-gray-800 border border-gray-700 text-xs rounded px-2 py-1 text-gray-300 font-mono"
      />
    </div>
  </div>
);

const Toggle: React.FC<{
  label: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <div className="mb-4 flex items-center justify-between">
    <label className="text-xs font-medium text-gray-400">{label}</label>
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
        checked ? 'bg-indigo-600' : 'bg-gray-700'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  </div>
);

const Select: React.FC<{
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (val: string) => void;
}> = ({ label, value, options, onChange }) => (
  <div className="mb-4">
    <label className="text-xs font-medium text-gray-400 block mb-1">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-2 py-2 focus:outline-none focus:border-indigo-500"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  </div>
);

const Controls: React.FC<ControlsProps> = ({
  settings,
  updateSettings,
  isExporting,
  hasImage,
  onExport,
  t
}) => {
  return (
    <div className="w-full lg:w-80 bg-gray-900 border-l border-gray-800 p-6 flex flex-col h-full overflow-y-auto">
      <h2 className="text-lg font-bold text-white mb-6 flex items-center">
        <span className="bg-indigo-600 w-2 h-6 rounded mr-3"></span>
        {t.settings}
      </h2>

      <div className="space-y-6 flex-1">
        {/* Line Extraction Section */}
        <section>
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4 border-b border-gray-800 pb-2">
            {t.extraction}
          </h3>
          <Select 
             label={t.detectionMode}
             value={settings.detectionMode}
             options={[
               { label: t.modeBrightness, value: 'brightness' },
               { label: t.modeEdge, value: 'edge' },
             ]}
             onChange={(v) => updateSettings({ detectionMode: v as 'brightness' | 'edge' })}
          />
          <Slider
            label={t.threshold}
            value={settings.threshold}
            min={0}
            max={500}
            onChange={(v) => updateSettings({ threshold: v })}
          />
        </section>

        {/* Animation Section */}
        <section>
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4 border-b border-gray-800 pb-2">
            {t.animation}
          </h3>
          <Slider
            label={t.jitterAmount}
            value={settings.jitterAmount}
            min={0}
            max={10}
            step={0.5}
            onChange={(v) => updateSettings({ jitterAmount: v })}
          />
          <Slider
            label={t.speed}
            value={settings.jitterSpeed}
            min={50}
            max={500}
            step={10}
            onChange={(v) => updateSettings({ jitterSpeed: v })}
          />
           <Slider
            label={t.uniqueFrames}
            value={settings.frameCount}
            min={2}
            max={8}
            onChange={(v) => updateSettings({ frameCount: v })}
          />
        </section>

        {/* Style Section */}
        <section>
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4 border-b border-gray-800 pb-2">
            {t.style}
          </h3>
          <Toggle 
             label={t.useOriginalColors}
             checked={settings.useOriginalColors}
             onChange={(v) => updateSettings({ useOriginalColors: v })}
          />
          <ColorPicker 
            label={t.lineColor} 
            value={settings.lineColor} 
            onChange={(v) => updateSettings({ lineColor: v })} 
            disabled={settings.useOriginalColors}
          />
          <ColorPicker 
            label={t.bgColor} 
            value={settings.bgColor} 
            onChange={(v) => updateSettings({ bgColor: v })} 
          />
        </section>
      </div>

      <div className="mt-8 pt-6 border-t border-gray-800">
        <button
          onClick={onExport}
          disabled={!hasImage || isExporting}
          className={`w-full py-3 px-4 rounded-lg font-bold text-sm uppercase tracking-wide transition-all shadow-lg 
            ${!hasImage || isExporting 
              ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/30'
            }`}
        >
          {isExporting ? t.generating : t.exportGif}
        </button>
      </div>
    </div>
  );
};

export default Controls;