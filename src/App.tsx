import React, { useState } from 'react';
import { useVoiceAgent } from './hooks/useVoiceAgent';
import { WaveBackground } from './components/WaveBackground';
import { HeaderNav } from './components/HeaderNav';
import { CentralVisualizer } from './components/CentralVisualizer';
import { LiveTranscript } from './components/LiveTranscript';
import { ControlPanel } from './components/ControlPanel';
import { SettingsModal } from './components/SettingsModal';
import { SessionMemoryModal } from './components/SessionMemoryModal';
import { IndustrySelectorModal } from './components/IndustrySelectorModal';
import { VisualizerMode } from './types';

export default function App() {
  const [visualizerMode, setVisualizerMode] = useState<VisualizerMode>('orb');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isIndustryModalOpen, setIsIndustryModalOpen] = useState(false);

  const {
    status,
    audioLevel,
    transcripts,
    memoryFacts,
    currentPreset,
    lockedPersonaId,
    isPersonaLocked,
    unlockPersona,
    selectPreset,
    remainingSeconds,
    selectedVoice,
    setSelectedVoice,
    speechSpeedRate,
    setSpeechSpeedRate,
    instructionEditorSeed,
    setSystemInstruction,
    isMicMuted,
    isAudioMuted,
    micError,
    apiError,
    isMemoryModalOpen,
    setIsMemoryModalOpen,
    addMemoryFact,
    deleteMemoryFact,
    clearAllMemory,
    retryMic,
    startSession,
    endSession,
    toggleMic,
    toggleAudioMute,
    interruptAgent,
    sendTextPrompt,
    clearTranscripts,
    isAgentSpeaking,
    isListening,
  } = useVoiceAgent();

  return (
    <div className="relative min-h-screen w-full bg-black text-slate-100 flex flex-col justify-between overflow-x-hidden font-['Plus_Jakarta_Sans',sans-serif] selection:bg-amber-500/30 selection:text-amber-200">
      {/* Dynamic Black and Gold Animated Wave Canvas */}
      <WaveBackground
        audioLevel={audioLevel}
        isAgentSpeaking={isAgentSpeaking}
        isListening={isListening}
      />

      {/* ElevenLabs Dynamic Top Bar */}
      <HeaderNav
        selectedVoice={selectedVoice}
        onSelectVoice={setSelectedVoice}
        speechSpeedRate={speechSpeedRate}
        onChangeSpeedRate={setSpeechSpeedRate}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenMemory={() => setIsMemoryModalOpen(true)}
        memoryCount={memoryFacts.length}
        isAudioMuted={isAudioMuted}
        onToggleAudioMute={toggleAudioMute}
        isConnected={status !== 'idle' && status !== 'error'}
      />

      {/* Main Experience Body */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-between px-4 py-4 max-w-5xl mx-auto w-full">
        {/* Central Dynamic Visualizer Orb / Equalizer */}
        <CentralVisualizer
          status={status}
          audioLevel={audioLevel}
          isAgentSpeaking={isAgentSpeaking}
          isListening={isListening}
          mode={visualizerMode}
          onModeChange={setVisualizerMode}
          voiceName={selectedVoice.name}
        />

        {/* ElevenLabs Control Hub & Quick Actions */}
        <ControlPanel
          status={status}
          isMicMuted={isMicMuted}
          micError={micError}
          apiError={apiError}
          remainingSeconds={remainingSeconds}
          currentPreset={currentPreset}
          isPersonaLocked={isPersonaLocked}
          onOpenIndustryModal={() => setIsIndustryModalOpen(true)}
          onRetryMic={retryMic}
          onToggleMic={toggleMic}
          onStartSession={() => setIsIndustryModalOpen(true)}
          onEndSession={endSession}
          onInterruptAgent={interruptAgent}
          onSendPresetPrompt={sendTextPrompt}
        />

        {/* Live Deduplicated Chronological Transcript Box Underneath */}
        <LiveTranscript
          transcripts={transcripts}
          isStreaming={isAgentSpeaking}
          onClear={clearTranscripts}
        />
      </main>

      {/* Footer Branding Bar */}
      <footer className="relative z-10 w-full py-3 px-6 text-center text-[11px] font-mono text-stone-500 border-t border-amber-500/10 bg-black/80 backdrop-blur-md">
        <span>AURA Multi-Industry Voice Agent • Powered by </span>
        <span className="text-amber-400 font-semibold">Gemini 3.8 Live API</span>
        <span> • Active Niche: </span>
        <span className="text-stone-300 font-bold">{currentPreset.businessName}</span>
      </footer>

      {/* Industry Persona Selector Modal */}
      <IndustrySelectorModal
        isOpen={isIndustryModalOpen}
        onClose={() => setIsIndustryModalOpen(false)}
        selectedPreset={currentPreset}
        onSelectPreset={selectPreset}
        isPersonaLocked={isPersonaLocked}
        lockedPersonaId={lockedPersonaId}
        onUnlockPersona={unlockPersona}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        selectedVoice={selectedVoice}
        onSelectVoice={setSelectedVoice}
        instructionEditorSeed={instructionEditorSeed}
        onSaveSystemInstruction={setSystemInstruction}
      />

      {/* Session Memory Inspector Modal */}
      <SessionMemoryModal
        isOpen={isMemoryModalOpen}
        onClose={() => setIsMemoryModalOpen(false)}
        memoryFacts={memoryFacts}
        transcripts={transcripts}
        onAddFact={addMemoryFact}
        onDeleteFact={deleteMemoryFact}
        onClearAllMemory={clearAllMemory}
      />
    </div>
  );
}
