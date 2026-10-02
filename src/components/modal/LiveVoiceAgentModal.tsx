import React, { useState, useEffect } from 'react';
import { Sparkles, PhoneOff, Mic, MicOff, Settings, X, Repeat, ArrowRight } from 'lucide-react';
import { useVoiceAgent } from '../../hooks/useVoiceAgent';
import { ALL_PERSONAS } from '../../personas';
import { IndustryPreset, TranscriptItem } from '../../types';
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
    interruptAgent,
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={handleClose} />
      
      <div className="relative w-full max-w-2xl bg-stone-950 border border-amber-500/20 rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[600px]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h2 className="text-sm font-bold tracking-wider uppercase text-white font-mono">
              {step === 'selector' ? 'Select Business Persona' : `Aura Live Agent — ${selectedPreset.businessName}`}
            </h2>
          </div>
          <button onClick={handleClose} className="text-stone-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-stone-800">
          {step === 'selector' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {ALL_PERSONAS.map((preset: IndustryPreset) => (
                <button
                  key={preset.id}
                  onClick={() => setSelectedPreset(preset)}
                  className={`p-4 rounded-xl border-2 transition-all text-left group ${
                    selectedPreset.id === preset.id
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-stone-800 bg-stone-900 hover:border-stone-600'
                  }`}
                >
                  <div className="font-bold text-white mb-1 group-hover:text-emerald-300 transition-colors">{preset.businessName}</div>
                  <div className="text-xs text-stone-400 font-mono italic">{preset.badge}</div>
                </button>
              ))}
              <div className="col-span-full pt-4">
                <button
                  onClick={handleStartCall}
                  className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-lg shadow-emerald-900/30"
                >
                  Connect to {selectedPreset.businessName} <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-between">
              <CustomVoiceGlobe
                status={status}
                audioLevel={audioLevel}
                isAgentSpeaking={isAgentSpeaking}
                isListening={isListening}
                isMicMuted={isMicMuted}
              />
              
              <div className="w-full flex-1 mt-4 bg-stone-900 rounded-xl p-4 font-mono text-xs text-stone-300 overflow-y-auto space-y-2 max-h-48 border border-stone-800">
                {transcripts.length === 0 ? (
                  <div className="text-stone-500 italic text-center py-4">Waiting for voice input...</div>
                ) : (
                  transcripts.map((t: TranscriptItem, i: number) => (
                    <div key={i} className={t.speaker === 'user' ? 'text-blue-300' : 'text-emerald-300'}>
                      <span className="opacity-50 font-bold">{t.speaker === 'user' ? 'YOU' : 'AGENT'}: </span>
                      {t.text}
                    </div>
                  ))
                )}
              </div>

              <div className="w-full pt-4 grid grid-cols-3 gap-3">
                <button
                  onClick={toggleMic}
                  className={`p-3 rounded-xl flex items-center justify-center transition-colors font-mono text-xs gap-2 ${
                    isMicMuted ? 'bg-red-500/20 text-red-300 border border-red-500/40' : 'bg-stone-800 hover:bg-stone-700 text-stone-200'
                  }`}
                >
                  {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  <span>{isMicMuted ? 'Unmute' : 'Mute'}</span>
                </button>
                <button
                  onClick={interruptAgent}
                  className="p-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 flex items-center justify-center transition-colors font-mono text-xs gap-2"
                >
                  <Repeat className="w-4 h-4" />
                  <span>Interrupt</span>
                </button>
                <button
                  onClick={handleClose}
                  className="p-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold flex items-center justify-center transition-colors font-mono text-xs gap-2"
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
