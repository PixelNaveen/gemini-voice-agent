import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, CheckCircle2, ArrowRight, Check, ChevronLeft, ChevronRight, Circle, ShieldCheck } from 'lucide-react';
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

            <div className="grid grid-cols-2 min-[640px]:max-[767px]:grid-cols-3 min-[768px]:max-[1200px]:grid-cols-2 min-[1200px]:grid-cols-3 gap-3">
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

const MOBILE_CONNECTORS: ReadonlyArray<{ readonly name: string; readonly status: string }> = [
  { name: 'Google Calendar', status: 'Connected' },
  { name: 'Microsoft 365', status: 'Connected' },
  { name: 'Epic EHR / Cerner', status: 'Verified' },
  { name: 'Boulevard Booking', status: 'Syncing' },
  { name: 'Stripe Payments', status: 'Ready' },
  { name: 'Twilio Telephony', status: 'Live' },
];

const MOBILE_KNOWLEDGE: ReadonlyArray<{ readonly label: string; readonly done: boolean }> = [
  { label: 'Services & pricing', done: true },
  { label: 'Business hours', done: true },
  { label: 'FAQs', done: true },
  { label: 'Policies & triage', done: true },
  { label: 'Brand voice', done: true },
  { label: 'Escalation rules', done: false },
];

interface MobileProductPreviewProps {
  readonly step: SetupStep;
}

// Simplified product UI for phones: one main message per step, single column, auto height
const MobileProductPreview: React.FC<MobileProductPreviewProps> = ({ step }) => (
  <div className="mt-6 rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
    {/* Tiny fake top bar for the product illusion */}
    <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-neutral-100 bg-neutral-50/70">
      <span className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-neutral-500">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
        Aura Admin Console
      </span>
      <span className="shrink-0 text-[10px] font-mono font-semibold text-emerald-700">
        {step.number}/03
      </span>
    </div>

    <div className="p-5">
      {/* Step 01: connectivity */}
      {step.visualType === 'integrations' && (
        <div>
          <h4 className="text-[17px] font-semibold text-neutral-900">Connected systems</h4>
          <div className="mt-3 divide-y divide-neutral-100">
            {MOBILE_CONNECTORS.map((row) => (
              <div key={row.name} className="flex items-center justify-between gap-3 py-3">
                <span className="text-[14px] font-medium text-neutral-800 truncate">{row.name}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[11px] font-mono text-neutral-500">{row.status}</span>
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            End-to-end encrypted · HIPAA BAA
          </div>
        </div>
      )}

      {/* Step 02: knowledge readiness */}
      {step.visualType === 'knowledge' && (
        <div>
          <h4 className="text-[17px] font-semibold text-neutral-900">Knowledge base</h4>
          <p className="mt-1 text-[13px] text-neutral-500">Your receptionist knows:</p>
          <div className="mt-3 divide-y divide-neutral-100">
            {MOBILE_KNOWLEDGE.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-[14px] text-neutral-800">{row.label}</span>
                {row.done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-neutral-300" />
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 text-[11px] font-mono">
            <span className="text-neutral-500">5 of 6 sections ready</span>
            <span className="font-semibold text-emerald-700">83% READY</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-neutral-100 overflow-hidden">
            <div className="h-full w-[83%] rounded-full bg-emerald-600" />
          </div>
        </div>
      )}

      {/* Step 03: live operation */}
      {step.visualType === 'routing' && (
        <div>
          <h4 className="text-[17px] font-semibold text-neutral-900">AI receptionist</h4>
          <div className="mt-3 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono text-[13px] font-semibold tracking-wider text-emerald-700">
              ACTIVE
            </span>
          </div>
          <div className="mt-2 font-mono text-[15px] text-neutral-900">+1 (800) 492-AURA</div>

          <div className="my-4 h-px bg-neutral-100" />

          <div className="font-mono text-[11px] uppercase tracking-wider text-neutral-400">Today</div>
          <div className="mt-2 space-y-2">
            {[
              { label: 'Calls', value: '27' },
              { label: 'Answered', value: '27' },
              { label: 'Missed', value: '0' },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3">
                <span className="text-[14px] text-neutral-600">{row.label}</span>
                <span className="font-mono text-[14px] font-semibold text-neutral-900">{row.value}</span>
              </div>
            ))}
          </div>

          <div className="my-4 h-px bg-neutral-100" />

          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-neutral-600">Your receptionist is live.</span>
            <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-mono text-[11px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              READY
            </span>
          </div>
        </div>
      )}
    </div>
  </div>
);

export const SetupTimeline: React.FC = () => {
  const [activeStepIdx, setActiveStepIdx] = useState<number>(0);
  const [cycleKey, setCycleKey] = useState<number>(0);
  const [toneWarmth, setToneWarmth] = useState<number>(85);
  const [isTablet, setIsTablet] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [mobileActiveStep, setMobileActiveStep] = useState<number>(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const stepRefs = useRef<Array<HTMLDivElement | null>>([]);
  const fillRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const storyRef = useRef<HTMLDivElement>(null);

  const activeStep = STEPS[activeStepIdx];

  const goToStep = useCallback((idx: number) => {
    setActiveStepIdx(idx);
    setCycleKey((k) => k + 1);
  }, []);

  // Mobile & tablet are user-driven layouts: detect both ranges and pause autoplay
  useEffect(() => {
    const tabletQuery = window.matchMedia('(min-width: 768px) and (max-width: 1199.9px)');
    const mobileQuery = window.matchMedia('(max-width: 767.98px)');
    const update = () => {
      setIsTablet(tabletQuery.matches);
      setIsMobile(mobileQuery.matches);
    };
    update();
    tabletQuery.addEventListener('change', update);
    mobileQuery.addEventListener('change', update);
    return () => {
      tabletQuery.removeEventListener('change', update);
      mobileQuery.removeEventListener('change', update);
    };
  }, []);

  // Mobile timeline state follows the story as steps cross the viewport middle.
  // Content stays put; only the rail dots change. No scroll-jacking.
  useEffect(() => {
    if (!isMobile) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const idx = Number((entry.target as HTMLElement).dataset.stepIdx);
          if (Number.isInteger(idx)) setMobileActiveStep(idx);
        });
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    );

    stepRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [isMobile]);

  // Mobile rail line fills continuously with scroll. A rAF loop (active only
  // while the story is on screen) measures each step's viewport position and
  // drives every segment's emerald overlay directly via the DOM, so the fill
  // stays smooth and needs no scroll-event plumbing.
  useEffect(() => {
    if (!isMobile) return;
    const story = storyRef.current;
    if (!story) return;

    let rafId = 0;
    let inView = true;

    const update = () => {
      const els = stepRefs.current.filter(Boolean) as HTMLDivElement[];
      if (els.length >= 2) {
        const center = window.innerHeight * 0.5;
        const tops = els.map((el) => el.getBoundingClientRect().top);

        let progress: number;
        if (center <= tops[0]) {
          progress = 0;
        } else if (center >= tops[tops.length - 1]) {
          progress = tops.length - 1;
        } else {
          let i = 0;
          while (i < tops.length - 2 && center >= tops[i + 1]) i++;
          const span = tops[i + 1] - tops[i];
          progress = i + (span > 0 ? (center - tops[i]) / span : 1);
        }

        for (let i = 0; i < fillRefs.current.length; i++) {
          const fill = fillRefs.current[i];
          if (!fill) continue;
          const trackHeight = fill.parentElement?.clientHeight ?? 0;
          const fraction = Math.min(Math.max(progress - i, 0), 1);
          fill.style.height = `${fraction * trackHeight}px`;
        }
      }
      if (inView) rafId = requestAnimationFrame(update);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !inView) {
          inView = true;
          rafId = requestAnimationFrame(update);
        } else if (!entry.isIntersecting && inView) {
          inView = false;
          cancelAnimationFrame(rafId);
        }
      },
      { rootMargin: '200px 0px 200px 0px' },
    );
    observer.observe(story);

    rafId = requestAnimationFrame(update);

    return () => {
      inView = false;
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [isMobile]);

  // 5-second auto-cycle loop (desktop only); cycleKey restarts both the timer and the fill line
  useEffect(() => {
    if (isTablet || isMobile) return;

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
  }, [cycleKey, isTablet, isMobile]);

  return (
    <section
      id="deployment"
      className="py-16 md:py-32 bg-[#FBF9F8] border-t border-neutral-200/60 relative"
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
          <div className="text-[36px] max-[768px]:leading-[1.08] max-[768px]:max-w-[340px] min-[768px]:max-[1023px]:text-[44px] min-[768px]:max-[1023px]:leading-[1.1] min-[1024px]:text-5xl font-editorial font-normal tracking-tight text-neutral-950 text-balance">
            <BlurText
              text="From setup to your first conversation."
              delay={40}
              className="font-editorial"
            />
          </div>
          <p className="text-base min-[768px]:text-lg text-neutral-600 font-sans leading-relaxed text-balance">
            No engineering resources required. Your AI receptionist is active and trained in three disciplined phases.
          </p>
        </div>

        {/* Mobile (<768px): vertical deployment story driven by scroll */}
        <div ref={storyRef} className="hidden max-[768px]:block mt-10">
          {STEPS.map((step, idx) => {
            const dotState =
              idx < mobileActiveStep ? 'done' : idx === mobileActiveStep ? 'current' : 'future';
            const isLast = idx === STEPS.length - 1;
            return (
              <div
                key={step.number}
                className="flex gap-4"
                data-step-idx={idx}
                ref={(el) => {
                  stepRefs.current[idx] = el;
                }}
              >
                {/* Timeline rail: dots + connecting line */}
                <div className="flex w-4 shrink-0 flex-col items-center pt-1.5">
                  {dotState === 'done' ? (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-white">
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    </span>
                  ) : dotState === 'current' ? (
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-emerald-600 bg-emerald-600 ring-4 ring-emerald-100" />
                  ) : (
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-neutral-300 bg-white" />
                  )}
                  {!isLast && (
                    <span className="relative my-1.5 w-[2px] flex-1 overflow-hidden rounded-full bg-neutral-200">
                      <span
                        ref={(el) => {
                          fillRefs.current[idx] = el;
                        }}
                        className="absolute left-0 top-0 w-full rounded-full bg-emerald-600"
                        style={{ height: 0 }}
                      />
                    </span>
                  )}
                </div>

                {/* Step content: label, title, description, simplified product preview */}
                <motion.div
                  className={`min-w-0 flex-1 ${isLast ? 'pb-0' : 'pb-16'}`}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-xs font-semibold text-neutral-400">
                      {step.number}
                    </span>
                    <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                      {step.shortLabel}
                    </span>
                  </div>
                  <h3 className="mt-2 font-editorial text-[26px] leading-[1.12] tracking-tight text-neutral-950">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-[15px] leading-[1.55] text-neutral-600">
                    {step.description}
                  </p>
                  <MobileProductPreview step={step} />
                </motion.div>
              </div>
            );
          })}
        </div>

        {/* Tablet (768px–1199px): horizontal journey + full-width product interface */}
        <div className="hidden min-[768px]:max-[1200px]:block mt-12">
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 mt-14 items-center max-[1200px]:hidden">
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
