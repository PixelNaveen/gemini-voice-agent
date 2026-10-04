import React, { useRef, useState, useEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform, animate } from 'motion/react';
import {
  PhoneOff,
  PhoneCall,
  Clock,
  Calendar,
  Layers,
  HeartHandshake,
  DollarSign,
  Sparkles,
  TrendingDown,
  TrendingUp,
  XCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Hand,
} from 'lucide-react';
import { BlurText } from './motion/BlurText.tsx';
import { useTouchDevice } from '../../hooks/useTouchDevice.ts';
import { ComparisonCardSkeleton } from './ui/Skeleton.tsx';

interface FeatureComparison {
  dimension: string;
  normal: string;
  ai: string;
  highlight?: boolean;
}

const FEATURE_MATRIX: FeatureComparison[] = [
  {
    dimension: 'Initial Response Speed',
    normal: '3-5 rings + 4.8 min average hold queue',
    ai: '< 250ms instant pickup (zero hold time)',
    highlight: true,
  },
  {
    dimension: 'Operating Hours',
    normal: '9 AM - 5 PM weekdays (voicemail at night & weekends)',
    ai: '24/7/365 continuous availability with zero downtime',
  },
  {
    dimension: 'Concurrent Call Capacity',
    normal: '1 caller per line (others receive busy signal)',
    ai: 'Infinite simultaneous lines (never a busy tone)',
    highlight: true,
  },
  {
    dimension: 'Booking & Scheduling',
    normal: 'Manual paper notes or callbacks 24 hrs later',
    ai: 'Live 2-way EHR/PMS sync with instant SMS confirmation',
  },
  {
    dimension: 'After-Hours Capture',
    normal: '67% hang up on voicemail & call a competitor',
    ai: '100% inquiry capture & instant slot reservation',
    highlight: true,
  },
  {
    dimension: 'In-Person Guest Experience',
    normal: 'Receptionist repeatedly interrupts guests to answer ringing phones',
    ai: 'On-site staff focuses 100% on patient/client concierge hospitality',
  },
  {
    dimension: 'Monthly Investment',
    normal: '$4,200/mo salary + overtime, benefits, training & churn overhead',
    ai: 'Starting at $499/mo fixed with zero onboarding latency',
    highlight: true,
  },
];

interface ComparisonFact {
  title: string;
  metric: string;
  detail: string;
  tag: string;
  isNegative?: boolean;
}

const NORMAL_CALLER_FACTS: ComparisonFact[] = [
  {
    title: 'Hold Times & Abandonment',
    metric: '4.8 min avg hold / 67% drop',
    detail: 'Patients and VIP callers are stuck on repetitive hold loops. Two out of three hang up and immediately dial a competitor.',
    tag: 'Friction Point',
    isNegative: true,
  },
  {
    title: 'Single-Threaded Line Capacity',
    metric: '1 caller per receptionist',
    detail: 'During peak morning triage, callers hear relentless busy signals while desk staff are overwhelmed answering basic queries.',
    tag: 'Bottleneck',
    isNegative: true,
  },
  {
    title: 'After-Hours Black Hole',
    metric: '16 hours/day unmonitored',
    detail: 'Evenings and weekends divert to voicemail tapes. High-value new patients looking to book urgent slots are lost.',
    tag: 'Lost Revenue',
    isNegative: true,
  },
  {
    title: 'Manual Booking Latency',
    metric: '24 hr callback turnaround',
    detail: 'Paper note intake, fragmented phone tag, and double bookings create administrative chaos and friction for patients.',
    tag: 'Admin Drag',
    isNegative: true,
  },
  {
    title: 'Front Desk Context Switching',
    metric: 'Up to 70 interruptions/day',
    detail: 'In-person clinic visitors wait ignored at the counter while receptionists juggle ringing landlines.',
    tag: 'Degraded Care',
    isNegative: true,
  },
];

const AI_CALLER_FACTS: ComparisonFact[] = [
  {
    title: 'Instant Sub-Second Pickup',
    metric: '< 250ms zero-ring response',
    detail: 'Every call is greeted immediately with a warm, empathetic human timbre. Zero hold music, zero menu options.',
    tag: 'Instant Access',
    isNegative: false,
  },
  {
    title: 'Infinite Concurrent Bandwidth',
    metric: 'Uncapped simultaneous lines',
    detail: 'Handles 1 or 50 callers simultaneously without degraded quality, busy tones, or queuing delays.',
    tag: 'Scale',
    isNegative: false,
  },
  {
    title: '24/7/365 Round-the-Clock Capture',
    metric: '100% after-hours conversion',
    detail: 'Answers Sunday night inquiries, triages urgency, books slots directly, and confirms instantly via automated SMS.',
    tag: 'Continuous',
    isNegative: false,
  },
  {
    title: 'Real-Time 2-Way Calendar Sync',
    metric: 'EHR / PMS direct lock',
    detail: 'Checks live practitioner calendars, verifies slot availability, collects digital intake info, and updates schedules.',
    tag: 'Automation',
    isNegative: false,
  },
  {
    title: 'Uncompromised In-Person Concierge',
    metric: '100% focused front desk',
    detail: 'In-clinic receptionists never get interrupted by ringing phones and can provide 5-star hospitality to patients.',
    tag: 'Hospitality',
    isNegative: false,
  },
];

export const ComparisonSection: React.FC = () => {
  const { isTouch, triggerHaptic } = useTouchDevice();
  const carouselContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(360);
  const [activeSlide, setActiveSlide] = useState<0 | 1>(0);

  // Raw interactive drag motion value
  const dragX = useMotionValue(0);

  // Physically-accurate, high-fidelity spring for slow, weighted, cinematic transitions
  // Calibrated with balanced mass and damping for a subtle, silky deceleration curve rather than a hard snap
  const springX = useSpring(dragX, {
    stiffness: 180,
    damping: 28,
    mass: 1.08,
    restDelta: 0.001,
  });

  // Dynamic continuous transforms for parallax depth and slow reveal transitions
  // Slide 1 (Normal Caller) smoothly scales, fades and blurs gently as dragged away
  const normalScale = useTransform(springX, [-containerWidth, 0], [0.93, 1]);
  const normalOpacity = useTransform(springX, [-containerWidth, -containerWidth * 0.15, 0], [0.25, 0.9, 1]);
  const normalFilter = useTransform(springX, [-containerWidth, 0], ['blur(4px)', 'blur(0px)']);

  // Slide 2 (AI Caller) slowly unveils from subtle scale, depth blur, and opacity
  const aiScale = useTransform(springX, [-containerWidth, 0], [1, 0.93]);
  const aiOpacity = useTransform(springX, [-containerWidth, -containerWidth * 0.85, 0], [1, 0.9, 0.25]);
  const aiFilter = useTransform(springX, [-containerWidth, 0], ['blur(0px)', 'blur(4px)']);

  useEffect(() => {
    const updateWidth = () => {
      if (carouselContainerRef.current) {
        setContainerWidth(carouselContainerRef.current.clientWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const slideTo = (index: 0 | 1) => {
    setActiveSlide(index);
    const targetX = -index * containerWidth;
    dragX.set(targetX);
    triggerHaptic(14);
  };

  const handleDragEnd = (_: any, info: { offset: { x: number }; velocity: { x: number } }) => {
    const threshold = containerWidth * 0.25;
    const dragDistance = info.offset.x;
    const velocity = info.velocity.x;

    if (activeSlide === 0) {
      if (dragDistance < -threshold || velocity < -250) {
        slideTo(1);
      } else {
        slideTo(0);
      }
    } else {
      if (dragDistance > threshold || velocity > 250) {
        slideTo(0);
      } else {
        slideTo(1);
      }
    }
  };

  // Render Card Content: Normal Caller
  const renderNormalCard = () => (
    <div className="h-full rounded-3xl bg-gradient-to-br from-[#171214] via-[#140e10] to-[#0c0809] border border-rose-900/40 p-6 sm:p-8 shadow-xl text-white flex flex-col justify-between relative overflow-hidden select-none">
      {/* Crimson micro-glow radial corner */}
      <div className="absolute top-0 left-0 w-80 h-80 bg-radial from-rose-500/12 via-rose-500/03 to-transparent blur-3xl pointer-events-none" />

      <div className="relative z-10 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap sm:flex-nowrap items-start sm:items-center justify-between gap-3 pb-5 border-b border-rose-900/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.15)] shrink-0">
              <PhoneOff className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-neutral-100 tracking-tight">
                  Normal Caller Experience
                </h3>
              </div>
              <p className="text-xs text-rose-400/80 font-mono">
                Legacy IVR · Hold Queues · Operational Friction
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider px-3 py-1 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30 shrink-0">
            Traditional
          </span>
        </div>

        {/* Summary Metric Strip */}
        <div className="grid grid-cols-3 gap-2.5 p-3 rounded-2xl bg-white/5 border border-rose-900/30 text-center">
          <div>
            <span className="text-[10px] text-neutral-400 font-mono block">Wait Time</span>
            <span className="text-sm font-semibold text-rose-400">4.8 min avg</span>
          </div>
          <div className="border-x border-white/10">
            <span className="text-[10px] text-neutral-400 font-mono block">Drop Off</span>
            <span className="text-sm font-semibold text-rose-400">67% Hang up</span>
          </div>
          <div>
            <span className="text-[10px] text-neutral-400 font-mono block">Resolution</span>
            <span className="text-sm font-semibold text-neutral-300">Uncertain</span>
          </div>
        </div>

        {/* Point-by-Point Operational Facts */}
        <div className="space-y-3 pt-1">
          <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider block">
            Operational Realities:
          </span>
          {NORMAL_CALLER_FACTS.map((fact, idx) => (
            <div
              key={idx}
              className="p-3 rounded-xl bg-white/5 border border-rose-900/30 text-xs space-y-1.5 hover:border-rose-700/50 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span className="font-semibold text-neutral-100">{fact.title}</span>
                </div>
                <span className="text-[10px] font-mono text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-900/40 shrink-0">
                  {fact.metric}
                </span>
              </div>
              <p className="text-[11px] text-neutral-300/90 leading-relaxed pl-5.5">
                {fact.detail}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Call Outcome Banner */}
      <div className="relative z-10 pt-5 mt-6 border-t border-rose-900/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-rose-400 shrink-0" />
          <div>
            <div className="text-xs font-semibold text-rose-300">
              Result: Lost Customer & Negative Sentiment
            </div>
            <div className="text-[10px] text-neutral-400">
              Patient books with local competitor who answered first
            </div>
          </div>
        </div>
        <span className="text-xs font-mono font-semibold text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded border border-rose-500/20">
          -$420 Lost
        </span>
      </div>
    </div>
  );

  // Render Card Content: AI Caller
  const renderAiCard = () => (
    <div className="h-full rounded-3xl bg-gradient-to-br from-[#021f15] via-[#04281c] to-[#01140e] border border-emerald-500/35 p-6 sm:p-8 shadow-xl text-white flex flex-col justify-between relative overflow-hidden select-none">
      {/* Luminous emerald micro-glow radial corner */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-radial from-emerald-500/18 via-emerald-500/03 to-transparent blur-3xl pointer-events-none" />

      <div className="relative z-10 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap sm:flex-nowrap items-start sm:items-center justify-between gap-3 pb-5 border-b border-emerald-500/25">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.15)] shrink-0">
              <PhoneCall className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-white tracking-tight">
                  AI Caller Experience
                </h3>
              </div>
              <p className="text-xs text-emerald-400 font-mono">
                Instant Pickup · Empathetic Timbre · Direct Lock
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Aura Autonomous
          </span>
        </div>

        {/* Summary Metric Strip */}
        <div className="grid grid-cols-3 gap-2.5 p-3 rounded-2xl bg-white/5 border border-emerald-500/20 text-center">
          <div>
            <span className="text-[10px] text-neutral-400 font-mono block">Pickup Speed</span>
            <span className="text-sm font-semibold text-emerald-400">&lt; 250ms</span>
          </div>
          <div className="border-x border-white/10">
            <span className="text-[10px] text-neutral-400 font-mono block">Inbound Capture</span>
            <span className="text-sm font-semibold text-emerald-400">100% Zero-Drop</span>
          </div>
          <div>
            <span className="text-[10px] text-neutral-400 font-mono block">Resolution</span>
            <span className="text-sm font-semibold text-white">42 seconds</span>
          </div>
        </div>

        {/* Point-by-Point Operational Facts */}
        <div className="space-y-3 pt-1">
          <span className="text-[11px] font-mono text-emerald-300/80 uppercase tracking-wider block">
            Autonomous Capabilities:
          </span>
          {AI_CALLER_FACTS.map((fact, idx) => (
            <div
              key={idx}
              className="p-3 rounded-xl bg-white/5 border border-emerald-500/25 text-xs space-y-1.5 hover:border-emerald-400/50 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="font-semibold text-white">{fact.title}</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/70 px-2 py-0.5 rounded border border-emerald-500/40 shrink-0">
                  {fact.metric}
                </span>
              </div>
              <p className="text-[11px] text-neutral-200/90 leading-relaxed pl-5.5">
                {fact.detail}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Call Outcome Banner */}
      <div className="relative z-10 pt-5 mt-6 border-t border-emerald-500/25 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
          <div>
            <div className="text-xs font-semibold text-white">
              Result: Confirmed EHR Booking & 5-Star Delight
            </div>
            <div className="text-[10px] text-neutral-400">
              Appointment locked, SMS intake sent, staff stayed relaxed
            </div>
          </div>
        </div>
        <span className="text-xs font-mono font-semibold text-emerald-300 bg-emerald-500/20 px-2.5 py-1 rounded border border-emerald-500/40">
          +$420 Secured
        </span>
      </div>
    </div>
  );

  return (
    <section id="difference" className="py-24 md:py-32 bg-[#FAF8F5] border-t border-neutral-200/70 select-none relative overflow-hidden">
      {/* Background organic glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[850px] max-w-full h-[500px] bg-gradient-to-tr from-emerald-100/30 via-rose-50/20 to-transparent blur-3xl pointer-events-none rounded-full" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="max-w-3xl space-y-4">
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/60"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
            <span className="text-xs font-mono uppercase tracking-wider text-emerald-800 font-semibold">
              Caller Experience Comparison
            </span>
          </motion.div>

          <div className="text-3xl sm:text-4xl lg:text-5xl font-editorial font-normal tracking-tight text-neutral-950 text-balance">
            <BlurText
              text="The difference between waiting and hearing."
              delay={35}
              className="font-editorial"
            />
          </div>
          <p className="text-base sm:text-lg text-neutral-600 font-sans leading-relaxed text-balance">
            Experience the exact operational contrast between a caller reaching a traditional front desk versus an autonomous executive AI receptionist.
          </p>
        </div>

        {/* Desktop View (1024px+): Side-by-side comparative layout */}
        <div className="hidden lg:grid mt-12 grid-cols-2 gap-8 items-stretch">
          <div className="h-full">{renderNormalCard()}</div>
          <div className="h-full">{renderAiCard()}</div>
        </div>

        {/* Tablet & Mobile View (< 1024px): Swipable Interactive Experience Deck */}
        <div className="block lg:hidden mt-8 max-w-2xl mx-auto">
          {/* Top Segmented Tabs Switcher */}
          <div className="flex items-center justify-center p-1 bg-neutral-100/90 rounded-2xl border border-neutral-200/80 mb-6 shadow-2xs">
            <button
              onClick={() => slideTo(0)}
              className={`relative flex-1 py-2.5 px-3 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeSlide === 0
                  ? 'text-rose-950 font-semibold shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              {activeSlide === 0 && (
                <motion.div
                  layoutId="activeComparisonPill"
                  transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                  className="absolute inset-0 bg-white rounded-xl border border-rose-200 shadow-2xs -z-10"
                />
              )}
              <PhoneOff className={`w-3.5 h-3.5 ${activeSlide === 0 ? 'text-rose-600' : 'text-neutral-400'}`} />
              <span>Traditional Reception</span>
            </button>

            <button
              onClick={() => slideTo(1)}
              className={`relative flex-1 py-2.5 px-3 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeSlide === 1
                  ? 'text-emerald-950 font-semibold shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              {activeSlide === 1 && (
                <motion.div
                  layoutId="activeComparisonPill"
                  transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                  className="absolute inset-0 bg-white rounded-xl border border-emerald-300 shadow-2xs -z-10"
                />
              )}
              <Sparkles className={`w-3.5 h-3.5 ${activeSlide === 1 ? 'text-emerald-600' : 'text-neutral-400'}`} />
              <span>Aura AI Receptionist</span>
            </button>
          </div>

          {/* Subtle Progress Bar */}
          <div className="w-full h-1 bg-neutral-200/70 rounded-full overflow-hidden mb-3">
            <motion.div
              className={`h-full rounded-full transition-colors ${
                activeSlide === 0 ? 'bg-rose-500' : 'bg-emerald-600'
              }`}
              animate={{
                width: activeSlide === 0 ? '50%' : '100%',
              }}
              transition={{ type: 'spring', stiffness: 350, damping: 28 }}
            />
          </div>

          {/* Continuous Drag Viewport with Real-Time Fluid Spring Peek */}
          <div
            ref={carouselContainerRef}
            className="relative w-full overflow-hidden rounded-3xl touch-pan-y cursor-grab active:cursor-grabbing"
          >
            <motion.div
              style={{ x: springX }}
              drag="x"
              _dragX={dragX}
              dragConstraints={{
                left: -containerWidth,
                right: 0,
              }}
              dragElastic={0.2}
              dragTransition={{
                bounceStiffness: 260,
                bounceDamping: 28,
                power: 0.18,
                timeConstant: 240,
              }}
              onDragEnd={handleDragEnd}
              className="flex w-[200%] items-stretch"
            >
              {/* Slide 1: Normal Caller with slow-reveal scale, opacity & depth transforms */}
              <motion.div
                style={{
                  width: `${containerWidth}px`,
                  scale: normalScale,
                  opacity: normalOpacity,
                  filter: normalFilter,
                }}
                className="shrink-0 p-1 transform-gpu origin-center will-change-transform"
              >
                {renderNormalCard()}
              </motion.div>

              {/* Slide 2: AI Caller with slow-reveal scale, opacity & depth transforms */}
              <motion.div
                style={{
                  width: `${containerWidth}px`,
                  scale: aiScale,
                  opacity: aiOpacity,
                  filter: aiFilter,
                }}
                className="shrink-0 p-1 transform-gpu origin-center will-change-transform"
              >
                {renderAiCard()}
              </motion.div>
            </motion.div>
          </div>

          {/* Smooth Navigation Controls & Spring Pagination Dots */}
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-neutral-200/60">
            <button
              onClick={() => slideTo(0)}
              disabled={activeSlide === 0}
              aria-label="View traditional reception"
              className="p-2.5 rounded-full bg-white border border-neutral-200/90 text-neutral-700 hover:text-neutral-950 hover:bg-neutral-50 shadow-2xs active:scale-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Middle Indicator with Spring Dots & Gesture Hint */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => slideTo(0)}
                  aria-label="View normal caller experience"
                  className="p-1 focus:outline-hidden cursor-pointer"
                >
                  <motion.div
                    animate={{
                      width: activeSlide === 0 ? 32 : 8,
                      backgroundColor: activeSlide === 0 ? '#f43f5e' : '#d4d4d8',
                    }}
                    transition={{ type: 'spring', stiffness: 350, damping: 26 }}
                    className="h-2 rounded-full"
                  />
                </button>
                <button
                  onClick={() => slideTo(1)}
                  aria-label="View AI caller experience"
                  className="p-1 focus:outline-hidden cursor-pointer"
                >
                  <motion.div
                    animate={{
                      width: activeSlide === 1 ? 32 : 8,
                      backgroundColor: activeSlide === 1 ? '#10b981' : '#d4d4d8',
                    }}
                    transition={{ type: 'spring', stiffness: 350, damping: 26 }}
                    className="h-2 rounded-full"
                  />
                </button>
              </div>
              <span className="text-[11px] font-mono text-neutral-400 flex items-center gap-1">
                <Hand className="w-3 h-3 text-neutral-400 animate-pulse" />
                <span>Swipe left/right to compare</span>
              </span>
            </div>

            <button
              onClick={() => slideTo(1)}
              disabled={activeSlide === 1}
              aria-label="View AI receptionist"
              className="p-2.5 rounded-full bg-white border border-neutral-200/90 text-neutral-700 hover:text-neutral-950 hover:bg-neutral-50 shadow-2xs active:scale-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Feature-by-Feature Operational Matrix Section */}
        <div className="mt-16 sm:mt-20">
          <div className="pb-4">
            <h4 className="text-xl sm:text-2xl font-editorial text-neutral-900">
              Operational Matrix: Side-by-Side Specifications
            </h4>
            <p className="text-xs sm:text-sm text-neutral-600 mt-1">
              Detailed architectural and operational breakdown between traditional phone routing and autonomous AI reception.
            </p>
          </div>

          <div className="mt-4 overflow-hidden rounded-3xl border border-neutral-200/90 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[580px]">
                <thead>
                  <tr className="border-b border-neutral-200/80 bg-neutral-50/80">
                    <th className="py-4 px-6 text-xs font-mono uppercase tracking-wider text-neutral-500 font-semibold w-1/3">
                      Operational Dimension
                    </th>
                    <th className="py-4 px-6 text-xs font-mono uppercase tracking-wider text-rose-700 font-semibold w-1/3 bg-rose-50/40">
                      Normal Caller Experience
                    </th>
                    <th className="py-4 px-6 text-xs font-mono uppercase tracking-wider text-emerald-700 font-semibold w-1/3 bg-emerald-50/40">
                      AI Caller Experience
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 text-xs">
                  {FEATURE_MATRIX.map((item, idx) => (
                    <tr
                      key={idx}
                      className={`hover:bg-neutral-50/60 transition-colors ${
                        item.highlight ? 'bg-emerald-50/10' : ''
                      }`}
                    >
                      <td className="py-4 px-6 font-medium text-neutral-900 flex items-center gap-2">
                        {item.dimension === 'Initial Response Speed' && <Clock className="w-3.5 h-3.5 text-neutral-400" />}
                        {item.dimension === 'Operating Hours' && <Calendar className="w-3.5 h-3.5 text-neutral-400" />}
                        {item.dimension === 'Concurrent Call Capacity' && <Layers className="w-3.5 h-3.5 text-neutral-400" />}
                        {item.dimension === 'Booking & Scheduling' && <CheckCircle2 className="w-3.5 h-3.5 text-neutral-400" />}
                        {item.dimension === 'After-Hours Capture' && <PhoneCall className="w-3.5 h-3.5 text-neutral-400" />}
                        {item.dimension === 'In-Person Guest Experience' && <HeartHandshake className="w-3.5 h-3.5 text-neutral-400" />}
                        {item.dimension === 'Monthly Investment' && <DollarSign className="w-3.5 h-3.5 text-neutral-400" />}
                        <span>{item.dimension}</span>
                      </td>
                      <td className="py-4 px-6 text-neutral-600 bg-rose-50/15">
                        <div className="flex items-start gap-2">
                          <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                          <span>{item.normal}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-neutral-900 font-medium bg-emerald-50/15">
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span className="text-emerald-950 font-semibold">{item.ai}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
