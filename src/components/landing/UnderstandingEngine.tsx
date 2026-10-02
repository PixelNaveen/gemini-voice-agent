import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Brain, Volume2, Sparkles, CheckCircle2, Shield } from 'lucide-react';
import { AudioWaveformCanvas } from './AudioWaveformCanvas.tsx';
import { BlurText } from './motion/BlurText.tsx';
import { AuroraGlow } from './motion/AuroraGlow.tsx';
import { BorderBeam } from './motion/BorderBeam.tsx';
import { CursorSpotlight } from './motion/CursorSpotlight.tsx';

interface EngineCase {
  id: string;
  tag: string;
  title: string;
  callerQuery: string;
  aiResponse: string;
  policyEnforced: string;
  actionTaken: string;
  latency: number;
}

const ENGINE_CASES: EngineCase[] = [
  {
    id: 'case-1',
    tag: 'Case 01: Rescheduling & Special Needs',
    title: 'Adaptive Appointment Rescheduling',
    callerQuery:
      "I have an appointment tomorrow at 10 AM, but I just sprained my ankle. Can I reschedule for next week and request wheelchair access at the front entrance?",
    aiResponse:
      "I am so sorry to hear about your ankle. I've moved your appointment to next Thursday at 10:30 AM with Dr. Aris, and I've flagged ground-floor wheelchair assistance for your arrival. An SMS confirmation was just sent.",
    policyEnforced: 'ADA Compliance & Clinical Rescheduling Rule 4.1',
    actionTaken: 'EHR Rescheduled · Mobility Support Flagged · SMS Dispatched',
    latency: 218,
  },
  {
    id: 'case-2',
    tag: 'Case 02: Ambiguous Clinical Concerns',
    title: 'Contextual Triage & Protocol Routing',
    callerQuery:
      "My daughter woke up with a sharp ear pain and mild fever. Do you have a doctor available this afternoon, or should we head to urgent care?",
    aiResponse:
      "Ear pain with fever is always concerning. Dr. Chen has a dedicated pediatric emergency opening today at 3:15 PM at our North Wing. If the fever spikes above 102°F or she experiences dizziness, please seek immediate emergency care. Would you like me to reserve the 3:15 PM slot right now?",
    policyEnforced: 'Pediatric Red-Flag Protocol & Emergency Escalation',
    actionTaken: 'Clinical Pre-Triage Checklist Verified · Reserve Pending',
    latency: 242,
  },
  {
    id: 'case-3',
    tag: 'Case 03: Complex Hospitality Requests',
    title: 'Multi-Party Dining & Dietary Synthesis',
    callerQuery:
      "We want to book a table for 8 people for my partner's 40th birthday on Saturday night. Two guests are strictly celiac gluten-free, and we'd love a quiet corner.",
    aiResponse:
      "Happy early 40th to your partner! I have an 8-guest corner banquette reserved at 8:00 PM this Saturday. Our culinary team has been pre-notified of the two strict celiac guests with our dedicated gluten-free kitchen prep protocol. May I hold this under your mobile number?",
    policyEnforced: 'Severe Allergen Safety Protocol & Large Party Floor Plan',
    actionTaken: 'Host Stand Table Blocked · Allergen Alert Injected to POS',
    latency: 205,
  },
];

export const UnderstandingEngine: React.FC = () => {
  const [selectedCaseIdx, setSelectedCaseIdx] = useState(0);
  const activeCase = ENGINE_CASES[selectedCaseIdx];

  const handleSpeakSpeech = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.02;
      utterance.pitch = 1.0;
      const voices = window.speechSynthesis.getVoices();
      const naturalVoice = voices.find(
        (v) =>
          v.lang.startsWith('en') &&
          (v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Google') || v.name.includes('Karen'))
      );
      if (naturalVoice) utterance.voice = naturalVoice;
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <section id="understanding" className="py-24 md:py-32 bg-[#0B0B0B] text-white relative overflow-hidden">
      {/* Cursor-tracking spotlight layer */}
      <CursorSpotlight size={700} color="rgba(5, 150, 105, 0.18)" />

      {/* Aurora glow in dark mode */}
      <AuroraGlow dark={true} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="max-w-3xl space-y-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-xs font-mono text-emerald-400"
          >
            <Brain className="w-3.5 h-3.5" />
            <span>Autonomous Intelligence</span>
          </motion.div>
          <div className="text-3xl sm:text-4xl lg:text-5xl font-editorial font-normal tracking-tight text-white text-balance">
            <BlurText
              text="It doesn't just answer. It understands."
              delay={40}
              className="font-editorial text-white"
            />
          </div>
          <p className="text-base sm:text-lg text-neutral-400 font-sans leading-relaxed text-balance">
            Your services. Your availability. Your policies. Your workflows. Trained exclusively on your institutional knowledge base to deliver flawless executive execution.
          </p>
        </div>

        {/* Core Interactive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 mt-14 items-start">
          {/* Left Side: Audio Waveform Canvas & Telemetry */}
          <div className="lg:col-span-6 space-y-6">
            <AudioWaveformCanvas
              key={activeCase.id}
              isPlaying={true}
              sampleText={activeCase.aiResponse}
              latencyMs={activeCase.latency}
            />

            {/* Live Model Telemetry Specs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                <div className="text-[11px] font-mono uppercase tracking-wider text-neutral-400">
                  Latency
                </div>
                <div className="text-xl font-mono font-semibold text-emerald-400 mt-1">
                  {activeCase.latency}ms
                </div>
                <div className="text-[11px] text-neutral-400 mt-0.5">
                  Sub-second speech response
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                <div className="text-[11px] font-mono uppercase tracking-wider text-neutral-400">
                  Audio Fidelity
                </div>
                <div className="text-xl font-mono font-semibold text-white mt-1">
                  48kHz
                </div>
                <div className="text-[11px] text-neutral-400 mt-0.5">
                  Studio voice rendering
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors col-span-2 sm:col-span-1">
                <div className="text-[11px] font-mono uppercase tracking-wider text-neutral-400">
                  Guardrails
                </div>
                <div className="text-xl font-mono font-semibold text-white mt-1">
                  100% Policy
                </div>
                <div className="text-[11px] text-neutral-400 mt-0.5">
                  Zero hallucination bounds
                </div>
              </div>
            </div>

            {/* Test Voice Pronunciation Button with ripple */}
            <motion.div
              whileHover={{ scale: 1.01 }}
              className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/25 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <Volume2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div className="text-xs text-neutral-300 leading-relaxed">
                  <span className="font-semibold text-white">Browser Voice Test:</span> Hear this response synthesized in your local browser voice.
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => handleSpeakSpeech(activeCase.aiResponse)}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs transition-colors shrink-0 cursor-pointer shadow-xs ml-auto sm:ml-0"
              >
                Audition
              </motion.button>
            </motion.div>
          </div>

          {/* Right Side: Scenario Navigator & Reasoning Inspector */}
          <div className="lg:col-span-6 space-y-4">
            {/* Scenario Tabs with layoutId */}
            <div className="flex flex-col space-y-2">
              {ENGINE_CASES.map((item, idx) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedCaseIdx(idx)}
                  className={`relative w-full text-left p-4 rounded-xl border transition-all duration-200 cursor-pointer flex items-center justify-between ${
                    selectedCaseIdx === idx
                      ? 'border-emerald-500/60 shadow-lg'
                      : 'bg-white/5 border-white/10 hover:bg-white/10 text-neutral-400'
                  }`}
                >
                  {selectedCaseIdx === idx && (
                    <motion.div
                      layoutId="engineActiveTab"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      className="absolute inset-0 bg-neutral-900 rounded-xl border border-emerald-500/60 ring-1 ring-emerald-500/25 -z-10"
                    />
                  )}
                  <div>
                    <span className="text-xs font-mono block text-emerald-400">
                      {item.tag}
                    </span>
                    <h4 className="text-sm font-semibold text-white mt-0.5">
                      {item.title}
                    </h4>
                  </div>
                  <div
                    className={`w-2 h-2 rounded-full ${
                      selectedCaseIdx === idx ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-600'
                    }`}
                  />
                </button>
              ))}
            </div>

            {/* Deep Diagnostic Card with AnimatePresence */}
            <div className="relative p-6 rounded-2xl glass-panel-dark border border-white/15 space-y-4 shadow-xl overflow-hidden">
              <BorderBeam size={200} duration={12} />

              <AnimatePresence mode="wait">
                <motion.div
                  key={activeCase.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4"
                >
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400 mb-1.5">
                      <span className="uppercase tracking-wider">Caller Audio Input</span>
                      <span>Natural Dialect & Speech</span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-black/60 border border-white/10 text-sm text-neutral-200 leading-relaxed font-sans italic">
                      "{activeCase.callerQuery}"
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[11px] font-mono text-emerald-400 mb-1.5">
                      <span className="uppercase tracking-wider">Aura Autonomous Response</span>
                      <span>Synthesized in {activeCase.latency}ms</span>
                    </div>
                    <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-sm text-neutral-100 leading-relaxed font-sans">
                      "{activeCase.aiResponse}"
                    </div>
                  </div>

                  {/* Policy & Action Inspector */}
                  <div className="pt-3 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-[11px] font-mono text-neutral-400 block mb-0.5">
                        Institutional Rule Enforced:
                      </span>
                      <span className="text-neutral-200 font-medium">
                        {activeCase.policyEnforced}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] font-mono text-neutral-400 block mb-0.5">
                        Integrated System Action:
                      </span>
                      <span className="text-emerald-400 font-medium">
                        {activeCase.actionTaken}
                      </span>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
