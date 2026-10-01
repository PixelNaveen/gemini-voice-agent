import React, { useId, useState } from 'react';
import {
  Sparkles,
  Activity,
  Wrench,
  Building2,
  Shield,
  Coffee,
  PhoneCall,
  X,
  ChevronRight,
  Play,
  CheckCircle2,
  Lock,
  Unlock,
} from 'lucide-react';
import { IndustryPreset, INDUSTRY_PRESETS } from '../types';
import { useModalDialog } from './useModalDialog';

interface IndustrySelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPreset: IndustryPreset;
  onSelectPreset: (preset: IndustryPreset) => void;
  onConfirmStartSession?: (preset: IndustryPreset) => void;
  isPersonaLocked?: boolean;
  lockedPersonaId?: string | null;
  onUnlockPersona?: () => void;
}

const FALLBACK_ICON = <Sparkles className="w-5 h-5 text-amber-400" />;

/**
 * Keyed by the exact `iconName` strings `mapToIndustryPreset` emits for the registered
 * personas. These two lists live in different files, so they drifted once already and
 * every niche silently rendered the fallback; the guard below is derived from the preset
 * data rather than from a third hand-written list.
 */
const ICON_MAP: Record<string, React.ReactNode> = {
  Sparkles: <Sparkles className="w-5 h-5 text-amber-400" />,
  Activity: <Activity className="w-5 h-5 text-cyan-400" />,
  Wrench: <Wrench className="w-5 h-5 text-orange-400" />,
  Building: <Building2 className="w-5 h-5 text-emerald-400" />,
  Shield: <Shield className="w-5 h-5 text-indigo-400" />,
  Coffee: <Coffee className="w-5 h-5 text-rose-400" />,
  PhoneCall: <PhoneCall className="w-5 h-5 text-yellow-400" />,
};

if (import.meta.env.DEV) {
  const unmapped = INDUSTRY_PRESETS.filter((preset) => !(preset.iconName in ICON_MAP)).map(
    (preset) => preset.iconName
  );
  if (unmapped.length > 0) {
    console.warn('[IndustrySelectorModal] ICON_MAP is missing a glyph for:', [...new Set(unmapped)].join(', '));
  }
}

export const IndustrySelectorModal: React.FC<IndustrySelectorModalProps> = ({
  isOpen,
  onClose,
  selectedPreset,
  onSelectPreset,
  onConfirmStartSession,
  isPersonaLocked = false,
  lockedPersonaId = null,
  onUnlockPersona,
}) => {
  const [activeTab, setActiveTab] = useState<IndustryPreset>(selectedPreset);
  const titleId = useId();
  const dialogRef = useModalDialog<HTMLDivElement>(isOpen, onClose);

  if (!isOpen) return null;

  const handleLaunch = () => {
    onSelectPreset(activeTab);
    onClose();
  };

  const handleSelectCard = (preset: IndustryPreset) => {
    setActiveTab(preset);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative w-full max-w-3xl bg-stone-900 border border-amber-500/30 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-stone-800 flex items-center justify-between bg-stone-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-yellow-500/10 border border-amber-500/30 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 id={titleId} className="text-lg font-bold text-stone-100 flex items-center gap-2">
                Select An Industry Persona
                <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  Isolated Persona Lock
                </span>
              </h2>
              <p className="text-xs text-stone-400">
                Selecting a persona locks the AI agent exclusively to that niche, completely eliminating memory bleed.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-stone-800/60 text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lock Status Notification Banner */}
        {isPersonaLocked && (
          <div className="mx-6 mt-4 p-3 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200 flex items-center justify-between gap-3 shadow-inner">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Persona Lock Active:</strong> Agent is locked to{' '}
                <span className="font-bold text-amber-300">{selectedPreset.businessName}</span>. Selecting another niche will execute a hard reset.
              </span>
            </div>
            {onUnlockPersona && (
              <button
                onClick={() => {
                  onUnlockPersona();
                }}
                className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-semibold text-[11px] shrink-0 transition-colors cursor-pointer"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>Unlock All</span>
              </button>
            )}
          </div>
        )}

        {/* Industry Grid */}
        <div className="p-6 overflow-y-auto space-y-3 custom-scrollbar flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {INDUSTRY_PRESETS.map((preset) => {
              const isSelected = activeTab.id === preset.id;
              const isCurrentlyLocked = lockedPersonaId === preset.id;
              const isOtherLocked = isPersonaLocked && !isCurrentlyLocked;

              return (
                <div
                  key={preset.id}
                  onClick={() => handleSelectCard(preset)}
                  className={`relative p-4 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-amber-950/30 border-amber-500/70 shadow-[0_0_20px_rgba(245,158,11,0.15)] ring-1 ring-amber-500/50'
                      : isOtherLocked
                      ? 'bg-stone-950/40 border-stone-800/60 opacity-70 hover:opacity-100 hover:border-amber-500/40'
                      : 'bg-stone-950/50 border-stone-800/80 hover:border-stone-700 hover:bg-stone-900/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-stone-900 border border-stone-800">
                        {ICON_MAP[preset.iconName] ?? FALLBACK_ICON}
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-stone-100 flex items-center gap-2">
                          {preset.name}
                        </h3>
                        <p className="text-xs text-amber-400/90 font-medium">{preset.businessName}</p>
                      </div>
                    </div>

                    {isCurrentlyLocked ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                        <Lock className="w-3 h-3" />
                        LOCKED
                      </span>
                    ) : isSelected ? (
                      <CheckCircle2 className="w-5 h-5 text-amber-400 shrink-0" />
                    ) : (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-stone-800/80 text-stone-400 border border-stone-700/50 shrink-0">
                        {preset.badge}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-stone-400 line-clamp-2 mb-3">
                    {preset.description}
                  </p>

                  <div className="pt-2 border-t border-stone-800/60 flex items-center justify-between text-[11px] text-stone-400">
                    <span className="truncate italic max-w-[85%] text-stone-500">
                      "{preset.sampleQueries[0]}"
                    </span>
                    <ChevronRight className={`w-3.5 h-3.5 ${isSelected ? 'text-amber-400' : 'text-stone-600'}`} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-stone-800 bg-stone-950/80 flex items-center justify-between gap-4">
          <div className="text-xs text-stone-400">
            Selected Persona:{' '}
            <span className="text-amber-300 font-bold">{activeTab.businessName}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-stone-800 text-stone-300 text-xs font-semibold hover:bg-stone-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleLaunch}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider text-stone-950 bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 fill-stone-950" />
              <span>Lock Persona & Start Call</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
