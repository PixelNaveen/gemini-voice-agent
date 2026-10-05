import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'motion/react';
import { Calendar, CheckCircle2, Sparkles, User, ShieldCheck, Activity, PhoneCall } from 'lucide-react';
import { BorderBeam } from './motion/BorderBeam.tsx';

interface Scenario {
  id: string;
  callerName: string;
  callerTag: string;
  callerStatus: string;
  callerMessage: string;
  receptionistMessage: string;
  slotDate: string;
  slotTime: string;
  meta1Label: string;
  meta1Value: string;
  meta2Label: string;
  meta2Value: string;
  sentiment: string;
}

const HERO_SCENARIOS: Scenario[] = [
  {
    id: 'hospitality',
    callerName: 'Sarah Jenkins',
    callerTag: 'VIP Guest',
    callerStatus: 'The Grand Parc Hotel',
    callerMessage: 'Hello, I wanted to inquire about a reservation for dinner tomorrow evening at 7:30 PM. Is there availability?',
    receptionistMessage: "Good evening, Sarah. We'd love to host you. We have a quiet booth table available at 7:30 PM for 2 guests. Shall I confirm that under your profile?",
    slotDate: 'Tomorrow',
    slotTime: '7:30 PM (2 Guests)',
    meta1Label: 'Reservation Slot',
    meta1Value: 'Booth · Quiet Area',
    meta2Label: 'Guest Status',
    meta2Value: '14 Stays · VIP Tier',
    sentiment: 'Delighted (99%)',
  },
  {
    id: 'clinic',
    callerName: 'Dr. Michael Hayes',
    callerTag: 'Existing Patient',
    callerStatus: 'Aura Medical Centre',
    callerMessage: 'Hi, I need to reschedule my consultation with Dr. Miller. Are there morning slots on Tuesday?',
    receptionistMessage: 'Certainly, Michael. Dr. Miller has an opening at 9:15 AM this Tuesday. I can lock that in and send your intake prep via SMS immediately.',
    slotDate: 'Tuesday, Oct 6',
    slotTime: '9:15 AM · Suite 4B',
    meta1Label: 'EHR Synchronized',
    meta1Value: 'Epic / Cerner Live',
    meta2Label: 'Intake Status',
    meta2Value: 'Automated SMS Sent',
    sentiment: 'Positive (96%)',
  },
  {
    id: 'salon',
    callerName: 'Amara Campbell',
    callerTag: 'Preferred Client',
    callerStatus: 'Atelier V Studio',
    callerMessage: 'Hi! Could I book a balayage touch-up and blowout with Elena this Friday afternoon?',
    receptionistMessage: "Hello Amara! Elena has a 2:30 PM opening this Friday for balayage & gloss. I've reserved the 2.5 hour window for you.",
    slotDate: 'Friday, Oct 9',
    slotTime: '2:30 PM · 2.5 hrs',
    meta1Label: 'Stylist Booked',
    meta1Value: 'Elena · Master Colorist',
    meta2Label: 'Deposit Link',
    meta2Value: 'Stripe SMS Dispatched',
    sentiment: 'Enthusiastic (98%)',
  },
];

export const HeroReceptionist3DCard: React.FC = () => {
  const [activeScenarioIdx, setActiveScenarioIdx] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Auto-switch simulation scenarios every 3 seconds as a smooth loop (pauses on hover)
  useEffect(() => {
    if (isHovered) return;

    const interval = setInterval(() => {
      setActiveScenarioIdx((prev) => (prev + 1) % HERO_SCENARIOS.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [isHovered]);

  // Smooth Motion Spring Physics
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [7, -7]), {
    stiffness: 260,
    damping: 24,
  });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-7, 7]), {
    stiffness: 260,
    damping: 24,
  });

  const scenario = HERO_SCENARIOS[activeScenarioIdx];

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    if (!isHovered) setIsHovered(true);
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    mouseX.set(x);
    mouseY.set(y);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <div className="relative w-full max-w-xl mx-auto perspective-1000 select-none">
      {/* Decorative ambient underglow */}
      <div className="absolute -inset-2 bg-gradient-to-r from-emerald-500/15 via-neutral-200/40 to-emerald-500/15 rounded-3xl blur-2xl opacity-70 pointer-events-none" />

      {/* Floating 3D Spring Container */}
      <motion.div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          rotateX,
          rotateY,
          transformStyle: 'preserve-3d',
        }}
        whileHover={{ translateY: -6 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="relative bg-white/95 backdrop-blur-xl border border-neutral-200/80 rounded-2xl p-5 sm:p-7 shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:shadow-[0_24px_48px_rgb(0,0,0,0.12)] transition-shadow duration-300"
      >
        {/* Border Beam subtle light trace */}
        <BorderBeam size={220} duration={10} />

        {/* Top Header: Caller Details & Live Status */}
        <div className="flex flex-wrap sm:flex-nowrap items-start sm:items-center justify-between gap-3 pb-5 border-b border-neutral-100">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-neutral-100 border border-neutral-200 flex items-center justify-center text-neutral-700 font-medium text-sm">
                <User className="w-5 h-5 text-neutral-600" />
              </div>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-base font-semibold text-neutral-900 tracking-tight">
                  {scenario.callerName}
                </h4>
                <span className="text-[11px] text-neutral-500 font-mono">
                  · {scenario.callerTag}
                </span>
              </div>
              <p className="text-xs text-neutral-500">
                Inbound audio stream · {scenario.callerStatus}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60 shadow-2xs">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              Live Call
            </span>
            <span className="text-xs font-mono tabular-nums text-neutral-400">
              01:24
            </span>
          </div>
        </div>

        {/* Live Conversation Stream Box with AnimatePresence */}
        <div className="my-5 space-y-3.5 min-h-[160px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={scenario.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className="space-y-3.5"
            >
              {/* Caller Bubble */}
              <div className="p-3.5 rounded-xl bg-neutral-50/90 border border-neutral-100 text-xs sm:text-sm text-neutral-700 leading-relaxed shadow-2xs">
                <div className="flex items-center justify-between mb-1 text-[11px] text-neutral-400 font-mono">
                  <span className="font-semibold text-neutral-600">{scenario.callerName}</span>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
                    <span>Inbound 48kHz</span>
                  </div>
                </div>
                <p className="italic">"{scenario.callerMessage}"</p>
              </div>

              {/* AI Receptionist Response Bubble with Audio Equalizer Bar */}
              <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200/80 text-xs sm:text-sm text-neutral-900 leading-relaxed shadow-sm">
                <div className="flex items-center justify-between mb-1.5 text-[11px] font-mono">
                  <div className="flex items-center gap-1.5 text-emerald-800 font-semibold">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                    <span>Aura AI Receptionist</span>
                  </div>
                  {/* Micro equalizer wave */}
                  <div className="flex items-center gap-0.5 px-2 py-0.5 rounded bg-emerald-100/80 text-emerald-800">
                    {[10, 16, 8, 14, 11].map((h, i) => (
                      <motion.span
                        key={i}
                        animate={{ height: [4, h, 6] }}
                        transition={{
                          duration: 0.6,
                          repeat: Infinity,
                          repeatType: 'reverse',
                          delay: i * 0.1,
                        }}
                        className="w-0.5 bg-emerald-600 rounded-full inline-block"
                        style={{ height: h }}
                      />
                    ))}
                    <span className="ml-1 text-[10px]">210ms</span>
                  </div>
                </div>
                <p className="font-sans text-neutral-800">
                  "{scenario.receptionistMessage}"
                </p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Operational Context Cards */}
        <div className="grid grid-cols-2 gap-3 pt-1 pb-4">
          <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-100 transition-colors hover:bg-white hover:shadow-2xs">
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 mb-1">
              <Calendar className="w-3.5 h-3.5 text-neutral-400" />
              <span>{scenario.meta1Label}</span>
            </div>
            <div className="text-xs font-semibold text-neutral-900 truncate">
              {scenario.slotDate} · {scenario.slotTime}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-100 transition-colors hover:bg-white hover:shadow-2xs">
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>{scenario.meta2Label}</span>
            </div>
            <div className="text-xs font-semibold text-neutral-900 truncate">
              {scenario.meta2Value}
            </div>
          </div>
        </div>

        {/* Bottom Interactive Bar & Scenario Switcher */}
        <div className="pt-3 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-neutral-500">
            <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider">Simulate:</span>
            <div className="inline-flex p-0.5 bg-neutral-100 rounded-lg border border-neutral-200/80">
              {HERO_SCENARIOS.map((sc, i) => (
                <button
                  key={sc.id}
                  onClick={() => setActiveScenarioIdx(i)}
                  className={`relative px-3 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                    activeScenarioIdx === i
                      ? 'text-white font-semibold'
                      : 'text-neutral-600 hover:text-neutral-950'
                  }`}
                >
                  {activeScenarioIdx === i && (
                    <motion.div
                      layoutId="activeHeroTab"
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                      className="absolute inset-0 bg-emerald-accent rounded-md shadow-[0_2px_8px_rgba(12,120,87,0.28)]"
                      style={{ zIndex: 0 }}
                    />
                  )}
                  <span className="relative z-10">{i === 0 ? 'Hotel' : i === 1 ? 'Clinic' : 'Salon'}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Calendar Auto-Locked</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
