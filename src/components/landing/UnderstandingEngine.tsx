import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Brain, ChevronLeft, ChevronRight } from 'lucide-react';
import { AudioWaveformCanvas } from './AudioWaveformCanvas.tsx';
import { BlurText } from './motion/BlurText.tsx';
import { AuroraGlow } from './motion/AuroraGlow.tsx';
import { BorderBeam } from './motion/BorderBeam.tsx';
import { CursorSpotlight } from './motion/CursorSpotlight.tsx';

/**
 * Responsive architecture (one source of truth):
 *   Desktop  ≥1200px  → split layout, three comparable case cards
 *   Tablet   768–1199 → horizontal case rail above one showcase
 *   Mobile   <768px   → focused single case + tap / swipe / arrows
 *
 * All three views read the same ENGINE_CASES data and the same
 * `activeCase` state. Only presentation and navigation change.
 */
interface EngineCase {
  id: string;
  number: string;
  navTitle: string;
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
    number: '01',
    navTitle: 'Reschedule',
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
    number: '02',
    navTitle: 'Triage',
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
    number: '03',
    navTitle: 'Dining',
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

const WIDE_QUERY = '(min-width: 1200px)';

function useIsWideLayout(): boolean {
  const [matches, setMatches] = useState<boolean>(
    () => typeof window !== 'undefined' && window.matchMedia(WIDE_QUERY).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(WIDE_QUERY);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return matches;
}

interface TelemetryProps {
  activeCase: EngineCase;
}

const TelemetryCards: React.FC<TelemetryProps> = ({ activeCase }) => (
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
);

const TelemetryCompact: React.FC<TelemetryProps> = ({ activeCase }) => (
  <div className="grid grid-cols-3 rounded-xl border border-white/10 bg-white/5 overflow-hidden">
    <div className="px-3 py-2.5 text-center">
      <div className="text-sm font-mono font-semibold text-emerald-400">
        {activeCase.latency}ms
      </div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
        Latency
      </div>
    </div>
    <div className="px-3 py-2.5 text-center border-x border-white/10">
      <div className="text-sm font-mono font-semibold text-white">48kHz</div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
        Audio
      </div>
    </div>
    <div className="px-3 py-2.5 text-center">
      <div className="text-sm font-mono font-semibold text-white">100%</div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
        Policy
      </div>
    </div>
  </div>
);

const DiagnosticCard: React.FC<TelemetryProps> = ({ activeCase }) => {
  const reducedMotion = useReducedMotion();
  const yOffset = reducedMotion ? 0 : 6;

  return (
    <div
      role="region"
      aria-label="Active case transcript and execution details"
      className="relative p-5 sm:p-6 rounded-2xl glass-panel-dark border border-white/15 space-y-4 shadow-xl overflow-hidden"
    >
      <BorderBeam size={200} duration={12} />

      <AnimatePresence mode="wait">
        <motion.div
          key={activeCase.id}
          initial={{ opacity: 0, y: yOffset }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: yOffset }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
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
  );
};

export const UnderstandingEngine: React.FC = () => {
  const [activeCase, setActiveCase] = useState(0);
  const isWide = useIsWideLayout();
  const currentCase = ENGINE_CASES[activeCase];
  const totalCases = ENGINE_CASES.length;
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);

  const goTo = (idx: number) => {
    setActiveCase(((idx % totalCases) + totalCases) % totalCases);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchOrigin.current = { x: t.clientX, y: t.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const origin = touchOrigin.current;
    touchOrigin.current = null;
    if (!origin) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - origin.x;
    const dy = t.clientY - origin.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      goTo(activeCase + (dx < 0 ? 1 : -1));
    }
  };

  const caseRailButton = (item: EngineCase, idx: number) => {
    const isActive = activeCase === idx;
    return (
      <button
        key={item.id}
        onClick={() => goTo(idx)}
        aria-pressed={isActive}
        aria-label={`Show case ${item.number}: ${item.title}`}
        className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-lg font-mono text-[11px] uppercase tracking-wider transition-colors duration-200 cursor-pointer ${
          isActive
            ? 'bg-neutral-900 border border-emerald-500/60 text-white shadow-lg'
            : 'border border-transparent text-neutral-500 hover:text-neutral-300 hover:bg-white/5'
        }`}
      >
        <span className={isActive ? 'text-emerald-400' : 'text-neutral-600'}>
          {isActive ? '●' : '○'}
        </span>
        <span>
          {item.number} {item.navTitle}
        </span>
      </button>
    );
  };

  const showcase = (
    <>
      <AudioWaveformCanvas
        key={currentCase.id}
        isPlaying={true}
        sampleText={currentCase.aiResponse}
      />
      <div className="hidden md:block">
        <TelemetryCards activeCase={currentCase} />
      </div>
      <div className="md:hidden">
        <TelemetryCompact activeCase={currentCase} />
      </div>
    </>
  );

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

        {isWide ? (
          /* ───────── Desktop ≥1200px: split console, cases compared side by side ───────── */
          <div className="grid grid-cols-12 gap-8 lg:gap-10 mt-14 items-start">
            {/* Left: Voice Experience */}
            <div className="col-span-6 space-y-6">{showcase}</div>

            {/* Right: Case cards + diagnostic */}
            <div className="col-span-6 space-y-4">
              <div className="flex flex-col space-y-2" role="tablist" aria-label="Case studies">
                {ENGINE_CASES.map((item, idx) => (
                  <button
                    key={item.id}
                    role="tab"
                    aria-selected={activeCase === idx}
                    onClick={() => goTo(idx)}
                    className={`relative w-full text-left p-4 rounded-xl border transition-all duration-200 cursor-pointer flex items-center justify-between ${
                      activeCase === idx
                        ? 'border-emerald-500/60 shadow-lg'
                        : 'bg-white/5 border-white/10 hover:bg-white/10 text-neutral-400'
                    }`}
                  >
                    {activeCase === idx && (
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
                        activeCase === idx ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-600'
                      }`}
                    />
                  </button>
                ))}
              </div>

              <DiagnosticCard activeCase={currentCase} />
            </div>
          </div>
        ) : (
          /* ───────── Tablet 768–1199: horizontal case rail → showcase ─────────
             ───────── Mobile  <768:   one focused case, tap / swipe / arrows ───────── */
          <div className="mt-10 md:mt-14 space-y-5">
            {/* Tablet: operational case rail */}
            <div className="hidden md:flex items-center gap-1 p-1.5 rounded-xl border border-white/12 bg-white/[0.03] backdrop-blur-sm">
              {ENGINE_CASES.map((item, idx) => caseRailButton(item, idx))}
            </div>

            {/* Mobile: segmented case selector */}
            <div className="md:hidden flex items-center gap-1 p-1.5 rounded-xl border border-white/12 bg-white/[0.03] backdrop-blur-sm">
              {ENGINE_CASES.map((item, idx) => caseRailButton(item, idx))}
            </div>

            {/* Mobile: active case identity */}
            <div className="md:hidden space-y-1.5">
              <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-emerald-400">
                <span>
                  Case {currentCase.number} / {String(totalCases).padStart(2, '0')}
                </span>
                <span className="flex-1 h-px bg-white/10" />
              </div>
              <h3 className="text-xl font-editorial text-white leading-snug">
                {currentCase.title}
              </h3>
            </div>

            {/* Showcase + diagnostic, swipable */}
            <div
              className="space-y-5"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <div className="space-y-6">{showcase}</div>
              <DiagnosticCard activeCase={currentCase} />
            </div>

            {/* Mobile: indicators + prev/next controls */}
            <div className="md:hidden flex items-center justify-between pt-4 border-t border-white/10">
              <button
                onClick={() => goTo(activeCase - 1)}
                aria-label="Previous case"
                className="p-3 rounded-lg border border-white/10 text-neutral-300 hover:text-white hover:border-emerald-500/50 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2.5" role="tablist" aria-label="Case indicators">
                {ENGINE_CASES.map((item, idx) => (
                  <button
                    key={item.id}
                    role="tab"
                    aria-selected={activeCase === idx}
                    aria-label={`Case ${item.number}: ${item.title}`}
                    onClick={() => goTo(idx)}
                    className="p-2 cursor-pointer"
                  >
                    <motion.span
                      animate={{
                        width: activeCase === idx ? 22 : 8,
                        backgroundColor: activeCase === idx ? '#34d399' : '#52525b',
                      }}
                      transition={{ duration: 0.22 }}
                      className="block h-2 rounded-full"
                    />
                  </button>
                ))}
              </div>

              <button
                onClick={() => goTo(activeCase + 1)}
                aria-label="Next case"
                className="p-3 rounded-lg border border-white/10 text-neutral-300 hover:text-white hover:border-emerald-500/50 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
