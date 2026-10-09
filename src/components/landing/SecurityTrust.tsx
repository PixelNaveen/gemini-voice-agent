import React from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, Lock, Activity, Users, FileCheck, Check, Server } from 'lucide-react';
import { BlurText } from './motion/BlurText.tsx';
import { SpotlightCard } from './motion/SpotlightCard.tsx';
import { TouchSwipeDeck } from './motion/TouchSwipeDeck.tsx';

interface SecurityFeature {
  title: string;
  description: string;
  badge: string;
  icon: React.ReactNode;
}

const SECURITY_ITEMS: SecurityFeature[] = [
  {
    title: 'Zero Voice Training Guarantee',
    description:
      'Your customer call audio and transcripts are never fed into public foundation models. Your business data remains strictly isolated in your air-gapped tenant.',
    badge: 'Confidentiality',
    icon: <Lock className="w-5 h-5 text-emerald-700" />,
  },
  {
    title: 'HIPAA & GDPR Enforced',
    description:
      'We sign Business Associate Agreements (BAAs) with all medical clients. Full Protected Health Information (PHI) encryption in transit (TLS 1.3) and at rest (AES-256).',
    badge: 'Healthcare Grade',
    icon: <ShieldCheck className="w-5 h-5 text-emerald-700" />,
  },
  {
    title: 'SOC 2 Type II Certified',
    description:
      'Independently audited by top security firms across security, availability, and confidentiality trust principles. Continuous automated compliance monitoring.',
    badge: 'Institutional Audit',
    icon: <FileCheck className="w-5 h-5 text-emerald-700" />,
  },
  {
    title: '99.99% Carrier-Grade SLA',
    description:
      'Multi-region redundant telephony routing across primary carriers (Twilio, Bandwidth, Telnyx). Automatic zero-downtime failover ensures calls never ring out.',
    badge: 'High Availability',
    icon: <Activity className="w-5 h-5 text-emerald-700" />,
  },
  {
    title: 'Instant Human Hot-Transfer',
    description:
      'Configurable safety guardrails automatically transfer callers to on-duty human staff when emergency distress phrases or high frustration signals are detected.',
    badge: 'Fail-Safe Guardrails',
    icon: <Users className="w-5 h-5 text-emerald-700" />,
  },
  {
    title: 'Full Telemetry & Audit Logs',
    description:
      'Comprehensive call recording, real-time transcription, and latency logs accessible via enterprise portal or exported directly to your compliance data lake.',
    badge: 'Observability',
    icon: <Server className="w-5 h-5 text-emerald-700" />,
  },
];

const SecurityCard: React.FC<{ item: SecurityFeature; idx?: number }> = ({ item, idx = 0 }) => {
  return (
    <SpotlightCard
      spotlightColor="rgba(5, 150, 105, 0.08)"
      className="h-full p-6 sm:p-7 rounded-2xl bg-white border border-neutral-200/80 shadow-2xs hover:shadow-md transition-all duration-300 space-y-4 flex flex-col justify-between"
    >
      <div>
        <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
          <div className="w-10 h-10 rounded-xl bg-emerald-50/70 border border-emerald-100 flex items-center justify-center">
            {item.icon}
          </div>
          <span className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider">
            {item.badge}
          </span>
        </div>

        <h3 className="text-lg font-semibold text-neutral-900 tracking-tight mt-4">
          {item.title}
        </h3>
        <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed mt-2">
          {item.description}
        </p>
      </div>

      <div className="pt-3 border-t border-neutral-100 flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
        <Check className="w-3.5 h-3.5 text-emerald-600" />
        <span>Verified Compliance</span>
      </div>
    </SpotlightCard>
  );
};

export const SecurityTrust: React.FC = () => {
  return (
    <section id="security" className="py-24 md:py-32 bg-[#FBF9F8] border-t border-neutral-200/60 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl space-y-4">
          <motion.span
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="text-xs font-mono uppercase tracking-wider text-emerald-700 font-semibold"
          >
            Enterprise Security
          </motion.span>
          <div className="text-3xl sm:text-4xl lg:text-5xl font-editorial font-normal tracking-tight text-neutral-950 text-balance">
            <BlurText
              text="Built for businesses where trust is non-negotiable."
              delay={40}
              className="font-editorial"
            />
          </div>
          <p className="text-base sm:text-lg text-neutral-600 font-sans leading-relaxed text-balance">
            Engineered to institutional standards with airtight data privacy, verifiable regulatory compliance, and redundant telemetric failovers.
          </p>
        </div>

        {/* Swipable Security Cards Carousel — arrow navigation on all devices */}
        <div className="mt-8 sm:mt-12 lg:mt-14">
          <TouchSwipeDeck
            minHeightClass="min-h-[360px] sm:min-h-[380px]"
            desktopItemsPerView={3}
            showHint={false}
          >
            {SECURITY_ITEMS.map((item, idx) => (
              <SecurityCard key={idx} item={item} idx={idx} />
            ))}
          </TouchSwipeDeck>
        </div>
      </div>
    </section>
  );
};
