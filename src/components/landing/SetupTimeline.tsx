import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, CheckCircle2, ArrowRight, ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react';
import { BlurText } from './motion/BlurText.tsx';

interface SetupStep {
  readonly number: string;
  readonly shortLabel: string;
  readonly title: string;
  readonly subtitle: string;
  readonly description: string;
  readonly deliverables: readonly string[];
  readonly visualType: 'integrations' | 'knowledge' | 'routing';
}

const STEP_DURATION_MS = 5000; // 5 seconds per phase

const STEPS: readonly SetupStep[] = [
  {
    number: '01',
    shortLabel: 'Connect',
    title: 'Connect your business',
    subtitle: 'Zero code. Standard APIs & SIP trunks.',
    description:
      'Link your existing Google Calendar, Outlook, EHR/PMS (Epic, Athena, Boulevard, Mindbody), and CRM. Aura connects via secure OAuth or direct API keys in under 5 minutes.',
    deliverables: [
      'Two-way calendar sync with real-time conflict locking',
      'Integration with patient/client records',
      'Direct Stripe payment link automation',
    ],
    visualType: 'integrations',
  },
  {
    number: '02',
    shortLabel: 'Teach',
    title: 'Teach your knowledge',
    subtitle: 'Upload guidelines, menus, and triage rules.',
    description:
      'Feed Aura your price sheets, practitioner bios, hours, FAQ sheets, and escalation rules. Aura transforms them into deterministic guardrails with strict anti-hallucination policies.',
    deliverables: [
      'PDF, URL, and document ingestion in 60 seconds',
      'Configurable vocal warmth, cadence, and persona',
      'Strict clinical and pricing boundary guardrails',
    ],
    visualType: 'knowledge',
  },
  {
    number: '03',
    shortLabel: 'Activate',
    title: 'Start receiving calls',
    subtitle: 'Forward calls or provision toll-free lines.',
    description:
      'Enable simple call forwarding (*72) on your existing office landline or cell. Aura answers immediately with zero latency, books visits, and hot-transfers urgent callers.',
    deliverables: [
      'Zero change to your public business telephone number',
      'Instant SMS confirmations sent to caller & staff',
      'Live audio transcript feed and audit dashboard',
    ],
    visualType: 'routing',
  },
] as const;

interface ProductWindowProps {
  readonly activeStep: SetupStep;
  readonly toneWarmth: number;
  readonly onToneWarmthChange: (value: number) => void;
}

const ProductWindow: React.FC<ProductWindowProps> = ({
  activeStep,
  toneWarmth,
  onToneWarmthChange,
}) => (
  <motion.div
    layout
    className="bg-white border border-neutral-200 rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden"
  >
    {/* Header */}
    <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 pb-5 border-b border-neutral-100">
      <div className="flex items-center gap-2 text-xs font-mono text-neutral-500">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
        <span className="hidden sm:inline">Aura Admin Console</span>
        <span className="hidden sm:inline">/</span>
        <span className="text-neutral-800 font-semibold">{activeStep.title}</span>
      </div>
      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0 font-medium">
        Step {activeStep.number} of 03
      </span>
    </div>

    {/* Step Transitions with AnimatePresence */}
    <AnimatePresence mode="wait">
      <motion.div
        key={activeStep.visualType}
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: -10 }}
        transition={{ duration: 0.25 }}
      >
        {/* Step 1 Visual: Connected Integrations */}
        {activeStep.visualType === 'integrations' && (
          <div className="py-6 space-y-5">
            <div className="text-xs text-neutral-500">
              Selected active operational connectors:
            </div>

            <div className="grid grid-cols-2 min-[640px]:max-[767px]:grid-cols-3 min-[768px]:max-[1199px]:grid-cols-2 min-[1200px]:grid-cols-3 gap-3">
              {[
                { name: 'Google Workspace', status: 'Connected', desc: 'Calendar & Meet' },
                { name: 'Microsoft 365', status: 'Connected', desc: 'Exchange & Teams' },
                { name: 'Epic EHR / Cerner', status: 'Verified', desc: 'HL7 / FHIR API' },
                { name: 'Boulevard / Zenoti', status: 'Syncing', desc: 'Salon & Spa POS' },
                { name: 'Stripe Invoicing', status: 'Ready', desc: 'SMS Deposit Links' },
                { name: 'Twilio / SIP Trunk', status: 'Live', desc: 'Telephony Carrier' },
              ].map((integ, i) => (
                <motion.div
                  key={i}
                  whileHover={{ y: -2 }}
                  className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200/80 hover:bg-white hover:shadow-2xs transition-all"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-neutral-900 truncate">
                      {integ.name}
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  </div>
                  <span className="text-[11px] text-neutral-500 block">
                    {integ.desc}
                  </span>
                  <span className="text-[10px] font-mono text-emerald-700 mt-2 block font-medium">
                    {integ.status}
                  </span>
                </motion.div>
              ))}
            </div>

            <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200/70 text-xs text-emerald-900 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>End-to-end TLS 1.3 encryption with HIPAA BAA execution.</span>
              </div>
              <span className="font-mono text-[11px] text-emerald-700 font-semibold">
                Authorized
              </span>
            </div>
          </div>
        )}

        {/* Step 2 Visual: Knowledge Ingestion & Voice Calibration */}
        {activeStep.visualType === 'knowledge' && (
          <div className="py-6 space-y-5">
            <div className="text-xs text-neutral-500">
              Institutional documentation & tone configuration:
            </div>

            <div className="space-y-3">
              {[
                {
                  title: '2026_Clinic_Services_Pricing_Schedule.pdf',
                  size: '2.4 MB',
                  rules: '48 Rules Indexed',
                  status: '100% Vectorized',
                },
                {
                  title: 'Physician_Escalation_Triage_Protocols.docx',
                  size: '890 KB',
                  rules: '14 Critical Guardrails',
                  status: '100% Vectorized',
                },
                {
                  title: 'Receptionist_Vocal_Tone_Guidelines.pdf',
                  size: '1.1 MB',
                  rules: 'Warm, Calm, Concise Style',
                  status: 'Active Persona',
                },
              ].map((doc, i) => (
                <div
                  key={i}
                  className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200/80 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-neutral-500" />
                    <div>
                      <div className="text-xs font-semibold text-neutral-900">
                        {doc.title}
                      </div>
                      <div className="text-[11px] text-neutral-500 font-mono">
                        {doc.size} · {doc.rules}
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-100 text-emerald-800 font-medium">
                    {doc.status}
                  </span>
                </div>
              ))}
            </div>

            {/* Interactive Vocal Tone Slider */}
            <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200/80 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-neutral-700">Vocal Warmth & Persona Calibration:</span>
                <span className="font-mono text-emerald-700 font-semibold">{toneWarmth}% Empathy</span>
              </div>
              <input
                type="range"
                min="30"
                max="100"
                value={toneWarmth}
                onChange={(e) => onToneWarmthChange(Number(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 rounded-lg bg-white border border-neutral-200 text-neutral-700">
                  Pacing: <span className="font-mono font-semibold">1.0x Natural</span>
                </div>
                <div className="p-2 rounded-lg bg-white border border-neutral-200 text-neutral-700">
                  Interruption: <span className="font-mono font-semibold">Instant (0ms)</span>
                </div>
                <div className="p-2 rounded-lg bg-white border border-neutral-200 text-neutral-700">
                  Formality: <span className="font-mono font-semibold">Executive High</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3 Visual: Call Routing & Live Forwarding */}
        {activeStep.visualType === 'routing' && (
          <div className="py-6 space-y-5">
            <div className="text-xs text-neutral-500">
              Live call forwarding route status:
            </div>

            <div className="p-5 rounded-2xl bg-neutral-900 text-white space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-sm font-semibold">
                    Carrier Forwarding Active
                  </span>
                </div>
                <span className="text-xs font-mono text-emerald-400">
                  Latency: 198ms
                </span>
              </div>

              <div className="p-3 rounded-xl bg-neutral-800/80 border border-white/10 text-xs font-mono flex items-center justify-between text-neutral-300">
                <span>Office Landline: (415) 890-4200</span>
                <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-white">Aura Trunk: +1 (800) 492-AURA</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                  <span className="text-neutral-400 block text-[11px]">Concurrent Lines:</span>
                  <span className="text-white font-mono font-semibold">Unlimited (Peak 120/sec)</span>
                </div>
                <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                  <span className="text-neutral-400 block text-[11px]">Human Warm Transfer:</span>
                  <span className="text-emerald-400 font-mono font-semibold">Front Desk Mobile</span>
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 text-xs text-neutral-600 flex items-center justify-between">
              <span>Forwarding instruction dial code: <code className="font-mono font-bold text-neutral-900">*72 + Aura DID</code></span>
              <span className="text-emerald-700 font-medium font-mono text-xs">Auto-tested OK</span>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  </motion.div>
);

export const SetupTimeline: React.FC = () => {
  const [activeStepIdx, setActiveStepIdx] = useState<number>(0);
  const [cycleKey, setCycleKey] = useState<number>(0);
  const [toneWarmth, setToneWarmth] = useState<number>(85);
  const [isTablet, setIsTablet] = useState<boolean>(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const activeStep = STEPS[activeStepIdx];

  const goToStep = useCallback((idx: number) => {
    setActiveStepIdx(idx);
    setCycleKey((k) => k + 1);
  }, []);

  // Tablet (768px–1199px) is user-controlled: detect the range and pause autoplay
  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 768px) and (max-width: 1199px)');
    const update = () => setIsTablet(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  // 5-second auto-cycle loop (desktop/mobile only); cycleKey restarts both the timer and the fill line
  useEffect(() => {
    if (isTablet) return;

    const startTime = performance.now();

    const tick = (timestamp: number) => {
      if (timestamp - startTime >= STEP_DURATION_MS) {
        setActiveStepIdx((prev) => (prev + 1) % STEPS.length);
        setCycleKey((k) => k + 1);
      } else {
        requestAnimationFrame(tick);
      }
    };

    const animationFrameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [cycleKey, isTablet]);

  return (
    <section
      id="deployment"
      className="py-24 md:py-32 bg-[#FBF9F8] border-t border-neutral-200/60 relative"
      aria-label="Deployment Protocol"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl space-y-4">
          <motion.span
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="text-xs font-mono uppercase tracking-wider text-emerald-700 font-semibold"
          >
            Deployment Protocol
          </motion.span>
          <div className="text-3xl min-[640px]:max-[767px]:text-4xl min-[768px]:max-[1023px]:text-[44px] min-[1024px]:text-5xl font-editorial font-normal tracking-tight text-neutral-950 text-balance">
            <BlurText
              text="From setup to your first conversation."
              delay={40}
              className="font-editorial"
            />
          </div>
          <p className="text-base sm:text-lg text-neutral-600 font-sans leading-relaxed text-balance">
            No engineering resources required. Your AI receptionist is active and trained in three disciplined phases.
          </p>
        </div>

        {/* Tablet (768px–1199px): horizontal journey + full-width product interface */}
        <div className="hidden min-[768px]:max-[1199px]:block mt-12">
          {/* Horizontal deployment journey rail */}
          <div className="relative">
            <div
              className="absolute left-[16.6667%] right-[16.6667%] top-[5px] h-[2px] rounded-full bg-neutral-300"
              aria-hidden="true"
            />
            <div
              className="absolute left-[16.6667%] top-[5px] h-[2px] rounded-full bg-emerald-600 transition-[width] duration-500 ease-out"
              style={{ width: `${(activeStepIdx / (STEPS.length - 1)) * 66.6666}%` }}
              aria-hidden="true"
            />
            <div className="grid grid-cols-3">
              {STEPS.map((step, idx) => {
                const isCurrent = activeStepIdx === idx;
                const isReached = idx <= activeStepIdx;
                return (
                  <button
                    key={step.number}
                    type="button"
                    onClick={() => goToStep(idx)}
                    aria-pressed={isCurrent}
                    aria-label={`Step ${step.number}: ${step.title}`}
                    className="group flex flex-col items-center gap-1.5 rounded-lg px-1 pb-1 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                  >
                    <span
                      className={`h-3 w-3 rounded-full border-2 transition-colors ${
                        isReached
                          ? 'border-emerald-600 bg-emerald-600'
                          : 'border-neutral-300 bg-white group-hover:border-emerald-500'
                      }`}
                    />
                    <span
                      className={`font-mono text-[11px] tracking-wider transition-colors ${
                        isCurrent ? 'text-neutral-900 font-semibold' : 'text-neutral-500'
                      }`}
                    >
                      {step.number}
                    </span>
                    <span
                      className={`font-mono text-[11px] uppercase tracking-wider transition-colors ${
                        isCurrent
                          ? 'text-emerald-700 font-semibold'
                          : 'text-neutral-500 group-hover:text-neutral-700'
                      }`}
                    >
                      {step.shortLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active step information */}
          <div className="mt-10 max-w-2xl mx-auto text-center">
            <motion.div
              key={activeStep.number}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <h3 className="font-editorial text-[28px] min-[1024px]:text-[32px] tracking-tight text-neutral-950">
                {activeStep.title}
              </h3>
              <p className="mt-2 font-mono text-xs text-neutral-500">{activeStep.subtitle}</p>
              <p className="mt-3 text-base min-[1024px]:text-lg text-neutral-600 leading-relaxed">
                {activeStep.description}
              </p>
            </motion.div>
          </div>

          {/* Large product interface (full container width) with swipe navigation */}
          <div
            className="mt-8"
            onTouchStart={(e) => {
              const touch = e.touches[0];
              touchStartRef.current = { x: touch.clientX, y: touch.clientY };
            }}
            onTouchEnd={(e) => {
              if ((e.target as HTMLElement).closest('input, button, a')) return;
              const start = touchStartRef.current;
              touchStartRef.current = null;
              if (!start) return;
              const touch = e.changedTouches[0];
              const dx = touch.clientX - start.x;
              const dy = touch.clientY - start.y;
              if (Math.abs(dx) < 60 || Math.abs(dx) <= Math.abs(dy)) return;
              const target = activeStepIdx + (dx < 0 ? 1 : -1);
              if (target >= 0 && target < STEPS.length) goToStep(target);
            }}
          >
            <ProductWindow
              activeStep={activeStep}
              toneWarmth={toneWarmth}
              onToneWarmthChange={setToneWarmth}
            />
          </div>

          {/* Previous / Next controls */}
          <div className="mt-6 flex items-center justify-between">
            {activeStepIdx > 0 ? (
              <button
                type="button"
                onClick={() => goToStep(activeStepIdx - 1)}
                className="group inline-flex items-center gap-1.5 rounded-md -ml-2 px-2 py-1.5 font-mono text-xs uppercase tracking-wider text-neutral-500 transition-colors hover:text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
              >
                <ChevronLeft
                  className="h-4 w-4 transition-transform group-hover:-translate-x-0.5"
                  aria-hidden="true"
                />
                Previous
              </button>
            ) : (
              <span aria-hidden="true" />
            )}
            {activeStepIdx < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => goToStep(activeStepIdx + 1)}
                className="group inline-flex items-center gap-1.5 rounded-md -mr-2 px-2 py-1.5 font-mono text-xs uppercase tracking-wider text-neutral-500 transition-colors hover:text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
              >
                Next
                <ChevronRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </button>
            ) : (
              <span aria-hidden="true" />
            )}
          </div>
        </div>

        {/* Desktop: vertical step cards beside interactive console */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 mt-14 items-center min-[768px]:max-[1199px]:hidden">
          {/* Step Selector List */}
          <div className="lg:col-span-5 space-y-4">
            {STEPS.map((step, idx) => {
              const isSelected = activeStepIdx === idx;
              return (
                <div
                  key={step.number}
                  onClick={() => goToStep(idx)}
                  className={`p-6 rounded-2xl border transition-all duration-300 cursor-pointer relative overflow-hidden ${
                    isSelected
                      ? 'bg-white border-neutral-300 shadow-md ring-1 ring-neutral-200'
                      : 'bg-neutral-50/70 border-neutral-200/70 hover:bg-white text-neutral-600 opacity-75 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-2xl font-editorial font-light ${
                          isSelected ? 'text-neutral-900' : 'text-neutral-400'
                        }`}
                      >
                        {step.number}
                      </span>
                      <h3 className="text-lg font-semibold text-neutral-900 tracking-tight">
                        {step.title}
                      </h3>
                    </div>
                    {isSelected && (
                      <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60 shrink-0 font-medium">
                        Phase {step.number}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-neutral-500 mt-2 font-mono">
                    {step.subtitle}
                  </p>

                  {/* 5-second Filling Progress Line for the expanded card */}
                  {isSelected && (
                    <div className="w-full bg-emerald-950/10 h-1 rounded-full overflow-hidden mt-3 mb-1">
                      <motion.div
                        key={cycleKey}
                        className="bg-emerald-600 h-full w-full rounded-full origin-left"
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ duration: STEP_DURATION_MS / 1000, ease: 'linear' }}
                      />
                    </div>
                  )}

                  <AnimatePresence>
                    {isSelected && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4 pt-4 border-t border-neutral-100 space-y-2">
                          <p className="text-sm text-neutral-600 leading-relaxed">
                            {step.description}
                          </p>
                          <div className="pt-2 space-y-1.5">
                            {step.deliverables.map((item, dIdx) => (
                              <div key={dIdx} className="flex items-center gap-2 text-xs text-neutral-700">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>{item}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          {/* Interactive Visual Preview Box */}
          <div className="lg:col-span-7">
            <ProductWindow
              activeStep={activeStep}
              toneWarmth={toneWarmth}
              onToneWarmthChange={setToneWarmth}
            />
          </div>
        </div>
      </div>
    </section>
  );
};
