import React, { useState } from 'react';
import { motion, AnimatePresence, type Variants } from 'motion/react';
import { Volume2, VolumeX, ArrowRight, CheckCircle2, X, Sparkles, Building2, Stethoscope, Scissors, Play, Pause } from 'lucide-react';
import { IndustryCase } from '../../types/landing.types.ts';
import { BlurText } from './motion/BlurText.tsx';
import { AnimatedCounter } from './motion/AnimatedCounter.tsx';
import { SpotlightCard } from './motion/SpotlightCard.tsx';
import { TouchSwipeDeck } from './motion/TouchSwipeDeck.tsx';
import { IndustryCardSkeleton } from './ui/Skeleton.tsx';

// Direct asset imports for rock-solid Vite bundling and high-res display
import clinicImg from '../../assets/images/luxury_wellness_clinic_1790480002737.jpg';
import hotelImg from '../../assets/images/boutique_hospitality_hotel_1790480016945.jpg';
import salonImg from '../../assets/images/premium_hair_salon_studio_1790480029115.jpg';

interface IndustryItem extends IndustryCase {
  tag: string;
  icon: 'clinic' | 'hotel' | 'salon';
  statNum: number;
  statPrefix?: string;
  statSuffix?: string;
  statDecimals?: number;
  voiceStyle: string;
}

const INDUSTRIES: IndustryItem[] = [
  {
    id: 'healthcare',
    name: 'Luxury Wellness & Healthcare',
    subtitle: 'Clinics, Plastic Surgery, Medspas & Specialists',
    tag: 'Clinical Care',
    icon: 'clinic',
    description:
      'Comprehensive handling of appointment requests, treatment inquiries, symptom pre-screening, and urgent on-call physician routing.',
    image: clinicImg,
    statNumber: '+46%',
    statNum: 46,
    statPrefix: '+',
    statSuffix: '%',
    statLabel: 'After-hours consultations booked',
    secondaryStat: '0 missed patient inquiries',
    quote:
      '"Our medical practice went from losing 20+ weekend patient calls to converting 100% of qualified booking inquiries with clinical precision."',
    voiceStyle: 'Calm, Empathetic & HIPAA Compliant',
    dialogueSnippet: {
      caller:
        'Hello, I would like to schedule a consultation with Dr. Miller for dermal ultrasound, but I am only in town this Thursday.',
      receptionist:
        'Dr. Miller has a prioritized 3:30 PM slot open this Thursday. I can reserve this with your clinical intake form sent via SMS.',
    },
  },
  {
    id: 'hospitality',
    name: 'Boutique Hospitality & Lodging',
    subtitle: 'Boutique Hotels, Luxury Resorts & Private Clubs',
    tag: '5-Star Concierge',
    icon: 'hotel',
    description:
      '24/7 multilingual reservation assistance, suite preferences, late checkout accommodations, airport transfers, and private dining arrangements.',
    image: hotelImg,
    statNumber: '4 Languages',
    statNum: 4,
    statSuffix: ' Languages',
    statLabel: 'Fluent English, French, Spanish, German',
    secondaryStat: '18s average call resolution',
    quote:
      '"International guests calling from Paris or Tokyo at 3 AM receive instant, white-glove concierge booking without language barriers."',
    voiceStyle: 'Refined, Warm & Polyglot',
    dialogueSnippet: {
      caller:
        'Bonsoir! We arrive tomorrow on Air France 84 and need an airport car and champagne ready in the Terrace Suite.',
      receptionist:
        'Bonsoir! J’ai réservé votre chauffeur pour le vol AF84 et le champagne sera frais dans la Suite Terrasse pour votre arrivée.',
    },
  },
  {
    id: 'salons',
    name: 'Premium Salons & Studios',
    subtitle: 'Master Colorists, Day Spas & Wellness Studios',
    tag: 'Beauty & Spas',
    icon: 'salon',
    description:
      'High-touch stylist scheduling, service matching, automated cancellation refill list management, and non-refundable deposit link dispatch.',
    image: salonImg,
    statNumber: '99.2%',
    statNum: 99.2,
    statSuffix: '%',
    statDecimals: 1,
    statLabel: 'Stylist chair calendar occupancy',
    secondaryStat: '15 hrs saved weekly per front desk',
    quote:
      '"Stylists can focus completely on clients without constantly pausing to pick up ringing phones. Our cancellations are filled within minutes."',
    voiceStyle: 'Vibrant, Polished & Conversational',
    dialogueSnippet: {
      caller:
        'Hi, does Elena have any openings for a balayage touch-up this Saturday if someone cancels?',
      receptionist:
        'Elena has a cancellation alert waitlist for Saturday. I’ve prioritized you at #1 and can hold a tentative 2 PM slot right now.',
    },
  },
];

// Calm, Professional Card component with subtle elevation motions
const IndustryCard: React.FC<{
  industry: IndustryItem;
  idx: number;
  onSelectCase: (industry: IndustryItem) => void;
}> = ({ industry, idx, onSelectCase }) => {
  // Professional, Calm card variants (smooth vertical lift without 3D distortion)
  const cardVariants: Variants = {
    initial: {
      opacity: 0,
      y: 25,
    },
    animate: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        delay: idx * 0.1,
        ease: [0.22, 1, 0.36, 1],
      },
    },
    whileHover: {
      y: -4,
      transition: {
        duration: 0.2,
        ease: 'easeOut',
      },
    },
    whileTap: {
      scale: 0.99,
    },
  };

  return (
    <motion.div
      variants={cardVariants}
      initial="initial"
      whileInView="animate"
      whileHover="whileHover"
      whileTap="whileTap"
      viewport={{ once: true, margin: '-20px' }}
      className="h-full"
    >
      <SpotlightCard
        spotlightColor="rgba(5, 150, 105, 0.12)"
        className="group h-full rounded-3xl border border-neutral-200/90 overflow-hidden bg-white shadow-xs hover:shadow-md transition-shadow duration-300 flex flex-col justify-between"
      >
        <div>
          {/* Image Header with Direct Asset URL, Subtle Zoom & Rich Badges */}
          <div className="relative aspect-16/10 overflow-hidden bg-neutral-100">
            <motion.img
              src={industry.image}
              alt={industry.name}
              className="w-full h-full object-cover group-hover:scale-104 transition-transform duration-500 ease-out"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

            {/* Top Badges */}
            <div className="absolute top-3.5 left-4 right-4 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 backdrop-blur-md text-[11px] font-mono font-medium text-neutral-800 shadow-2xs">
                {industry.icon === 'clinic' && <Stethoscope className="w-3 h-3 text-emerald-600" />}
                {industry.icon === 'hotel' && <Building2 className="w-3 h-3 text-amber-600" />}
                {industry.icon === 'salon' && <Scissors className="w-3 h-3 text-rose-600" />}
                {industry.tag}
              </span>

              {/* Beacon badge - visible and animated on both mobile & desktop */}
              <span className="inline-flex items-center gap-1.5 text-[10px] font-mono tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 backdrop-blur-md">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Ready
              </span>
            </div>

            {/* Bottom Image Label */}
            <div className="absolute bottom-3.5 left-4 right-4 flex items-center justify-between text-white">
              <span className="text-xs font-mono tracking-wider uppercase text-emerald-300 font-semibold drop-shadow-xs">
                {industry.name.split('&')[0].trim()}
              </span>
              <span className="text-xs font-mono tabular-nums text-neutral-200">
                {industry.secondaryStat}
              </span>
            </div>
          </div>

          {/* Content Section */}
          <div className="p-5 sm:p-6 space-y-4">
            <div>
              <h3 className="text-lg sm:text-xl font-semibold text-neutral-900 tracking-tight">
                {industry.name}
              </h3>
              <p className="text-xs text-neutral-500 font-mono mt-1">
                {industry.subtitle}
              </p>
            </div>

            <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">
              {industry.description}
            </p>

            {/* Autonomous Voice Persona Specification */}
            <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-1.5 px-3.5 py-2.5 rounded-xl border border-neutral-200/80 bg-neutral-50/80 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="font-mono text-[11px] text-neutral-500 uppercase tracking-wider">Acoustic Persona</span>
              </div>
              <span className="text-[11px] font-medium text-emerald-800 font-sans">
                {industry.voiceStyle}
              </span>
            </div>

            {/* Authentic Dialogue Excerpt */}
            <div className="p-3.5 rounded-xl bg-neutral-50/90 border border-neutral-200/60 text-xs space-y-2">
              <div className="text-neutral-500 font-mono text-[11px]">
                Caller: <span className="text-neutral-700 italic">"{industry.dialogueSnippet.caller}"</span>
              </div>
              <div className="text-emerald-700 font-mono text-[11px] pt-1 border-t border-neutral-200/40">
                Aura: <span className="text-neutral-900 font-sans font-medium">"{industry.dialogueSnippet.receptionist}"</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card Footer Metric & Action Button */}
        <div className="p-5 sm:p-6 pt-0 mt-2">
          <div className="pt-4 border-t border-neutral-100 flex items-center justify-between">
            <div>
              <div className="text-2xl font-editorial font-normal text-neutral-950">
                <AnimatedCounter
                  value={industry.statNum}
                  prefix={industry.statPrefix}
                  suffix={industry.statSuffix}
                  decimals={industry.statDecimals || 0}
                />
              </div>
              <div className="text-[11px] text-neutral-500 font-mono">
                {industry.statLabel}
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => onSelectCase(industry)}
              className="p-2.5 rounded-full bg-neutral-50 hover:bg-emerald-600 hover:text-white text-neutral-700 transition-colors border border-neutral-200 cursor-pointer shadow-2xs"
              title="View Full Case Study"
            >
              <ArrowRight className="w-4 h-4" />
            </motion.button>
          </div>
        </div>
      </SpotlightCard>
    </motion.div>
  );
};

// Tablet-Specific Clean Horizontal Industry Bar Component (No scroll animation/stacking)
const TabletIndustryBar: React.FC<{
  industry: IndustryItem;
  idx: number;
  total: number;
  onSelectCase: (industry: IndustryItem) => void;
}> = ({ industry, idx, total, onSelectCase }) => {
  // Alternate side: even indices (0, 2) image on Left; odd indices (1) image on Right
  const isReversed = idx % 2 === 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-20px' }}
      transition={{ duration: 0.45, delay: idx * 0.1, ease: 'easeOut' }}
      className="w-full"
    >
      <SpotlightCard
        spotlightColor="rgba(5, 150, 105, 0.14)"
        className={`rounded-3xl border border-neutral-200/90 bg-white/98 backdrop-blur-xl shadow-xs hover:shadow-md transition-all duration-300 overflow-hidden flex ${
          isReversed ? 'flex-row-reverse' : 'flex-row'
        } items-stretch ring-1 ring-black/5`}
      >
        {/* Media Thumbnail with Alternating Start Side */}
        <div className="relative w-64 shrink-0 overflow-hidden bg-neutral-900 group">
          <img
            src={industry.image}
            alt={industry.name}
            className="w-full h-full object-cover group-hover:scale-104 transition-transform duration-500 ease-out"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/20" />

          {/* Top Badges */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 backdrop-blur-md text-[11px] font-mono font-medium text-neutral-800 shadow-2xs">
              {industry.icon === 'clinic' && <Stethoscope className="w-3 h-3 text-emerald-600" />}
              {industry.icon === 'hotel' && <Building2 className="w-3 h-3 text-amber-600" />}
              {industry.icon === 'salon' && <Scissors className="w-3 h-3 text-rose-600" />}
              {industry.tag}
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          </div>

          {/* Bottom Metric */}
          <div className="absolute bottom-3 left-3 right-3">
            <span className="text-[10px] font-mono text-neutral-300 block uppercase tracking-wider">
              {industry.statLabel}
            </span>
            <span className="text-xl font-bold font-tech text-emerald-400 drop-shadow-xs">
              {industry.statNumber}
            </span>
          </div>
        </div>

        {/* Content Details */}
        <div className="flex-1 p-5 sm:p-6 flex flex-col justify-between space-y-3.5">
          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200/60 font-medium">
                    {industry.tag}
                  </span>
                  <span className="text-[10px] font-mono text-neutral-400">
                    Sector 0{idx + 1}
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-semibold text-neutral-900 tracking-tight mt-1">
                  {industry.name}
                </h3>
                <p className="text-xs text-neutral-500 font-mono mt-0.5">
                  {industry.subtitle}
                </p>
              </div>

              <span className="px-2.5 py-1 rounded-full bg-neutral-100 text-xs font-mono font-medium text-neutral-600 border border-neutral-200/80 shrink-0">
                0{idx + 1} / 0{total}
              </span>
            </div>

            <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed mt-2 line-clamp-2">
              {industry.description}
            </p>
          </div>

          {/* Persona & Dialogue Excerpt */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-2.5 rounded-xl bg-neutral-50/90 border border-neutral-200/70 text-xs flex flex-col justify-center">
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-neutral-500 uppercase tracking-wider mb-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Voice Persona</span>
              </div>
              <span className="text-xs font-medium text-emerald-900 font-sans truncate">
                {industry.voiceStyle}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-neutral-50/90 border border-neutral-200/70 text-xs">
              <span className="text-[10px] font-mono text-neutral-500 block mb-0.5">Caller Excerpt</span>
              <p className="text-neutral-700 italic truncate text-[11px]">
                "{industry.dialogueSnippet.caller}"
              </p>
            </div>
          </div>

          {/* Bottom Action Row */}
          <div className="pt-2.5 border-t border-neutral-200/60 flex items-center justify-between">
            <span className="text-xs font-mono text-emerald-700 font-medium">
              ✦ {industry.secondaryStat}
            </span>

            <button
              onClick={() => onSelectCase(industry)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-emerald-600 text-white text-xs font-medium transition-colors cursor-pointer shadow-2xs"
            >
              <span>Explore Case Study</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </SpotlightCard>
    </motion.div>
  );
};

export const IndustryShowcase: React.FC = () => {
  const [selectedCase, setSelectedCase] = useState<IndustryItem | null>(null);

  return (
    <section id="industries" className="py-24 md:py-32 bg-white border-t border-neutral-200/60 relative overflow-visible">
      {/* Subtle organic light accent behind cards */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] bg-gradient-to-tr from-emerald-100/30 via-neutral-100/30 to-transparent blur-3xl pointer-events-none rounded-full" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header - Consistent alignment & margins across sections */}
        <div className="max-w-3xl space-y-4">
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-20px' }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/60"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
            <span className="text-xs font-mono uppercase tracking-wider text-emerald-800 font-semibold">
              Specialized Verticals
            </span>
          </motion.div>

          <div className="text-3xl sm:text-4xl lg:text-5xl font-editorial font-normal tracking-tight text-neutral-950 text-balance">
            <BlurText
              text="Where every conversation matters."
              delay={35}
              className="font-editorial"
            />
          </div>
          <p className="text-base sm:text-lg text-neutral-600 font-sans leading-relaxed text-balance">
            In high-touch healthcare, boutique hospitality, and luxury studios, a call is never just a transaction. It is an authentic extension of your brand.
          </p>
        </div>

        {/* 1. Mobile (< 768px): Touch Swipable Industry Deck */}
        <div className="block md:hidden mt-8">
          <TouchSwipeDeck minHeightClass="min-h-[580px]">
            {INDUSTRIES.map((industry) => (
              <IndustryCard
                key={industry.id}
                industry={industry}
                idx={0}
                onSelectCase={setSelectedCase}
              />
            ))}
          </TouchSwipeDeck>
        </div>

        {/* 2. Tablet ONLY (768px - 1023px): Clean Alternating Horizontal Industry Bars */}
        <div className="hidden md:flex lg:hidden flex-col gap-6 mt-12">
          {INDUSTRIES.map((industry, idx) => (
            <TabletIndustryBar
              key={industry.id}
              industry={industry}
              idx={idx}
              total={INDUSTRIES.length}
              onSelectCase={setSelectedCase}
            />
          ))}
        </div>

        {/* 3. Desktop (≥ 1024px): 3-Column Comparative Vertical Grid */}
        <div className="hidden lg:grid lg:grid-cols-3 gap-8 mt-14">
          {INDUSTRIES.map((industry, idx) => (
            <IndustryCard
              key={industry.id}
              industry={industry}
              idx={idx}
              onSelectCase={setSelectedCase}
            />
          ))}
        </div>
      </div>

      {/* Case Study Detail Modal with AnimatePresence */}
      <AnimatePresence>
        {selectedCase && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedCase(null)}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.93, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.93, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 360, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-2xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-neutral-200 space-y-6 max-h-[90vh] overflow-y-auto"
            >
              <button
                onClick={() => setSelectedCase(null)}
                className="absolute top-5 right-5 p-2 rounded-full text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3">
                <img
                  src={selectedCase.image}
                  alt={selectedCase.name}
                  className="w-14 h-14 rounded-2xl object-cover border border-neutral-200 shadow-2xs"
                />
                <div>
                  <span className="text-xs font-mono text-emerald-700 uppercase tracking-wider font-semibold">
                    Deployment Case Study
                  </span>
                  <h3 className="text-2xl font-editorial font-normal text-neutral-900 leading-tight">
                    {selectedCase.name}
                  </h3>
                  <p className="text-xs font-mono text-neutral-500">
                    {selectedCase.subtitle}
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-100 italic text-sm text-neutral-700 leading-relaxed font-editorial">
                {selectedCase.quote}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-100">
                  <span className="text-[11px] text-neutral-500 font-mono block">Primary Metric</span>
                  <span className="text-3xl font-editorial text-neutral-900 block mt-1">
                    {selectedCase.statNumber}
                  </span>
                  <span className="text-xs text-neutral-600 mt-0.5 block">
                    {selectedCase.statLabel}
                  </span>
                </div>
                <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-100">
                  <span className="text-[11px] text-neutral-500 font-mono block">Operational Outcome</span>
                  <span className="text-lg font-semibold text-emerald-700 block mt-1">
                    {selectedCase.secondaryStat}
                  </span>
                  <span className="text-xs text-neutral-600 mt-0.5 block">
                    Audited across 90-day deployment
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-mono uppercase tracking-wider text-neutral-400 block">
                  Representative Voice Exchange
                </span>
                <div className="p-4 rounded-xl bg-neutral-900 text-white space-y-3 text-xs sm:text-sm">
                  <p className="text-neutral-300">
                    <span className="text-neutral-400 font-mono text-[11px] block">Caller:</span>
                    "{selectedCase.dialogueSnippet.caller}"
                  </p>
                  <p className="text-emerald-400 pt-2 border-t border-white/10">
                    <span className="text-emerald-300/70 font-mono text-[11px] block">Aura Receptionist:</span>
                    "{selectedCase.dialogueSnippet.receptionist}"
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2 text-xs text-neutral-500 font-mono">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Tested with real telephony infrastructure</span>
                </div>

                <button
                  onClick={() => setSelectedCase(null)}
                  className="px-5 py-2.5 rounded-full bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  Close Case Study
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};
