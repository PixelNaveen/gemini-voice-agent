import React from 'react';
import { motion } from 'motion/react';
import { Clock, Brain, CalendarCheck, ArrowRight, Check } from 'lucide-react';
import { SpotlightCard } from './motion/SpotlightCard.tsx';
import { BlurText } from './motion/BlurText.tsx';
import { AnimatedCounter } from './motion/AnimatedCounter.tsx';
import { TouchSwipeDeck } from './motion/TouchSwipeDeck.tsx';

interface PrincipleCardProps {
  number: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  bullets: string[];
  metricNum: number;
  metricPrefix?: string;
  metricSuffix?: string;
  metricDecimals?: number;
  metricLabel: string;
  delay?: number;
}

const PrincipleCard: React.FC<PrincipleCardProps> = ({
  number,
  title,
  description,
  icon,
  bullets,
  metricNum,
  metricPrefix = '',
  metricSuffix = '',
  metricDecimals = 0,
  metricLabel,
  delay = 0,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ y: -6 }}
      className="h-full"
    >
      <SpotlightCard
        spotlightColor="rgba(5, 150, 105, 0.1)"
        className="group h-full bg-white border border-neutral-200/90 rounded-2xl p-5 sm:p-6 lg:p-7 transition-all duration-300 shadow-2xs hover:shadow-[0_20px_40px_rgba(0,0,0,0.07)] flex flex-col justify-between"
      >
        {/* Top index & icon */}
        <div>
          <div className="flex items-center justify-between pb-6 border-b border-neutral-100">
            <span className="text-3xl font-editorial font-light text-neutral-400 group-hover:text-neutral-900 transition-colors">
              {number}
            </span>
            <div className="w-10 h-10 rounded-xl bg-neutral-50 group-hover:bg-emerald-50 text-neutral-600 group-hover:text-emerald-700 transition-colors flex items-center justify-center border border-neutral-100">
              {icon}
            </div>
          </div>

          {/* Title & Description */}
          <div className="pt-6 space-y-3">
            <h3 className="text-xl font-semibold text-neutral-900 tracking-tight">
              {title}
            </h3>
            <p className="text-sm text-neutral-600 leading-relaxed">
              {description}
            </p>
          </div>

          {/* Feature bullets */}
          <div className="mt-6 pt-5 border-t border-neutral-100 space-y-2.5">
            {bullets.map((bullet, idx) => (
              <div key={idx} className="flex items-center gap-2.5 text-xs text-neutral-600">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>{bullet}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Proof metric with AnimatedCounter */}
        <div className="mt-8 pt-4 border-t border-neutral-100 flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold font-mono text-neutral-900">
              <AnimatedCounter
                value={metricNum}
                prefix={metricPrefix}
                suffix={metricSuffix}
                decimals={metricDecimals}
              />
            </div>
            <div className="text-[11px] text-neutral-500 font-mono">
              {metricLabel}
            </div>
          </div>
          <span className="text-xs font-medium text-emerald-700 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            Explore <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </SpotlightCard>
    </motion.div>
  );
};

const PRINCIPLES_DATA = [
  {
    number: "01",
    title: "24/7 Availability",
    description: "An omnipresent front desk. Whether a customer dials at 2 AM or 2 PM, the Aura AI receptionist answers immediately without hold music or voicemail drops.",
    icon: <Clock className="w-5 h-5" />,
    bullets: [
      "Zero hold queues or busy signals",
      "Unlimited parallel call handling",
      "Holiday & emergency coverage",
    ],
    metricNum: 0.4,
    metricSuffix: "s",
    metricDecimals: 1,
    metricLabel: "Average pickup time",
  },
  {
    number: "02",
    title: "Instant Comprehension",
    description: "Understands complex multi-layered requests, colloquial phrases, and ambient background chatter without forcing callers into frustrating touch-tone IVR labyrinths.",
    icon: <Brain className="w-5 h-5" />,
    bullets: [
      "Full-duplex natural interruption",
      "Multi-dialect acoustic robustness",
      "Conversational clarifying questions",
    ],
    metricNum: 98.7,
    metricSuffix: "%",
    metricDecimals: 1,
    metricLabel: "Intent accuracy",
  },
  {
    number: "03",
    title: "Seamless Booking",
    description: "Direct bi-directional integration into EHRs, booking engines, and calendars to confirm appointments instantaneously, collect deposits, and send SMS confirmations.",
    icon: <CalendarCheck className="w-5 h-5" />,
    bullets: [
      "Instant calendar hold & conflict check",
      "Stripe deposit dispatch via SMS",
      "Two-way patient & client sync",
    ],
    metricNum: 100,
    metricSuffix: "%",
    metricLabel: "Direct calendar sync",
  },
];

export const CorePrinciples: React.FC = () => {
  return (
    <section id="principles" className="py-24 md:py-32 bg-[#FBF9F8] border-t border-neutral-200/60 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl space-y-4">
          <motion.span
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="text-xs font-mono uppercase tracking-wider text-emerald-700 font-semibold"
          >
            Core Design Philosophy
          </motion.span>
          <div className="text-3xl sm:text-4xl lg:text-5xl font-editorial font-normal tracking-tight text-neutral-950 text-balance">
            <BlurText
              text="Every customer deserves an answer."
              delay={40}
              className="font-editorial"
            />
          </div>
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-base sm:text-lg text-neutral-600 font-sans leading-relaxed text-balance"
          >
            Behind every call is a person looking for care, assistance, or urgent scheduling. We eliminate missed connections so human teams can focus on what matters most.
          </motion.p>
        </div>

        {/* Mobile Swipable Cards Deck */}
        <div className="block md:hidden mt-8">
          <TouchSwipeDeck minHeightClass="min-h-[460px]">
            {PRINCIPLES_DATA.map((item) => (
              <PrincipleCard
                key={item.number}
                number={item.number}
                title={item.title}
                description={item.description}
                icon={item.icon}
                bullets={item.bullets}
                metricNum={item.metricNum}
                metricSuffix={item.metricSuffix}
                metricDecimals={item.metricDecimals}
                metricLabel={item.metricLabel}
                delay={0}
              />
            ))}
          </TouchSwipeDeck>
        </div>

        {/* Tablet & Desktop Grid */}
        <div className="hidden md:grid md:grid-cols-3 gap-5 lg:gap-8 mt-12 lg:mt-14">
          {PRINCIPLES_DATA.map((item, idx) => (
            <PrincipleCard
              key={item.number}
              number={item.number}
              title={item.title}
              description={item.description}
              icon={item.icon}
              bullets={item.bullets}
              metricNum={item.metricNum}
              metricSuffix={item.metricSuffix}
              metricDecimals={item.metricDecimals}
              metricLabel={item.metricLabel}
              delay={idx * 0.1}
            />
          ))}
        </div>
      </div>
    </section>
  );
};
