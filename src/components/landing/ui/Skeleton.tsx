import React from 'react';
import { motion } from 'motion/react';

interface SkeletonProps {
  className?: string;
  variant?: 'rectangular' | 'rounded' | 'circular' | 'text';
  animate?: boolean;
}

/**
 * Centralized Base Skeleton Component with Emerald-Tinted Shimmer Wave
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rounded',
  animate = true,
}) => {
  const variantStyles = {
    rectangular: 'rounded-none',
    rounded: 'rounded-xl',
    circular: 'rounded-full',
    text: 'rounded-md h-4 w-full',
  };

  return (
    <div
      className={`relative overflow-hidden bg-neutral-800/60 border border-emerald-500/10 ${variantStyles[variant]} ${className}`}
    >
      {animate && (
        <motion.div
          className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-emerald-500/15 to-transparent pointer-events-none"
          animate={{
            translateX: ['−100%', '200%'],
          }}
          transition={{
            repeat: Infinity,
            duration: 1.8,
            ease: 'easeInOut',
          }}
        />
      )}
    </div>
  );
};

/**
 * Industry Showcase Card Shimmering Emerald Skeleton
 */
export const IndustryCardSkeleton: React.FC<{ className?: string }> = ({
  className = '',
}) => {
  return (
    <div
      className={`rounded-3xl bg-[#141416]/95 border border-emerald-500/20 p-6 sm:p-7 shadow-2xl relative overflow-hidden flex flex-col justify-between select-none ${className}`}
    >
      {/* Background ambient emerald pulse */}
      <div className="absolute top-0 right-0 w-72 h-72 bg-radial from-emerald-500/10 to-transparent blur-3xl pointer-events-none" />

      {/* Shimmer sweep */}
      <motion.div
        className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-emerald-400/10 to-transparent pointer-events-none z-20"
        animate={{ translateX: ['-100%', '200%'] }}
        transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
      />

      <div className="space-y-5 relative z-10">
        {/* Top Header Image Skeleton */}
        <div className="relative w-full h-44 sm:h-48 rounded-2xl overflow-hidden bg-neutral-900 border border-emerald-500/20">
          <Skeleton className="w-full h-full rounded-2xl" />
          <div className="absolute top-3 left-3 flex gap-2">
            <Skeleton className="w-24 h-6 rounded-full bg-emerald-950/80 border border-emerald-500/30" />
          </div>
          <div className="absolute bottom-3 right-3">
            <Skeleton className="w-20 h-6 rounded-full bg-neutral-950/80" />
          </div>
        </div>

        {/* Title & Subtitle */}
        <div className="space-y-2">
          <Skeleton className="w-3/4 h-6 rounded-lg bg-neutral-800" />
          <Skeleton className="w-1/2 h-4 rounded-md bg-neutral-800/70" />
        </div>

        {/* Metric Ribbon Box */}
        <div className="p-3.5 rounded-2xl bg-neutral-900/80 border border-emerald-500/20 flex items-center justify-between">
          <div className="space-y-1">
            <Skeleton className="w-16 h-3 rounded-md bg-neutral-800" />
            <Skeleton className="w-24 h-6 rounded-md bg-emerald-900/40 border border-emerald-500/30" />
          </div>
          <Skeleton className="w-28 h-4 rounded-md bg-neutral-800" />
        </div>

        {/* Quote Placeholder */}
        <div className="p-3.5 rounded-2xl bg-neutral-900/50 border border-white/5 space-y-2">
          <Skeleton className="w-full h-3 rounded-md bg-neutral-800" />
          <Skeleton className="w-5/6 h-3 rounded-md bg-neutral-800" />
        </div>

        {/* Audio Waveform Skeleton Preview */}
        <div className="p-3 rounded-xl bg-black/40 border border-emerald-500/20 flex items-center gap-3">
          <Skeleton className="w-8 h-8 rounded-full bg-emerald-500/20 shrink-0" />
          <div className="flex-1 flex items-center gap-1.5 h-6">
            {[40, 75, 55, 90, 65, 80, 45, 95, 60, 85, 50, 70, 40, 65].map((h, i) => (
              <div
                key={i}
                style={{ height: `${h}%` }}
                className="flex-1 bg-emerald-500/30 rounded-full animate-pulse"
              />
            ))}
          </div>
          <Skeleton className="w-12 h-4 rounded-md bg-neutral-800" />
        </div>
      </div>

      {/* Footer Action */}
      <div className="pt-4 mt-4 border-t border-white/10 flex items-center justify-between">
        <Skeleton className="w-32 h-4 rounded-md bg-neutral-800" />
        <Skeleton className="w-28 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30" />
      </div>
    </div>
  );
};

/**
 * Comparison Card Shimmering Emerald Skeleton
 */
export const ComparisonCardSkeleton: React.FC<{
  type?: 'ai' | 'normal';
  className?: string;
}> = ({ type = 'ai', className = '' }) => {
  const isAi = type === 'ai';

  return (
    <div
      className={`h-full rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden flex flex-col justify-between select-none ${
        isAi
          ? 'bg-gradient-to-br from-[#0c1411] via-[#09100d] to-[#040806] border border-emerald-500/40'
          : 'bg-gradient-to-br from-[#171214] via-[#140e10] to-[#0c0809] border border-rose-900/30'
      } ${className}`}
    >
      {/* Radial ambient glow */}
      <div
        className={`absolute top-0 right-0 w-80 h-80 bg-radial blur-3xl pointer-events-none ${
          isAi ? 'from-emerald-500/15 via-emerald-500/05' : 'from-rose-500/10'
        } to-transparent`}
      />

      {/* Dynamic continuous shimmer wave */}
      <motion.div
        className={`absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent ${
          isAi ? 'via-emerald-400/15' : 'via-rose-400/10'
        } to-transparent pointer-events-none z-20`}
        animate={{ translateX: ['-100%', '200%'] }}
        transition={{ repeat: Infinity, duration: 2.0, ease: 'easeInOut' }}
      />

      <div className="relative z-10 space-y-6">
        {/* Card Header Skeleton */}
        <div
          className={`flex items-center justify-between gap-3 pb-5 border-b ${
            isAi ? 'border-emerald-500/20' : 'border-rose-900/30'
          }`}
        >
          <div className="flex items-center gap-3">
            <Skeleton
              className={`w-10 h-10 rounded-2xl ${
                isAi ? 'bg-emerald-500/20 border-emerald-500/40' : 'bg-rose-500/20 border-rose-500/30'
              }`}
            />
            <div className="space-y-1.5">
              <Skeleton className="w-36 h-5 rounded-lg bg-neutral-800" />
              <Skeleton className="w-48 h-3 rounded-md bg-neutral-800/60" />
            </div>
          </div>
          <Skeleton
            className={`w-24 h-6 rounded-full ${
              isAi ? 'bg-emerald-500/20 border-emerald-500/40' : 'bg-rose-500/20 border-rose-500/30'
            }`}
          />
        </div>

        {/* Metrics Strip Skeleton */}
        <div
          className={`grid grid-cols-3 gap-2.5 p-3 rounded-2xl ${
            isAi ? 'bg-emerald-950/30 border border-emerald-500/20' : 'bg-white/5 border border-rose-900/30'
          }`}
        >
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <Skeleton className="w-12 h-2.5 rounded bg-neutral-800" />
              <Skeleton
                className={`w-16 h-5 rounded ${isAi ? 'bg-emerald-900/50' : 'bg-rose-900/40'}`}
              />
            </div>
          ))}
        </div>

        {/* Dialogue / Transcript Skeleton */}
        <div
          className={`p-4 rounded-2xl space-y-3.5 ${
            isAi ? 'bg-black/40 border border-emerald-500/20' : 'bg-black/30 border border-rose-900/20'
          }`}
        >
          <div className="flex items-start gap-2.5">
            <Skeleton className="w-6 h-6 rounded-full bg-neutral-800 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="w-20 h-2.5 rounded bg-neutral-800" />
              <Skeleton className="w-full h-3.5 rounded bg-neutral-800/80" />
              <Skeleton className="w-4/5 h-3.5 rounded bg-neutral-800/80" />
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <Skeleton
              className={`w-6 h-6 rounded-full shrink-0 ${
                isAi ? 'bg-emerald-500/30' : 'bg-rose-500/30'
              }`}
            />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="w-28 h-2.5 rounded bg-neutral-800" />
              <Skeleton
                className={`w-full h-3.5 rounded ${
                  isAi ? 'bg-emerald-950/80 border border-emerald-500/20' : 'bg-neutral-800/80'
                }`}
              />
              <Skeleton
                className={`w-3/4 h-3.5 rounded ${
                  isAi ? 'bg-emerald-950/80 border border-emerald-500/20' : 'bg-neutral-800/80'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Live Audio Visualizer Bar Skeleton */}
        <div
          className={`p-3 rounded-xl flex items-center justify-between gap-3 ${
            isAi ? 'bg-emerald-950/20 border border-emerald-500/20' : 'bg-black/20 border border-white/5'
          }`}
        >
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isAi ? 'bg-emerald-400 animate-ping' : 'bg-rose-400'
              }`}
            />
            <Skeleton className="w-24 h-3 rounded bg-neutral-800" />
          </div>
          <Skeleton
            className={`w-20 h-5 rounded-full ${
              isAi ? 'bg-emerald-500/20 border-emerald-500/30' : 'bg-neutral-800'
            }`}
          />
        </div>
      </div>

      {/* Footer Status Bar */}
      <div
        className={`pt-4 mt-6 border-t flex items-center justify-between ${
          isAi ? 'border-emerald-500/20' : 'border-rose-900/30'
        }`}
      >
        <Skeleton className="w-36 h-4 rounded bg-neutral-800" />
        <Skeleton
          className={`w-28 h-7 rounded-xl ${
            isAi ? 'bg-emerald-500/25 border-emerald-500/30' : 'bg-white/10'
          }`}
        />
      </div>
    </div>
  );
};
