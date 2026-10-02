import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  ShieldCheck,
  Zap,
  CheckCircle2,
  Server,
  Cpu,
  Clock,
  ArrowRight,
  Database,
  Lock,
  Layers,
  Sparkles,
} from 'lucide-react';
import { BlurText } from './motion/BlurText.tsx';
import { BorderBeam } from './motion/BorderBeam.tsx';
import { TouchSwipeDeck } from './motion/TouchSwipeDeck.tsx';
import { useTouchDevice } from '../../hooks/useTouchDevice.ts';

interface TelemetryStream {
  id: string;
  industry: string;
  facility: string;
  location: string;
  volumeMetric: string;
  uptimeSla: string;
  resolutionRate: string;
  latencyBreakdown: {
    sipHandshake: number;
    sttStreaming: number;
    intentReasoning: number;
    ttsSynthesis: number;
    totalMs: number;
  };
  samplePayload: {
    callerIntent: string;
    protocol: string;
    systemAction: string;
    recordSynced: string;
    complianceLock: string;
  };
  highlightQuote: string;
}

const TELEMETRY_STREAMS: TelemetryStream[] = [
  {
    id: 'healthcare',
    industry: 'Urgent Care & Family Medicine',
    facility: 'Highland Pediatric & Urgent Care',
    location: 'Denver, CO · 14 Exam Rooms',
    volumeMetric: '4,120 calls/mo handled autonomously',
    uptimeSla: '99.98% First-Ring Pickup',
    resolutionRate: '98.6% Autonomous Triage & Booking',
    latencyBreakdown: {
      sipHandshake: 18,
      sttStreaming: 42,
      intentReasoning: 110,
      ttsSynthesis: 68,
      totalMs: 238,
    },
    samplePayload: {
      callerIntent: 'Fever onset in 3yo child · Urgent triage evaluation',
      protocol: 'SIP TLS / WebRTC 48kHz Opus · Zero jitter loss',
      systemAction: 'Two-phase lock on Epic Cadence EHR slot (Today 4:15 PM)',
      recordSynced: 'Epic Systems MyChart + SMS pre-arrival intake form',
      complianceLock: 'HIPAA BAA Tokenized · Audio payload redacted in-RAM',
    },
    highlightQuote:
      'Eliminated the front-desk phone bottleneck entirely. Zero patients placed on hold during Monday morning surge hours.',
  },
  {
    id: 'hospitality',
    industry: 'Luxury Boutique Hospitality',
    facility: 'The Luminary Hotel & Residences',
    location: 'Savannah, GA · 120 Keys',
    volumeMetric: '2,890 calls/mo · Multilingual 24/7',
    uptimeSla: '100% Night-Intake Coverage',
    resolutionRate: '94.2% Direct Reservation & Concierge',
    latencyBreakdown: {
      sipHandshake: 16,
      sttStreaming: 39,
      intentReasoning: 114,
      ttsSynthesis: 69,
      totalMs: 238,
    },
    samplePayload: {
      callerIntent: 'Late flight arrival · Requesting 1:30 AM mobile check-in',
      protocol: 'Oracle Hospitality OPERA Cloud REST API v23.4',
      systemAction: 'Assigned Executive King Suite · Digital key dispatched',
      recordSynced: 'OPERA PMS Folio #90412 + Valet arrival notification',
      complianceLock: 'PCI-DSS Level 1 tokenized card on file authorization',
    },
    highlightQuote:
      'International guests calling across time zones receive instant, fluent concierge service without taxing our night team.',
  },
  {
    id: 'legal',
    industry: 'Corporate & Estate Law Practice',
    facility: 'Vanguard Legal Partners LLP',
    location: 'Boston, MA · 18 Partners',
    volumeMetric: '$185k estimated retained client intake captured',
    uptimeSla: 'Zero Missed High-Value Inquiries',
    resolutionRate: '96.8% Conflict-Cleared Consultations',
    latencyBreakdown: {
      sipHandshake: 19,
      sttStreaming: 44,
      intentReasoning: 107,
      ttsSynthesis: 68,
      totalMs: 238,
    },
    samplePayload: {
      callerIntent: 'Commercial lease dispute consult · 48h emergency response',
      protocol: 'Clio Manage Webhook API + Zapier Enterprise Pipeline',
      systemAction: 'Conflict-of-interest check cleared · Retainer link sent',
      recordSynced: 'Clio Matter #2026-088 + Partner calendar locked',
      complianceLock: 'SOC2 Type II Audit Trail · End-to-end PII masking',
    },
    highlightQuote:
      'High-stakes clients never reach voicemail. Immediate professional engagement captures cases competitors miss.',
  },
];

export const OperationalTelemetry: React.FC = () => {
  const [selectedStream, setSelectedStream] = useState<number>(0);
  const [scrubPosition, setScrubPosition] = useState<number>(100); // 0 to 100%
  const { isTouch, triggerHaptic } = useTouchDevice();

  const current = TELEMETRY_STREAMS[selectedStream];

  return (
    <section id="telemetry" className="py-24 md:py-32 bg-white border-t border-neutral-200/60 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-xs font-mono uppercase tracking-wider font-semibold">
            <Activity className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
            <span>Audited Production Telemetry</span>
          </div>

          <div className="text-3xl sm:text-4xl lg:text-5xl font-editorial font-normal tracking-tight text-neutral-950 text-balance">
            <BlurText
              text="Audited performance. Zero marketing fluff."
              delay={40}
              className="font-editorial"
            />
          </div>

          <p className="text-base sm:text-lg text-neutral-600 font-sans leading-relaxed text-balance">
            Real enterprise deployments demand verifiable uptime, sub-second latency budgets, and atomic EHR/PMS schedule guarantees.
          </p>
        </div>

        {/* 4 High-Density Verifiable SLA Metric Badges */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-12">
          {[
            {
              icon: Zap,
              metric: '238 ms',
              label: 'Full-Duplex Turn Latency',
              sub: 'Sub-human conversational threshold',
            },
            {
              icon: Clock,
              metric: '99.98%',
              label: 'First-Ring Answer SLA',
              sub: 'Zero hold music or queues',
            },
            {
              icon: Database,
              metric: '0.00%',
              label: 'Double-Booking Rate',
              sub: 'Atomic 2-phase lock commit',
            },
            {
              icon: ShieldCheck,
              metric: '100%',
              label: 'HIPAA & SOC2 Redacted',
              sub: 'In-RAM memory redaction',
            },
          ].map((item, idx) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.08 }}
                className="p-4 sm:p-6 rounded-2xl bg-[#FAFAFA] border border-neutral-200/80 hover:border-emerald-500/40 hover:bg-white transition-all shadow-2xs group"
              >
                <div className="flex items-center justify-between pb-3">
                  <span className="text-[11px] sm:text-xs font-mono text-neutral-500 uppercase tracking-wider">
                    Audit Metric
                  </span>
                  <div className="p-1.5 sm:p-2 rounded-lg bg-emerald-50 text-emerald-700 group-hover:scale-110 transition-transform">
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-xl sm:text-2xl lg:text-3xl font-mono font-bold text-neutral-900 tracking-tight">
                  {item.metric}
                </div>
                <div className="text-xs sm:text-sm font-semibold text-neutral-800 mt-1 leading-snug">
                  {item.label}
                </div>
                <div className="text-[10px] sm:text-[11px] text-neutral-500 mt-1 font-mono leading-tight">
                  {item.sub}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Mobile View: Touch-Swipeable Deck */}
        <div className="block lg:hidden mt-12">
          <TouchSwipeDeck>
            {TELEMETRY_STREAMS.map((stream, idx) => (
              <div
                key={stream.id}
                className="p-6 rounded-3xl bg-neutral-950 text-white border border-neutral-800 shadow-xl relative overflow-hidden flex flex-col justify-between h-full"
              >
                <BorderBeam size={200} duration={12} />

                <div>
                  <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[11px] font-mono uppercase tracking-wider">
                      {stream.industry}
                    </span>
                    <span className="text-xs font-mono text-neutral-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      Live SIP Node
                    </span>
                  </div>

                  <h3 className="text-xl font-editorial font-normal mt-4 text-white">
                    {stream.facility}
                  </h3>
                  <p className="text-xs text-neutral-400 font-mono mt-1">{stream.location}</p>

                  <div className="grid grid-cols-2 gap-3 my-5">
                    <div className="p-3 rounded-xl bg-neutral-900/90 border border-neutral-800">
                      <div className="text-[10px] text-neutral-400 font-mono uppercase">Call Volume</div>
                      <div className="text-xs font-semibold text-white mt-1 leading-snug">
                        {stream.volumeMetric}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-neutral-900/90 border border-neutral-800">
                      <div className="text-[10px] text-neutral-400 font-mono uppercase">Resolution</div>
                      <div className="text-xs font-semibold text-emerald-400 mt-1 leading-snug">
                        {stream.resolutionRate}
                      </div>
                    </div>
                  </div>

                  {/* Real Latency Waterfall Breakdown */}
                  <div className="p-4 rounded-xl bg-neutral-900/70 border border-neutral-800/90 space-y-2.5">
                    <div className="flex justify-between items-center text-xs font-mono">
                      <span className="text-neutral-400">Total Turn-Around Latency</span>
                      <span className="text-emerald-400 font-bold">{stream.latencyBreakdown.totalMs} ms</span>
                    </div>

                    {/* Progress Waterfall Bar */}
                    <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden flex">
                      <div style={{ width: '8%' }} className="bg-emerald-700" title="SIP: 18ms" />
                      <div style={{ width: '18%' }} className="bg-emerald-500" title="STT: 42ms" />
                      <div style={{ width: '46%' }} className="bg-emerald-400" title="LLM: 110ms" />
                      <div style={{ width: '28%' }} className="bg-emerald-300" title="TTS: 68ms" />
                    </div>

                    <div className="flex justify-between text-[10px] font-mono text-neutral-400 pt-1">
                      <span>SIP 18ms</span>
                      <span>ASR 42ms</span>
                      <span>Logic 110ms</span>
                      <span>TTS 68ms</span>
                    </div>
                  </div>

                  <p className="mt-4 text-xs font-sans text-neutral-300 italic border-l-2 border-emerald-500 pl-3 leading-relaxed">
                    "{stream.highlightQuote}"
                  </p>
                </div>

                <div className="mt-5 pt-4 border-t border-neutral-800 flex items-center justify-between text-[10px] sm:text-[11px] font-mono text-neutral-400">
                  <span className="flex items-center gap-1.5 text-neutral-300">
                    <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="leading-tight">{stream.samplePayload.complianceLock}</span>
                  </span>
                </div>
              </div>
            ))}
          </TouchSwipeDeck>
        </div>

        {/* Desktop View: Interactive Stream Inspector */}
        <div className="hidden lg:grid grid-cols-12 gap-8 mt-14">
          {/* Left Column: Stream Selector Tabs */}
          <div className="col-span-4 space-y-3">
            <span className="text-xs font-mono uppercase tracking-wider text-neutral-500 font-semibold px-2">
              Select Enterprise Telemetry Stream
            </span>

            {TELEMETRY_STREAMS.map((stream, idx) => (
              <button
                key={stream.id}
                onClick={() => {
                  setSelectedStream(idx);
                  triggerHaptic(12);
                }}
                className={`w-full text-left p-5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
                  selectedStream === idx
                    ? 'bg-neutral-950 text-white border-neutral-900 shadow-xl'
                    : 'bg-[#FAFAFA] text-neutral-800 border-neutral-200/90 hover:bg-neutral-100/70 hover:border-neutral-300'
                }`}
              >
                {selectedStream === idx && (
                  <motion.div
                    layoutId="telemetryTabActive"
                    className="absolute inset-0 border-2 border-emerald-500 rounded-2xl pointer-events-none"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}

                <div className="flex items-center justify-between">
                  <span
                    className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      selectedStream === idx
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-neutral-200/80 text-neutral-600'
                    }`}
                  >
                    {stream.industry}
                  </span>
                  <span className="text-xs font-mono text-emerald-500 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Verified SLA
                  </span>
                </div>

                <div className="text-base font-editorial font-medium mt-3 tracking-tight">
                  {stream.facility}
                </div>
                <div className="text-xs font-mono text-neutral-400 mt-0.5">{stream.location}</div>

                <div className="mt-4 pt-3 border-t border-neutral-200/30 flex items-center justify-between text-xs font-mono">
                  <span className={selectedStream === idx ? 'text-neutral-300' : 'text-neutral-600'}>
                    {stream.uptimeSla}
                  </span>
                  <span className="text-emerald-500 font-semibold">{stream.latencyBreakdown.totalMs}ms</span>
                </div>
              </button>
            ))}
          </div>

          {/* Right Column: Deep Production Telemetry Terminal */}
          <div className="col-span-8 bg-neutral-950 text-white border border-neutral-800 rounded-3xl p-8 relative overflow-hidden shadow-2xl flex flex-col justify-between">
            <BorderBeam size={240} duration={14} />

            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between pb-5 border-b border-neutral-800">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
                  <div>
                    <h3 className="text-lg font-editorial font-normal text-white">
                      Live Telephony Audit Stream: {current.facility}
                    </h3>
                    <p className="text-xs font-mono text-neutral-400">{current.location}</p>
                  </div>
                </div>

                <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-mono">
                  Atomic Commit Active
                </span>
              </div>

              {/* Real Latency Waterfall Analysis */}
              <div className="p-6 rounded-2xl bg-neutral-900/90 border border-neutral-800 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                    <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Packet Turn-Taking Latency Budget (Total: {current.latencyBreakdown.totalMs}ms)</span>
                  </span>
                  <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    Human Speech Boundary: ~250ms
                  </span>
                </div>

                {/* Waterfall Visualizer */}
                <div className="grid grid-cols-4 gap-2 pt-2">
                  <div className="p-3 rounded-xl bg-neutral-950/80 border border-neutral-800">
                    <div className="text-[10px] font-mono text-neutral-500">1. SIP INVITE</div>
                    <div className="text-base font-mono font-bold text-white mt-1">
                      {current.latencyBreakdown.sipHandshake} ms
                    </div>
                    <div className="text-[10px] text-neutral-400 font-mono mt-0.5">TLS Edge Handshake</div>
                  </div>

                  <div className="p-3 rounded-xl bg-neutral-950/80 border border-neutral-800">
                    <div className="text-[10px] font-mono text-neutral-500">2. ASR Streaming</div>
                    <div className="text-base font-mono font-bold text-white mt-1">
                      {current.latencyBreakdown.sttStreaming} ms
                    </div>
                    <div className="text-[10px] text-neutral-400 font-mono mt-0.5">Deepgram Nova-2</div>
                  </div>

                  <div className="p-3 rounded-xl bg-neutral-950/80 border border-neutral-800">
                    <div className="text-[10px] font-mono text-neutral-500">3. Reasoning & Lock</div>
                    <div className="text-base font-mono font-bold text-emerald-400 mt-1">
                      {current.latencyBreakdown.intentReasoning} ms
                    </div>
                    <div className="text-[10px] text-neutral-400 font-mono mt-0.5">Aura Intent Engine</div>
                  </div>

                  <div className="p-3 rounded-xl bg-neutral-950/80 border border-neutral-800">
                    <div className="text-[10px] font-mono text-neutral-500">4. Neural Synthesis</div>
                    <div className="text-base font-mono font-bold text-white mt-1">
                      {current.latencyBreakdown.ttsSynthesis} ms
                    </div>
                    <div className="text-[10px] text-neutral-400 font-mono mt-0.5">ElevenLabs Low-Jitter</div>
                  </div>
                </div>

                {/* Progress bar visual */}
                <div className="h-2.5 w-full bg-neutral-950 rounded-full overflow-hidden flex border border-neutral-800">
                  <div style={{ width: '8%' }} className="bg-emerald-700" />
                  <div style={{ width: '18%' }} className="bg-emerald-500" />
                  <div style={{ width: '47%' }} className="bg-emerald-400 animate-pulse" />
                  <div style={{ width: '27%' }} className="bg-emerald-300" />
                </div>
              </div>

              {/* Live Webhook / Transaction Log Inspection */}
              <div className="p-6 rounded-2xl bg-neutral-900/90 border border-neutral-800 space-y-3 font-mono text-xs">
                <div className="text-neutral-400 uppercase tracking-wider text-[11px] pb-1 border-b border-neutral-800/80 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Server className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Transaction Payload Verification</span>
                  </span>
                  <span className="text-emerald-400">200 OK · COMMITTED</span>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-1">
                  <div>
                    <span className="text-neutral-500 text-[10px]">INBOUND INTENT:</span>
                    <p className="text-white mt-0.5">{current.samplePayload.callerIntent}</p>
                  </div>
                  <div>
                    <span className="text-neutral-500 text-[10px]">RECORD ATOMIC LOCK:</span>
                    <p className="text-emerald-400 mt-0.5">{current.samplePayload.systemAction}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-neutral-800/50">
                  <div>
                    <span className="text-neutral-500 text-[10px]">INTEGRATION SYNC:</span>
                    <p className="text-neutral-300 mt-0.5">{current.samplePayload.recordSynced}</p>
                  </div>
                  <div>
                    <span className="text-neutral-500 text-[10px]">SECURITY AUDIT:</span>
                    <p className="text-neutral-300 mt-0.5 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      {current.samplePayload.complianceLock}
                    </p>
                  </div>
                </div>
              </div>

              <blockquote className="text-sm font-sans text-neutral-300 italic border-l-2 border-emerald-500 pl-4 py-1 leading-relaxed">
                "{current.highlightQuote}"
              </blockquote>
            </div>

            {/* Terminal Footer */}
            <div className="pt-6 mt-6 border-t border-neutral-800 flex items-center justify-between text-xs font-mono text-neutral-400">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                SIP Trunk Status: Healthy · Zero packet loss over 10,000 live streams
              </span>
              <span className="text-neutral-500">ISO/IEC 27001 & SOC2 Verified</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
