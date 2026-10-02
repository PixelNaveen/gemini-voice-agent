import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Volume2, Sparkles, CheckCircle2 } from 'lucide-react';
import { BlurText } from './motion/BlurText.tsx';
import { BorderBeam } from './motion/BorderBeam.tsx';

interface PresetDialogue {
  id: string;
  label: string;
  industry: string;
  callerPrompt: string;
  receptionistReply: string;
  bookingDetails: {
    service: string;
    scheduledTime: string;
    client: string;
    status: string;
  };
}

const SCENARIOS: PresetDialogue[] = [
  {
    id: 'reschedule',
    label: 'Medical Reschedule',
    industry: 'Healthcare',
    callerPrompt: "I'm stuck in traffic and won't make my 11:00 AM consultation with Dr. Vance. Can I push to this afternoon?",
    receptionistReply: "I completely understand traffic delays. Dr. Vance has an opening at 3:45 PM today, or tomorrow at 10:00 AM. Would 3:45 PM today work better for your schedule?",
    bookingDetails: {
      service: 'Cardiology Consultation (Moved)',
      scheduledTime: 'Today at 3:45 PM · Suite 502',
      client: 'Verified Inbound Patient',
      status: 'EHR Auto-Updated',
    },
  },
  {
    id: 'hotel',
    label: 'Hotel Reservation',
    industry: 'Hospitality',
    callerPrompt: "Do you have a penthouse or balcony suite available for 3 nights starting this Friday? We'll have a small dog.",
    receptionistReply: "Yes! Our Deluxe Balcony Suite is available this Friday through Monday. We are proudly pet-friendly and provide a luxury bed and organic treats for your dog. Shall I reserve this under your phone number?",
    bookingDetails: {
      service: 'Deluxe Balcony Suite (Pet-Friendly)',
      scheduledTime: 'Fri Oct 9 - Mon Oct 12 · 3 Nights',
      client: 'VIP Priority Concierge',
      status: 'PMS Held · SMS Card Sent',
    },
  },
  {
    id: 'salon',
    label: 'Salon Color & Cut',
    industry: 'Wellness & Salons',
    callerPrompt: "Hi, I need a root touch-up and blowout before a wedding this Saturday morning. Does Sarah or Leo have time?",
    receptionistReply: "Sarah has a 9:00 AM opening this Saturday that gets you finished by 10:30 AM in plenty of time for the wedding. I can lock in Sarah's chair for you now.",
    bookingDetails: {
      service: 'Root Touch-up & Signature Blowout',
      scheduledTime: 'Saturday at 9:00 AM (90 mins)',
      client: 'Sarah\'s Client Book',
      status: 'Boulevard POS Synced',
    },
  },
];

export const InteractiveConsole: React.FC = () => {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [conversation, setConversation] = useState<{
    caller: string;
    receptionist: string;
    booking: PresetDialogue['bookingDetails'];
  }>({
    caller: SCENARIOS[0].callerPrompt,
    receptionist: SCENARIOS[0].receptionistReply,
    booking: SCENARIOS[0].bookingDetails,
  });

  const handleSelectPreset = (idx: number) => {
    setSelectedIdx(idx);
    const p = SCENARIOS[idx];
    setConversation({
      caller: p.callerPrompt,
      receptionist: p.receptionistReply,
      booking: p.bookingDetails,
    });
  };

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(
        (v) =>
          v.lang.startsWith('en') &&
          (v.name.includes('Samantha') || v.name.includes('Natural') || v.name.includes('Google'))
      );
      if (preferred) utterance.voice = preferred;
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <section id="demo" className="py-24 md:py-32 bg-[#FBF9F8] border-t border-neutral-200/60 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <motion.span
            initial={{ opacity: 0, y: -10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-xs font-mono uppercase tracking-wider text-emerald-700 font-semibold"
          >
            Live Experience Sandbox
          </motion.span>
          <div className="text-3xl sm:text-4xl lg:text-5xl font-editorial font-normal tracking-tight text-neutral-950 text-balance">
            <BlurText
              text="Experience your AI employee right now."
              delay={40}
              className="font-editorial justify-center"
            />
          </div>
          <p className="text-base sm:text-lg text-neutral-600 font-sans leading-relaxed text-balance">
            Select an enterprise scenario to simulate real-time conversational processing.
          </p>
        </div>

        {/* Preset Selector Chips with layoutId */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 mt-10">
          {SCENARIOS.map((sc, idx) => {
            const isSelected = selectedIdx === idx;
            return (
              <button
                key={sc.id}
                onClick={() => handleSelectPreset(idx)}
                className={`relative px-4 py-2 rounded-full text-xs font-medium transition-all cursor-pointer ${
                  isSelected
                    ? 'text-white'
                    : 'bg-white border border-neutral-200 text-neutral-600 hover:text-neutral-950 hover:bg-neutral-50 shadow-2xs'
                }`}
              >
                {isSelected && (
                  <motion.div
                    layoutId="activeSandboxPreset"
                    transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                    className="absolute inset-0 bg-neutral-950 rounded-full shadow-xs"
                  />
                )}
                <span className="relative">{sc.label}</span>
              </button>
            );
          })}
        </div>

        {/* Interactive Console Shell with BorderBeam */}
        <div className="mt-8 max-w-4xl mx-auto glass-panel rounded-3xl p-5 sm:p-7 lg:p-8 shadow-xl relative overflow-hidden">
          <BorderBeam size={220} duration={12} />

          {/* Header */}
          <div className="flex items-center justify-between pb-5 border-b border-neutral-100">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-mono font-semibold text-neutral-900">
                Aura 4.2 Voice & Workflow Simulator
              </span>
            </div>
            <span className="text-xs font-mono text-emerald-700 font-semibold">
              Latency: 212ms
            </span>
          </div>

          {/* Dialogue exchange box with AnimatePresence */}
          <div className="mt-6 mb-5 space-y-4">
            {/* Caller prompt */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`caller-${conversation.caller}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="p-4 rounded-2xl bg-neutral-50 border border-neutral-100 text-xs sm:text-sm text-neutral-800 space-y-1"
              >
                <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
                  <span className="font-semibold text-neutral-600">Caller (You)</span>
                  <span>Inbound Voice Stream</span>
                </div>
                <p className="font-sans italic leading-relaxed">
                  "{conversation.caller}"
                </p>
              </motion.div>
            </AnimatePresence>

            {/* Aura receptionist reply */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`reply-${conversation.receptionist}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="p-5 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-xs sm:text-sm text-neutral-900 space-y-2"
              >
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <div className="flex items-center gap-1.5 text-emerald-800 font-semibold">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Aura AI Receptionist</span>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => speakText(conversation.receptionist)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-200/70 hover:bg-emerald-200 text-emerald-900 text-[10px] font-mono font-medium transition-colors cursor-pointer"
                  >
                    <Volume2 className="w-3 h-3" />
                    <span>Audition Audio</span>
                  </motion.button>
                </div>

                <p className="font-sans leading-relaxed text-neutral-800">
                  "{conversation.receptionist}"
                </p>
              </motion.div>
            </AnimatePresence>

            {/* Dynamic Booking & Action Card */}
            <motion.div
              layout
              className="p-4 rounded-2xl bg-neutral-900 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Autonomous Action Triggered</span>
                </div>
                <div className="text-sm font-semibold text-white">
                  {conversation.booking.service}
                </div>
                <div className="text-xs text-neutral-400 font-mono">
                  {conversation.booking.scheduledTime} · {conversation.booking.status}
                </div>
              </div>

              <span className="shrink-0 px-3 py-1 rounded-full text-xs font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                100% Calendar Confirmed
              </span>
            </motion.div>
          </div>

          {/* Footer hint */}
          <div className="flex items-center justify-center gap-1.5 pt-4 border-t border-neutral-100">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-[11px] font-mono text-neutral-500">
              Live transcript · select an {SCENARIOS[selectedIdx].industry} scenario above
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
