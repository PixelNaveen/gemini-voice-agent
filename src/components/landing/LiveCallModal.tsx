import React, { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Volume2, Sparkles, X, MessageSquare, Send } from 'lucide-react';
import confetti from 'canvas-confetti';

interface LiveCallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LiveCallModal: React.FC<LiveCallModalProps> = ({ isOpen, onClose }) => {
  const [callState, setCallState] = useState<'connecting' | 'connected' | 'ended'>('connecting');
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [transcript, setTranscript] = useState<{ sender: 'ai' | 'user'; text: string }[]>([]);

  const timerRef = useRef<number | null>(null);

  const initialGreeting =
    "Hello! Thank you for calling Aura Autonomous Concierge. I can coordinate appointments, answer protocol questions, and lock in reservations. What can I do for you today?";

  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.02;
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(
        (v) =>
          v.lang.startsWith('en') &&
          (v.name.includes('Samantha') || v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Karen'))
      );
      if (preferred) utterance.voice = preferred;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setCallState('connecting');
      setTimerSeconds(0);
      setTranscript([]);

      const connectTimer = setTimeout(() => {
        setCallState('connected');
        setTranscript([{ sender: 'ai', text: initialGreeting }]);
        speak(initialGreeting);
      }, 1200);

      return () => clearTimeout(connectTimer);
    } else {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [isOpen]);

  useEffect(() => {
    if (callState === 'connected') {
      timerRef.current = window.setInterval(() => {
        setTimerSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  if (!isOpen) return null;

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`;
  };

  const handleEndCall = () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setCallState('ended');
    setTimeout(() => {
      onClose();
    }, 1000);
  };

  const handleUserSpeak = (userText: string) => {
    if (!userText.trim()) return;

    const newTranscript = [...transcript, { sender: 'user' as const, text: userText }];
    setTranscript(newTranscript);
    setUserInput('');

    // AI dynamic conversational reply
    setTimeout(() => {
      let reply = '';
      const lower = userText.toLowerCase();

      if (lower.includes('appointment') || lower.includes('book') || lower.includes('schedule')) {
        reply =
          "I have openings available tomorrow at 10:30 AM or Thursday at 2:00 PM. Would either of those times fit your schedule?";
      } else if (lower.includes('price') || lower.includes('cost') || lower.includes('fee')) {
        reply =
          "Our standard sessions begin at $180, and we accept all major HSA/FSA cards. I can text our full price breakdown to your mobile immediately.";
      } else if (lower.includes('reschedule') || lower.includes('cancel')) {
        reply =
          "I'd be glad to help adjust that. I've placed a temporary hold on our schedule and updated your calendar link with zero penalty.";
      } else {
        reply =
          "Understood! I've logged that request into your profile and synced it with our staff. Is there anything else I can take care of for you today?";
      }

      setTranscript([...newTranscript, { sender: 'ai', text: reply }]);
      speak(reply);

      confetti({
        particleCount: 30,
        spread: 50,
        origin: { y: 0.7 },
      });
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div className="relative w-full max-w-lg bg-neutral-950 text-white rounded-3xl p-6 sm:p-8 border border-white/15 shadow-2xl space-y-6 max-h-[92vh] overflow-y-auto">
        {/* Close icon */}
        <button
          onClick={handleEndCall}
          className="absolute top-5 right-5 p-2 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Top Call Status */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-xs font-mono text-emerald-400">
            <span
              className={`w-2 h-2 rounded-full ${
                callState === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span>
              {callState === 'connecting'
                ? 'Establishing Secure Trunk...'
                : callState === 'connected'
                ? `Call Live · ${formatTimer(timerSeconds)}`
                : 'Call Disconnected'}
            </span>
          </div>

          <h3 className="text-2xl font-editorial font-normal text-white">
            Aura AI Receptionist
          </h3>
          <p className="text-xs font-mono text-neutral-400">
            Carrier DID: +1 (800) 492-AURA · HD Audio 48kHz
          </p>
        </div>

        {/* Dynamic Voice Visualizer Wave */}
        <div className="py-4 flex items-center justify-center gap-1.5 h-16">
          {[...Array(24)].map((_, i) => (
            <div
              key={i}
              className={`w-1 rounded-full bg-emerald-500 transition-all duration-150 ${
                isSpeaking
                  ? 'h-10 animate-pulse'
                  : callState === 'connected'
                  ? 'h-3 opacity-60'
                  : 'h-1.5 opacity-20'
              }`}
              style={{
                animationDelay: `${(i % 5) * 80}ms`,
                height: isSpeaking ? `${Math.sin(i * 0.5) * 20 + 24}px` : '8px',
              }}
            />
          ))}
        </div>

        {/* Live Conversation Transcript Feed */}
        <div className="max-h-56 overflow-y-auto space-y-3 p-3 rounded-2xl bg-neutral-900/80 border border-white/10 text-xs">
          {transcript.map((msg, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-xl ${
                msg.sender === 'ai'
                  ? 'bg-emerald-950/40 border border-emerald-500/20 text-neutral-200'
                  : 'bg-white/10 text-white ml-6'
              }`}
            >
              <div className="text-[10px] font-mono text-neutral-400 mb-1 flex items-center gap-1">
                {msg.sender === 'ai' ? (
                  <>
                    <Sparkles className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400 font-semibold">Aura Receptionist</span>
                  </>
                ) : (
                  <span>You (Caller)</span>
                )}
              </div>
              <p className="font-sans leading-relaxed">{msg.text}</p>
            </div>
          ))}
        </div>

        {/* Quick Suggestion Chips */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-mono text-neutral-400">
            Quick responses to speak:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              'I need to book a priority appointment.',
              'What are your service pricing options?',
              'Can I reschedule my appointment to Thursday?',
            ].map((phrase, i) => (
              <button
                key={i}
                onClick={() => handleUserSpeak(phrase)}
                className="px-2.5 py-1 text-[11px] rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-neutral-300 hover:text-white transition-colors text-left"
              >
                "{phrase}"
              </button>
            ))}
          </div>
        </div>

        {/* Interactive Speech / Text Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleUserSpeak(userInput);
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Type or reply here..."
            className="flex-1 px-4 py-2.5 rounded-full bg-neutral-900 border border-white/15 text-xs text-white placeholder:text-neutral-500 focus:outline-hidden focus:border-emerald-500"
          />
          <button
            type="submit"
            disabled={!userInput.trim()}
            className="p-2.5 rounded-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

        {/* Bottom Control Bar */}
        <div className="pt-2 border-t border-white/10 flex items-center justify-between">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-neutral-300 hover:text-white transition-colors"
            title={isMuted ? "Unmute microphone" : "Mute microphone"}
          >
            {isMuted ? <MicOff className="w-5 h-5 text-rose-400" /> : <Mic className="w-5 h-5" />}
          </button>

          <button
            onClick={handleEndCall}
            className="px-6 py-3 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shadow-lg"
          >
            <PhoneOff className="w-4 h-4" />
            <span>End Call</span>
          </button>

          <button
            onClick={() => speak(transcript[transcript.length - 1]?.text || initialGreeting)}
            className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-neutral-300 hover:text-white transition-colors"
            title="Replay Voice"
          >
            <Volume2 className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
