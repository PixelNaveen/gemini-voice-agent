import React, { useState, useEffect } from 'react';
import { Sparkles, PhoneOff, Mic, MicOff, X, ArrowRight, ArrowLeft } from 'lucide-react';
import { useVoiceAgent } from '../../hooks/useVoiceAgent';
import { ALL_PERSONAS } from '../../personas';
import { IndustryPreset } from '../../types';
import { CustomVoiceGlobe } from './CustomVoiceGlobe';

interface LiveVoiceAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LiveVoiceAgentModal: React.FC<LiveVoiceAgentModalProps> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState<'selector' | 'call'>('selector');
  const [selectedPreset, setSelectedPreset] = useState<IndustryPreset>(ALL_PERSONAS[0]);

  const {
    status,
    audioLevel,
    startSession,
    endSession,
    isMicMuted,
    toggleMic,
    isAgentSpeaking,
    isListening,
    transcripts,
  } = useVoiceAgent();

  useEffect(() => {
    if (!isOpen) {
      setStep('selector');
      void endSession();
    }
  }, [isOpen]);

  const handleStartCall = () => {
    void startSession(selectedPreset);
    setStep('call');
  };

  const handleClose = () => {
    void endSession();
    onClose();
  };

  const handleBackToSelector = () => {
    void endSession();
    setStep('selector');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Semi-transparent Light Backdrop */}
      <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-md transition-opacity" onClick={handleClose} />
      
      {/* Premium Light Card Modal */}
      <div className="relative w-full max-w-md bg-white border border-stone-200/90 rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[590px] text-stone-900 animate-float-subtle">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-200/80 bg-[#FBF9F8]">
          <div className="flex items-center gap-2">
            {step === 'call' && (
              <button
                onClick={handleBackToSelector}
                className="p-1.5 -ml-1 text-stone-500 hover:text-stone-900 rounded-lg hover:bg-stone-200/60 transition-colors"
                title="Change Persona"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <h2 className="text-xs font-bold tracking-wider uppercase text-stone-900 font-mono">
              {step === 'selector' ? 'Select Business' : selectedPreset.businessName}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-200/60 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-stone-300">
          {step === 'selector' ? (
            <div className="flex flex-col gap-2.5">
              <p className="text-xs text-stone-500 mb-1">
                Choose an industry persona to start your live voice conversation:
              </p>
              {ALL_PERSONAS.map((preset: IndustryPreset) => {
                const isSelected = selectedPreset.id === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => setSelectedPreset(preset)}
                    className={`p-3 rounded-xl border transition-all text-left group cursor-pointer ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/80 ring-2 ring-emerald-500/20 shadow-sm'
                        : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <div className={`font-semibold text-sm transition-colors ${isSelected ? 'text-emerald-950' : 'text-stone-900'}`}>
                        {preset.businessName}
                      </div>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${isSelected ? 'bg-emerald-200/60 text-emerald-800' : 'bg-stone-100 text-stone-500'}`}>
                        {preset.badge}
                      </span>
                    </div>
                    <div className="text-xs text-stone-500 line-clamp-1">{preset.description}</div>
                  </button>
                );
              })}

              <div className="pt-3 sticky bottom-0 bg-white">
                <button
                  onClick={handleStartCall}
                  className="w-full py-3.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-emerald-700/20"
                >
                  Start Live Call with {selectedPreset.name} <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-between">
              {/* Exact Globe UI component with continuous transcript bubbles */}
              <div className="flex-1 w-full flex items-center justify-center">
                <CustomVoiceGlobe
                  status={status}
                  audioLevel={audioLevel}
                  isAgentSpeaking={isAgentSpeaking}
                  isListening={isListening}
                  isMicMuted={isMicMuted}
                  transcripts={transcripts}
                />
              </div>

              {/* Action Bar: Mute Mic & End Call */}
              <div className="w-full pt-3 grid grid-cols-2 gap-3 border-t border-stone-200/80 mt-2">
                <button
                  onClick={toggleMic}
                  className={`py-3 px-4 rounded-xl flex items-center justify-center transition-all font-medium text-xs gap-2 cursor-pointer ${
                    isMicMuted
                      ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                      : 'bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300'
                  }`}
                >
                  {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  <span>{isMicMuted ? 'Unmute Mic' : 'Mute Mic'}</span>
                </button>

                <button
                  onClick={handleClose}
                  className="py-3 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center justify-center transition-all gap-2 cursor-pointer shadow-sm"
                >
                  <PhoneOff className="w-4 h-4" />
                  <span>End Call</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
