import React, { useId, useState } from 'react';
import { MemoryFact, TranscriptItem } from '../types';
import { X, Brain, Plus, Trash2, ShieldCheck, Sparkles, Clock, FileText, Check } from 'lucide-react';
import { useModalDialog } from './useModalDialog';

interface SessionMemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  memoryFacts: MemoryFact[];
  transcripts: TranscriptItem[];
  onAddFact: (content: string, category: 'preference' | 'fact' | 'summary' | 'custom') => void;
  onDeleteFact: (id: string) => void;
  onClearAllMemory: () => void;
}

export const SessionMemoryModal: React.FC<SessionMemoryModalProps> = ({
  isOpen,
  onClose,
  memoryFacts,
  transcripts,
  onAddFact,
  onDeleteFact,
  onClearAllMemory,
}) => {
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<'preference' | 'fact' | 'summary' | 'custom'>('fact');
  const [copiedMemory, setCopiedMemory] = useState(false);
  const titleId = useId();
  const dialogRef = useModalDialog<HTMLDivElement>(isOpen, onClose);

  if (!isOpen) return null;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    onAddFact(newContent.trim(), newCategory);
    setNewContent('');
  };

  const compiledMemoryText = [
    `=== AURA PERSISTENT SESSION MEMORY ===`,
    `Total Learned Facts: ${memoryFacts.length}`,
    `Total Conversation Turns Saved: ${transcripts.length}`,
    ``,
    `LEARNED FACTS & PREFERENCES:`,
    ...memoryFacts.map((f) => `• [${f.category.toUpperCase()}] ${f.content}`),
    ``,
    `RECENT CONVERSATION CONTEXT:`,
    ...transcripts.slice(-10).map((t) => `• ${t.speaker.toUpperCase()}: ${t.text}`),
  ].join('\n');

  const handleCopy = () => {
    navigator.clipboard.writeText(compiledMemoryText);
    setCopiedMemory(true);
    setTimeout(() => setCopiedMemory(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-2xl bg-stone-950 border border-amber-500/30 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-fadeIn"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-amber-500/20 bg-stone-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h2 id={titleId} className="text-base font-bold tracking-wide uppercase font-mono text-amber-100 flex items-center gap-2">
                Session Memory Inspector
              </h2>
              <p className="text-[11px] text-stone-400 font-mono">
                Persistent context automatically injected into Gemini 3.8 Live calls
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

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm text-stone-300 scrollbar-thin scrollbar-thumb-amber-500/20">
          {/* Add New Memory Note Form */}
          <form onSubmit={handleAdd} className="p-4 rounded-2xl bg-stone-900/80 border border-amber-500/20 space-y-3">
            <label className="text-xs font-mono font-bold uppercase text-amber-300 flex items-center gap-2">
              <Plus className="w-4 h-4 text-amber-400" />
              <span>Add Custom Memory Note / User Preference</span>
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as any)}
                className="bg-stone-950 border border-stone-800 text-xs text-amber-200 rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500/50"
              >
                <option value="fact">Fact</option>
                <option value="preference">Preference</option>
                <option value="summary">Summary</option>
                <option value="custom">Custom Note</option>
              </select>
              <input
                type="text"
                placeholder="e.g., User's name is Alex, prefers technical jargon..."
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                className="flex-1 bg-stone-950 border border-stone-800 text-xs text-stone-100 placeholder-stone-500 rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500/50"
              />
              <button
                type="submit"
                disabled={!newContent.trim()}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs uppercase tracking-wider rounded-xl transition-all disabled:opacity-40 shadow-md shadow-amber-500/20 cursor-pointer disabled:cursor-not-allowed"
              >
                Save Note
              </button>
            </div>
          </form>

          {/* Remembered Memory Facts List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-mono font-bold uppercase text-stone-300 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Remembered Facts ({memoryFacts.length})</span>
              </h3>
              {memoryFacts.length > 0 && (
                <button
                  onClick={onClearAllMemory}
                  className="text-[11px] font-mono text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Reset All Memory</span>
                </button>
              )}
            </div>

            {memoryFacts.length === 0 ? (
              <div className="p-4 rounded-2xl bg-stone-900/40 border border-stone-800 text-center text-xs text-stone-500 font-mono">
                No custom memory notes added yet. Add a note above or talk to AURA to build session memory.
              </div>
            ) : (
              <div className="space-y-2">
                {memoryFacts.map((fact) => (
                  <div
                    key={fact.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-stone-900/90 border border-stone-800 hover:border-amber-500/30 transition-all text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {fact.category}
                      </span>
                      <span className="text-stone-200">{fact.content}</span>
                    </div>
                    <button
                      onClick={() => onDeleteFact(fact.id)}
                      className="text-stone-500 hover:text-red-400 p-1 transition-colors"
                      title="Delete Fact"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Compiled Context Memory Prompt Preview */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-mono font-bold uppercase text-stone-300 flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-400" />
                <span>Active Live Memory Context Payload</span>
              </h3>
              <button
                onClick={handleCopy}
                className="text-xs font-mono text-amber-300 hover:text-amber-200 flex items-center gap-1"
              >
                {copiedMemory ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : null}
                <span>{copiedMemory ? 'Copied Payload!' : 'Copy Context Payload'}</span>
              </button>
            </div>
            <pre className="p-3.5 rounded-2xl bg-stone-950 border border-stone-800 text-[11px] font-mono text-stone-400 max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed">
              {compiledMemoryText}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-amber-500/20 bg-stone-900/90 text-xs font-mono text-stone-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>SESSION MEMORY ACTIVE • PERSISTENT IN BROWSER</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
