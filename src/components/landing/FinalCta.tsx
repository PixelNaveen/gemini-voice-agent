import React from 'react';
import { motion } from 'motion/react';
import { Phone, ArrowUpRight, ShieldCheck, Zap, Lock } from 'lucide-react';
import { ThreeVoiceOrb } from './ThreeVoiceOrb.tsx';
import { BlurText } from './motion/BlurText.tsx';
import { ShinyButton } from './motion/ShinyButton.tsx';
import { CursorSpotlight } from './motion/CursorSpotlight.tsx';

interface FinalCtaProps {
  onOpenCallModal: () => void;
  onOpenDemoModal: () => void;
}

export const FinalCta: React.FC<FinalCtaProps> = ({ onOpenCallModal, onOpenDemoModal }) => {
  return (
    <section className="relative py-24 md:py-32 bg-[#0B0B0B] text-white overflow-hidden border-t border-white/10">
      {/* Cursor-tracking spotlight layer */}
      <CursorSpotlight size={750} color="rgba(5, 150, 105, 0.2)" />

      {/* Three.js 3D Voice Orb in Center Backdrop */}
      <div className="absolute inset-0 flex items-center justify-center opacity-75 pointer-events-none">
        <ThreeVoiceOrb size={460} isActive={true} />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
        <div className="max-w-4xl mx-auto space-y-6">
        {/* Status Pill */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-xs font-mono text-emerald-400"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Immediate Deployment Ready</span>
        </motion.div>

        {/* Cinematic Headline with BlurText */}
        <div className="text-4xl sm:text-6xl lg:text-7xl font-editorial font-normal tracking-tight text-white leading-tight text-balance">
          <BlurText
            text="Your next employee is"
            delay={40}
            className="font-editorial text-white justify-center"
          />{' '}
          <span className="italic font-normal underline decoration-emerald-500/60 decoration-wavy decoration-2 underline-offset-8">
            already here.
          </span>
        </div>

        {/* Subhead */}
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-base sm:text-xl text-neutral-400 font-sans max-w-2xl mx-auto leading-relaxed text-balance"
        >
          Experience the calm of knowing every single customer call is answered with care, accuracy, and executive presence.
        </motion.p>

        {/* CTA Buttons with ShinyButton */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <ShinyButton
            variant="primary"
            onClick={onOpenCallModal}
            className="w-full sm:w-auto px-8 py-4 text-sm font-medium shadow-xl"
          >
            <Phone className="w-4 h-4 text-emerald-200" />
            <span>Talk to Receptionist Now</span>
          </ShinyButton>

          <ShinyButton
            variant="outline"
            onClick={onOpenDemoModal}
            className="w-full sm:w-auto px-7 py-4 text-sm font-medium"
          >
            <span>Request Enterprise Demo</span>
            <ArrowUpRight className="w-4 h-4 text-neutral-300" />
          </ShinyButton>
        </motion.div>

        {/* Subtle trust footer */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="pt-10 flex flex-wrap items-center justify-center gap-3 sm:gap-6 text-xs text-neutral-400 font-mono"
        >
          <span className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Forward in 15 minutes</span>
          </span>
          <span className="hidden sm:inline text-neutral-700">·</span>
          <span className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>HIPAA & SOC 2 certified</span>
          </span>
          <span className="hidden sm:inline text-neutral-700">·</span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Zero hardware required</span>
          </span>
        </motion.div>
        </div>
      </div>
    </section>
  );
};
