import React, { useEffect, useId, useState } from 'react';
import { VoiceOption, AVAILABLE_VOICES, INDUSTRY_PRESETS, IndustryPreset } from '../types';
import { X, Bot, Mic, Sparkles, Sliders, Building2, Zap } from 'lucide-react';
import { useModalDialog } from './useModalDialog';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedVoice: VoiceOption;
  onSelectVoice: (voice: VoiceOption) => void;
  /** Seed text for the editor. Not a prompt - the server assembles the real instruction. */
  instructionEditorSeed: string;
  onSaveSystemInstruction: (newInstruction: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  selectedVoice,
  onSelectVoice,
  instructionEditorSeed,
  onSaveSystemInstruction,
}) => {
  const [instructionText, setInstructionText] = useState(instructionEditorSeed);
  const [activePresetId, setActivePresetId] = useState<string>('universal');
  const titleId = useId();
  const dialogRef = useModalDialog<HTMLDivElement>(isOpen, onClose);

  // F-07: the editor must reflect the current value, not whatever it saw on first mount.
  //
  // `useState(instructionEditorSeed)` seeds once, so a persona change or a reset performed while
  // the modal was closed left the textarea showing a stale prompt. Saving from that stale
  // text silently reverted the operator's real setting, which is the same class of defect as
  // the shadowed variable this finding originally described: a control that looks live but
  // discards the truth.
  useEffect(() => {
    setInstructionText(instructionEditorSeed);
  }, [instructionEditorSeed]);

  if (!isOpen) return null;

  const handleApplyPreset = (preset: IndustryPreset) => {
    setActivePresetId(preset.id);
    setInstructionText(preset.systemPrompt);
  };

  const handleSave = () => {
    // F-07: a persona prompt edit is meaningless if it is discarded silently. Report the
    // outcome rather than closing as though it succeeded, so a failure is visible.
    try {
      onSaveSystemInstruction(instructionText);
      onClose();
    } catch (err: any) {
      console.error('[SettingsModal] Could not apply the instruction override:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-2xl bg-stone-950 border border-amber-500/30 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-fadeIn"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-amber-500/20 bg-stone-900/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 id={titleId} className="text-base font-bold tracking-wide uppercase font-mono text-amber-100">
                Receptionist Training & Engine Config
              </h2>
              <p className="text-[11px] text-stone-400 font-mono">
                Ultra-fast speech latency & industry-ready AI receptionist presets
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-100 rounded-xl hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm text-stone-300 scrollbar-thin scrollbar-thumb-amber-500/20">
          {/* Industry Preset Selector */}
          <div>
            <label className="flex items-center gap-2 text-xs font-mono font-bold uppercase text-amber-300 mb-2">
              <Building2 className="w-4 h-4 text-amber-400" />
              <span>Industry-Ready AI Receptionist Templates</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {INDUSTRY_PRESETS.map((preset) => {
                const isSelected = activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => handleApplyPreset(preset)}
                    className={`flex flex-col text-left p-3 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-500 text-amber-100 shadow-md shadow-amber-500/10'
                        : 'bg-stone-900/60 border-stone-800 text-stone-300 hover:border-amber-500/30'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="font-bold text-xs text-amber-200">{preset.name}</span>
                      {isSelected && (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500 text-stone-950">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-stone-400 leading-snug">{preset.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Voice Selection */}
          <div>
            <label className="flex items-center gap-2 text-xs font-mono font-bold uppercase text-amber-300 mb-2">
              <Mic className="w-4 h-4 text-amber-400" />
              <span>Voice Engine Persona (Gemini 3.8 Live)</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {AVAILABLE_VOICES.map((v) => {
                const isSelected = v.id === selectedVoice.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => onSelectVoice(v)}
                    className={`flex flex-col text-left p-3 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-500 text-amber-100 shadow-md shadow-amber-500/10'
                        : 'bg-stone-900/60 border-stone-800 text-stone-300 hover:border-amber-500/30'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="font-bold text-xs text-stone-100">{v.name}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                        {v.gender}
                      </span>
                    </div>
                    <p className="text-[11px] text-stone-400 leading-snug">{v.description}</p>
                    <span className="text-[10px] font-mono text-amber-400/90 mt-1.5 flex items-center gap-1">
                      <Zap className="w-3 h-3 text-amber-400" />
                      Speed: {v.speed}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* System Instructions Prompt */}
          <div>
            <label className="flex items-center gap-2 text-xs font-mono font-bold uppercase text-amber-300 mb-2">
              <Bot className="w-4 h-4 text-amber-400" />
              <span>Active Receptionist Persona Prompt</span>
            </label>
            <textarea
              rows={4}
              value={instructionText}
              onChange={(e) => setInstructionText(e.target.value)}
              placeholder="Specify custom receptionist instructions..."
              className="w-full p-3.5 bg-stone-900 border border-stone-800 rounded-2xl text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500/50 font-mono transition-colors"
            />
          </div>

          {/* Ultra-Fast Speed Optimization Specs */}
          <div className="p-4 rounded-2xl bg-stone-900/80 border border-amber-500/15 text-xs space-y-1.5 font-mono text-stone-400">
            <div className="flex items-center justify-between text-stone-300">
              <span>Speech Engine Model:</span>
              <span className="text-amber-300 font-bold">models/gemini-3.8-live</span>
            </div>
            <div className="flex items-center justify-between text-stone-300">
              <span>Primary Voice:</span>
              <span className="text-emerald-400 font-bold">Kore (American Female • Ultra-Fast)</span>
            </div>
            <div className="flex items-center justify-between text-stone-300">
              <span>Audio Frame Buffer:</span>
              <span className="text-emerald-400 font-bold">2048 Samples (~128ms Low Latency)</span>
            </div>
            <div className="flex items-center justify-between text-stone-300">
              <span>Turn Conciseness Rule:</span>
              <span className="text-amber-300">1 to 2 sentences max • Zero filler phrases</span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-amber-500/20 bg-stone-900/80">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-stone-400 hover:text-stone-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-amber-500 text-stone-950 hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Apply & Save</span>
          </button>
        </div>
      </div>
    </div>
  );
};
