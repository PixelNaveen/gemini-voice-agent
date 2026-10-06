import React from 'react';
import { motion, Variants } from 'motion/react';
import { Phone, ArrowRight } from 'lucide-react';
import { HeroReceptionist3DCard } from './HeroReceptionist3DCard.tsx';
import { HeroParticles } from './HeroParticles.tsx';
import { ShinyButton } from './motion/ShinyButton.tsx';
import { AuroraGlow } from './motion/AuroraGlow.tsx';

interface HeroProps {
  onOpenCallModal: () => void;
  onOpenDemoModal: () => void;
}

// Stagger container orchestrating child animations with editorial cadence
const heroContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.06,
    },
  },
};

// Item variant for individual text and UI elements
const heroItemVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
    filter: 'blur(6px)',
  },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      duration: 0.7,
      ease: [0.16, 1, 0.3, 1], // silky high-end cubic-bezier
    },
  },
};

// Distinct word stagger variants for the headline reveal
const wordContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.05,
    },
  },
};

const wordVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
    filter: 'blur(4px)',
  },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      duration: 0.65,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

export const Hero: React.FC<HeroProps> = ({
  onOpenCallModal,
  onOpenDemoModal,
}) => {
  return (
    <section className="relative pt-24 pb-12 sm:pt-28 sm:pb-16 md:pt-32 md:pb-20 lg:pt-36 lg:pb-24 overflow-hidden">
      {/* Interactive tsParticles Digital Intelligence Background */}
      <HeroParticles />

      {/* Aurora Ambient Background (ReactBits inspired) */}
      <AuroraGlow />

      {/* Subtle architectural dot grid pattern */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(#d1d5db_1px,transparent_1px)] [background-size:24px_24px] opacity-35 mask-[radial-gradient(ellipse_60%_50%_at_50%_35%,#000_70%,transparent_100%)] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 sm:gap-10 md:gap-12 lg:gap-8 items-center">
          {/* Left Column: Staggered-in Editorial Headline, Description & Actions */}
          <motion.div
            variants={heroContainerVariants}
            initial="hidden"
            animate="visible"
            className="lg:col-span-6 space-y-5 sm:space-y-6 md:space-y-7 text-center lg:text-left max-w-2xl mx-auto lg:mx-0"
          >
            {/* Main Headline: Staggered-in Kinetic Reveal */}
            <motion.div
              variants={heroItemVariants}
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-editorial font-normal tracking-tight text-neutral-950 leading-[1.08] text-balance"
            >
              <motion.span
                variants={wordContainerVariants}
                className="inline-block"
              >
                {['Your', 'customers', 'are'].map((word, i) => (
                  <motion.span
                    key={i}
                    variants={wordVariants}
                    className="inline-block mr-2.5 sm:mr-3.5 lg:mr-4 origin-bottom"
                  >
                    {word}
                  </motion.span>
                ))}
              </motion.span>{' '}
              <motion.span
                variants={wordVariants}
                className="italic font-normal underline decoration-emerald-accent/40 decoration-wavy decoration-2 underline-offset-8 inline-block origin-bottom"
              >
                always heard.
              </motion.span>
            </motion.div>

            {/* 3. Description Paragraph: Staggered Reveal */}
            <motion.p
              variants={heroItemVariants}
              className="text-base sm:text-lg lg:text-xl text-neutral-600 font-sans leading-relaxed max-w-xl mx-auto lg:mx-0 text-balance"
            >
              An autonomous AI receptionist that answers calls, books appointments, and elevates your business days and nights 24/7 with authentic human voice.
            </motion.p>

            {/* 4. Action CTAs with Subtle Press-Down Scale */}
            <motion.div
              variants={heroItemVariants}
              className="pt-1 sm:pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3 sm:gap-3.5"
            >
              <ShinyButton
                variant="primary"
                onClick={onOpenCallModal}
                className="px-6 sm:px-7 py-3.5 text-sm font-medium shadow-md"
              >
                <Phone className="w-4 h-4 text-emerald-200 transition-transform group-hover:rotate-12" />
                <span>Talk to Receptionist</span>
              </ShinyButton>

              <ShinyButton
                variant="secondary"
                onClick={onOpenDemoModal}
                className="px-5 sm:px-6 py-3.5 text-sm font-medium"
              >
                <span>Experience Live Sandbox</span>
                <ArrowRight className="w-4 h-4 text-neutral-500 transition-transform group-hover:translate-x-1" />
              </ShinyButton>
            </motion.div>
          </motion.div>

          {/* Right Column: Floating 3D AI Receptionist Interface */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.85, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-6 flex justify-center lg:justify-end w-full mt-4 lg:mt-0"
          >
            <HeroReceptionist3DCard />
          </motion.div>
        </div>
      </div>
    </section>
  );
};
