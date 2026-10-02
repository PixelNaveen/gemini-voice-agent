import React, { useState } from 'react';
import { motion, type Variants } from 'motion/react';
import { Check, Calculator } from 'lucide-react';
import { PricingPlan } from '../../types/landing.types.ts';
import { BlurText } from './motion/BlurText.tsx';
import { BorderBeam } from './motion/BorderBeam.tsx';
import { SpotlightCard } from './motion/SpotlightCard.tsx';
import { ShinyButton } from './motion/ShinyButton.tsx';
import { AnimatedCounter } from './motion/AnimatedCounter.tsx';
import { TouchSwipeDeck } from './motion/TouchSwipeDeck.tsx';

interface PricingProps {
  onSelectPlan: (planName: string) => void;
}

export const Pricing: React.FC<PricingProps> = ({ onSelectPlan }) => {
  const [isAnnual, setIsAnnual] = useState(true);

  // Interactive ROI Calculator State
  const [missedCallsPerWeek, setMissedCallsPerWeek] = useState(12);
  const [avgCustomerValue, setAvgCustomerValue] = useState(250);

  const recoveredCallsPerMonth = Math.round(missedCallsPerWeek * 4.3 * 0.45);
  const recoveredRevenue = recoveredCallsPerMonth * avgCustomerValue;

  const plans: PricingPlan[] = [
    {
      id: 'starter',
      name: 'Starter Plan',
      priceMonthly: 349,
      priceAnnual: 299,
      period: '/month',
      description: 'Ideal for single-location studios and boutique medical practices.',
      features: [
        'Up to 500 autonomous minutes/mo',
        'Single calendar & EHR sync (Google/Outlook)',
        'Standard SMS confirmation dispatch',
        'Business hours & weekend coverage',
        'Standard vocal warmth persona',
      ],
      ctaText: 'Deploy Starter',
    },
    {
      id: 'professional',
      name: 'Professional Plan',
      priceMonthly: 799,
      priceAnnual: 699,
      period: '/month',
      isPopular: true,
      description: 'Engineered for busy clinical practices, high-end salons, and boutique hotels.',
      features: [
        'Up to 2,000 autonomous minutes/mo',
        'Multi-line concurrent call handling (up to 20)',
        'Full EHR/PMS 2-way read/write integration',
        'Stripe SMS deposit link collection',
        'Custom institutional knowledge vector ingestion',
        'Warm human fail-safe transfer routing',
      ],
      ctaText: 'Deploy Professional',
    },
    {
      id: 'enterprise',
      name: 'Custom Enterprise',
      priceMonthly: 0,
      priceAnnual: 0,
      period: '',
      description: 'For hospital networks, hotel groups, and multi-location franchises.',
      features: [
        'Unlimited autonomous inbound capacity',
        'Custom fine-tuned proprietary voice timbre',
        'Dedicated enterprise SLA (99.99%)',
        'On-premise or sovereign cloud hosting',
        'Custom EHR/EMR HL7 & FHIR pipeline',
        'Named 24/7 technical success manager',
      ],
      ctaText: 'Contact Enterprise Team',
    },
  ];

  // Professional, Calm Motion Variants (smooth elevation prioritizing mobile responsiveness)
  const cardVariants: Variants = {
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
    <section id="pricing" className="py-24 md:py-32 bg-white border-t border-neutral-200/60 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <motion.span
            initial={{ opacity: 0, y: -10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-xs font-mono uppercase tracking-wider text-emerald-700 font-semibold"
          >
            Predictable Investment
          </motion.span>
          <div className="text-3xl sm:text-4xl lg:text-5xl font-editorial font-normal tracking-tight text-neutral-950 text-balance">
            <BlurText
              text="Less than the cost of one missed booking."
              delay={40}
              className="font-editorial justify-center"
            />
          </div>
          <p className="text-base sm:text-lg text-neutral-600 font-sans leading-relaxed text-balance">
            Simple monthly plans with zero per-minute penalty fees and carrier-grade reliability.
          </p>

          {/* Billing Switcher with spring toggle */}
          <div className="pt-4 flex items-center justify-center gap-3">
            <span
              className={`text-xs font-medium cursor-pointer transition-colors ${
                !isAnnual ? 'text-neutral-900 font-semibold' : 'text-neutral-500'
              }`}
              onClick={() => setIsAnnual(false)}
            >
              Monthly Billing
            </span>
            <button
              onClick={() => setIsAnnual(!isAnnual)}
              className="relative w-12 h-6 rounded-full bg-neutral-900 transition-colors cursor-pointer p-0.5"
              aria-label="Toggle billing duration"
            >
              <motion.div
                layout
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className={`w-5 h-5 rounded-full bg-white ${
                  isAnnual ? 'ml-auto' : 'mr-auto'
                }`}
              />
            </button>
            <span
              className={`text-xs font-medium cursor-pointer flex items-center gap-1.5 transition-colors ${
                isAnnual ? 'text-neutral-900 font-semibold' : 'text-neutral-500'
              }`}
              onClick={() => setIsAnnual(true)}
            >
              <span>Annual Billing</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-100 text-emerald-800 font-medium">
                Save 20%
              </span>
            </span>
          </div>
        </div>

        {/* Mobile Swipable Pricing Deck */}
        <div className="block md:hidden mt-8">
          <TouchSwipeDeck minHeightClass="min-h-[580px]">
            {plans.map((plan) => {
              const price = isAnnual ? plan.priceAnnual : plan.priceMonthly;
              const isCustom = plan.id === 'enterprise';

              return (
                <div
                  key={plan.id}
                  className={`h-full rounded-3xl p-6 sm:p-7 transition-shadow duration-300 flex flex-col justify-between relative overflow-hidden ${
                    plan.isPopular
                      ? 'bg-neutral-950 text-white shadow-2xl ring-2 ring-emerald-accent'
                      : 'bg-[#FAFAFA] border border-neutral-200/90 text-neutral-900 shadow-2xs'
                  }`}
                >
                  {plan.isPopular && (
                    <>
                      <BorderBeam size={220} duration={10} />
                      <div className="absolute top-0 right-0 px-4 py-1 rounded-bl-xl bg-emerald-accent text-white text-[10px] font-mono font-semibold tracking-wider uppercase shadow-xs">
                        Most Popular
                      </div>
                    </>
                  )}

                  <div>
                    <h3 className="text-xl font-semibold tracking-tight">
                      {plan.name}
                    </h3>

                    <p
                      className={`text-xs mt-2 leading-relaxed ${
                        plan.isPopular ? 'text-neutral-400' : 'text-neutral-500'
                      }`}
                    >
                      {plan.description}
                    </p>

                    <div className="mt-5 pb-5 border-b border-neutral-200/20">
                      {isCustom ? (
                        <div className="text-3xl font-editorial font-normal">
                          Custom
                        </div>
                      ) : (
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl font-editorial font-normal">
                            ${price}
                          </span>
                          <span
                            className={`text-xs font-mono ${
                              plan.isPopular ? 'text-neutral-400' : 'text-neutral-500'
                            }`}
                          >
                            {plan.period}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Feature list */}
                    <div className="mt-5 space-y-2.5">
                      <span
                        className={`text-xs font-mono uppercase tracking-wider block ${
                          plan.isPopular ? 'text-emerald-400' : 'text-neutral-400'
                        }`}
                      >
                        Included Capabilities:
                      </span>
                      {plan.features.map((feature, fIdx) => (
                        <div key={fIdx} className="flex items-start gap-2 text-xs">
                          <Check
                            className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                              plan.isPopular ? 'text-emerald-400' : 'text-emerald-600'
                            }`}
                          />
                          <span
                            className={
                              plan.isPopular ? 'text-neutral-200' : 'text-neutral-700'
                            }
                          >
                            {feature}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6 pt-3">
                    <ShinyButton
                      variant={plan.isPopular ? 'primary' : 'dark'}
                      onClick={() => onSelectPlan(plan.name)}
                      className="w-full py-3 text-xs"
                    >
                      {plan.ctaText}
                    </ShinyButton>
                  </div>
                </div>
              );
            })}
          </TouchSwipeDeck>
        </div>

        {/* Tablet & Desktop Pricing Cards Grid */}
        <div className="hidden md:grid md:grid-cols-3 gap-5 lg:gap-8 mt-12 lg:mt-14 items-stretch">
          {plans.map((plan, idx) => {
            const price = isAnnual ? plan.priceAnnual : plan.priceMonthly;
            const isCustom = plan.id === 'enterprise';

            return (
              <motion.div
                key={plan.id}
                custom={idx}
                initial={{ opacity: 0, y: 25 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                variants={cardVariants}
                whileHover="whileHover"
                whileTap="whileTap"
                className="h-full cursor-pointer select-none"
              >
                <div
                  className={`h-full rounded-3xl p-6 sm:p-7 lg:p-8 transition-shadow duration-300 flex flex-col justify-between relative overflow-hidden ${
                    plan.isPopular
                      ? 'bg-neutral-950 text-white shadow-2xl ring-2 ring-emerald-accent'
                      : 'bg-[#FAFAFA] border border-neutral-200/90 text-neutral-900 shadow-2xs hover:shadow-xl'
                  }`}
                >
                  {plan.isPopular && (
                    <>
                      <BorderBeam size={220} duration={10} />
                      <div className="absolute top-0 right-0 px-4 py-1 rounded-bl-xl bg-emerald-accent text-white text-[10px] font-mono font-semibold tracking-wider uppercase shadow-xs">
                        Most Popular
                      </div>
                    </>
                  )}

                  <div>
                    <h3 className="text-xl font-semibold tracking-tight">
                      {plan.name}
                    </h3>

                    <p
                      className={`text-xs mt-2 leading-relaxed ${
                        plan.isPopular ? 'text-neutral-400' : 'text-neutral-500'
                      }`}
                    >
                      {plan.description}
                    </p>

                    <div className="mt-6 pb-6 border-b border-neutral-200/20">
                      {isCustom ? (
                        <div className="text-3xl font-editorial font-normal">
                          Custom
                        </div>
                      ) : (
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl font-editorial font-normal">
                            ${price}
                          </span>
                          <span
                            className={`text-xs font-mono ${
                              plan.isPopular ? 'text-neutral-400' : 'text-neutral-500'
                            }`}
                          >
                            {plan.period}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Feature list */}
                    <div className="mt-6 space-y-3">
                      <span
                        className={`text-xs font-mono uppercase tracking-wider block ${
                          plan.isPopular ? 'text-emerald-400' : 'text-neutral-400'
                        }`}
                      >
                        Included Capabilities:
                      </span>
                      {plan.features.map((feature, fIdx) => (
                        <div key={fIdx} className="flex items-start gap-2.5 text-xs">
                          <Check
                            className={`w-4 h-4 shrink-0 mt-0.5 ${
                              plan.isPopular ? 'text-emerald-400' : 'text-emerald-600'
                            }`}
                          />
                          <span
                            className={
                              plan.isPopular ? 'text-neutral-200' : 'text-neutral-700'
                            }
                          >
                            {feature}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-8 pt-4">
                    <ShinyButton
                      variant={plan.isPopular ? 'primary' : 'dark'}
                      onClick={() => onSelectPlan(plan.name)}
                      className="w-full py-3 text-xs"
                    >
                      {plan.ctaText}
                    </ShinyButton>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Interactive ROI Calculator Module */}
        <div className="mt-16 max-w-4xl mx-auto rounded-3xl glass-panel p-8 shadow-xs relative overflow-hidden">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-emerald-700 font-semibold mb-2">
            <Calculator className="w-4 h-4" />
            <span>Interactive ROI Calculator</span>
          </div>

          <h3 className="text-2xl font-editorial font-normal text-neutral-900">
            Calculate your practice’s recovered revenue.
          </h3>
          <p className="text-xs sm:text-sm text-neutral-600 mt-1">
            See how much revenue Aura captures by eliminating missed calls and busy hold times.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
            <div className="space-y-5">
              <div>
                <div className="flex justify-between text-xs font-medium text-neutral-700 mb-2">
                  <span>Estimated missed calls / week:</span>
                  <span className="font-mono font-bold text-neutral-900">{missedCallsPerWeek} calls</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="60"
                  value={missedCallsPerWeek}
                  onChange={(e) => setMissedCallsPerWeek(Number(e.target.value))}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium text-neutral-700 mb-2">
                  <span>Average client / appointment value:</span>
                  <span className="font-mono font-bold text-neutral-900">${avgCustomerValue}</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="1500"
                  step="25"
                  value={avgCustomerValue}
                  onChange={(e) => setAvgCustomerValue(Number(e.target.value))}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-neutral-900 text-white flex flex-col justify-between shadow-xl">
              <div>
                <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider block">
                  Estimated Monthly Recovered Revenue
                </span>
                <div className="text-4xl font-editorial font-normal text-emerald-400 mt-2">
                  +${recoveredRevenue.toLocaleString()}{' '}
                  <span className="text-xs text-neutral-400 font-mono">/month</span>
                </div>
                <p className="text-xs text-neutral-400 mt-1">
                  Based on ~{recoveredCallsPerMonth} recaptured bookings each month.
                </p>
              </div>

              <div className="pt-4 border-t border-neutral-800 text-xs font-mono text-neutral-300 flex items-center justify-between">
                <span>Net ROI vs Professional:</span>
                <span className="text-emerald-400 font-semibold">
                  ~{Math.round((recoveredRevenue / 699) * 10) / 10}x Return
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
