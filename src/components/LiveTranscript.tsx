import React, { useState, useRef, useEffect } from 'react';
import { TranscriptItem } from '../types';
import { Search, Copy, Download, Trash2, ArrowDown, ShieldCheck, Check, Sparkles } from 'lucide-react';

interface LiveTranscriptProps {
  transcripts: TranscriptItem[];
  isStreaming: boolean;
  onClear: () => void;
}

export const LiveTranscript: React.FC<LiveTranscriptProps> = ({
  transcripts,
  isStreaming,
  onClear,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto scroll to bottom on new transcript entries if enabled
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcripts, autoScroll, isStreaming]);

  const filteredTranscripts = transcripts.filter((item) =>
    item.text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCopy = () => {
    if (transcripts.length === 0) return;
    const fullText = transcripts
      .map((t) => `[${t.timestamp}] ${t.speaker.toUpperCase()}: ${t.text}`)
      .join('\n\n');
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (transcripts.length === 0) return;
    const fullText = transcripts
      .map((t) => `[${t.timestamp}] ${t.speaker === 'user' ? 'USER' : 'AURA AGENT'}: ${t.text}`)
      .join('\n\n');
    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AURA_Live_Transcript_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="w-full max-w-3xl mx-auto z-10 flex flex-col bg-stone-950/90 border border-amber-500/25 rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden my-4">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-stone-900/90 border-b border-amber-500/15">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold tracking-wide uppercase font-mono text-amber-100">
            Live Chronological Transcript
          </h3>
          <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            English Only • Deduplicated
          </span>
        </div>

        {/* Action Tools */}
        <div className="flex items-center gap-1.5 ml-auto">
          {/* Search Box */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search transcript..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-500/50 w-32 sm:w-44 transition-colors"
            />
          </div>

          <button
            onClick={handleCopy}
            title="Copy Transcript"
            className="p-1.5 text-stone-400 hover:text-amber-200 bg-stone-950/80 hover:bg-stone-800 border border-stone-800 rounded-lg text-xs transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={handleDownload}
            title="Export Transcript as TXT"
            className="p-1.5 text-stone-400 hover:text-amber-200 bg-stone-950/80 hover:bg-stone-800 border border-stone-800 rounded-lg text-xs transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onClear}
            title="Clear Transcript"
            className="p-1.5 text-stone-400 hover:text-red-400 bg-stone-950/80 hover:bg-stone-800 border border-stone-800 rounded-lg text-xs transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Transcript Scrolling Box */}
      <div
        ref={scrollContainerRef}
        className="h-60 sm:h-72 overflow-y-auto p-4 sm:p-5 space-y-3.5 text-sm scrollbar-thin scrollbar-thumb-amber-500/20 scrollbar-track-stone-950"
      >
        {filteredTranscripts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-stone-500 font-mono text-xs space-y-2">
            <div className="w-10 h-10 rounded-full bg-amber-500/5 border border-amber-500/15 flex items-center justify-center text-amber-400/60 mb-1">
              <Sparkles className="w-5 h-5" />
            </div>
            <p>Transcript is empty. Tap <span className="text-amber-300 font-semibold">"Tap to Start"</span> to begin the conversation.</p>
            <p className="text-[11px] text-stone-600">
              The agent will speak first with "Hello, how can I help you today?".
            </p>
          </div>
        ) : (
          filteredTranscripts.map((item) => {
            const isUser = item.speaker === 'user';
            return (
              <div
                key={item.id}
                className={`flex flex-col space-y-1 transition-all duration-300 ${
                  isUser ? 'items-end' : 'items-start'
                }`}
              >
                {/* Speaker Tag & Time */}
                <div className="flex items-center gap-2 text-[11px] font-mono text-stone-400">
                  <span
                    className={`font-bold tracking-wider uppercase px-2 py-0.5 rounded text-[10px] ${
                      isUser
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    {isUser ? 'YOU' : 'AURA AGENT'}
                  </span>
                  <span>{item.timestamp}</span>
                </div>

                {/* Message Bubble */}
                <div
                  className={`max-w-[88%] sm:max-w-[80%] rounded-2xl px-4 py-2.5 leading-relaxed text-sm shadow-md font-['Plus_Jakarta_Sans',sans-serif] ${
                    isUser
                      ? 'bg-gradient-to-br from-amber-600/30 to-amber-900/40 text-amber-100 border border-amber-500/30 rounded-tr-xs'
                      : 'bg-stone-900/90 text-stone-100 border border-stone-800 rounded-tl-xs'
                  }`}
                >
                  {item.text}
                </div>
              </div>
            );
          })
        )}

        {/* Live Typing / Audio Stream Wave Indicator */}
        {isStreaming && (
          <div className="flex items-center gap-2 text-xs font-mono text-amber-400/90 pt-1">
            <span className="flex gap-1 items-center">
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" />
            </span>
            <span>AURA is speaking...</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Footer bar with auto-scroll toggle */}
      <div className="px-5 py-2 bg-stone-900/60 border-t border-amber-500/10 flex items-center justify-between text-[11px] font-mono text-stone-400">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>ENGLISH CHRONOLOGICAL FEED ACTIVE</span>
        </div>

        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors ${
            autoScroll
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : 'text-stone-400 hover:text-stone-200'
          }`}
        >
          <ArrowDown className="w-3 h-3" />
          <span>{autoScroll ? 'Auto-Scroll ON' : 'Auto-Scroll OFF'}</span>
        </button>
      </div>
    </div>
  );
};
