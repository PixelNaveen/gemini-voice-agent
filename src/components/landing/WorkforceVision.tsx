import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, Users, Headphones, Activity, Check } from 'lucide-react';
import { BlurText } from './motion/BlurText.tsx';
import { AuroraGlow } from './motion/AuroraGlow.tsx';
import { BorderBeam } from './motion/BorderBeam.tsx';
import { TouchSwipeDeck } from './motion/TouchSwipeDeck.tsx';

interface WorkforceNode {
  id: string;
  role: string;
  status: 'Active' | 'Available Now' | 'Q3 2026';
  isLive: boolean;
  description: string;
  icon: React.ReactNode;
  metrics: string;
  tasks: string[];
}

const NODES: WorkforceNode[] = [
  {
    id: 'receptionist',
    role: 'AI Receptionist',
    status: 'Active',
    isLive: true,
    description:
      'The frontline executive voice of your business. Answers every inbound call, schedules appointments, confirms calendar availability, and routes VIP escalations.',
    icon: <Phone className="w-5 h-5 text-emerald-400" />,
    metrics: '250ms Voice Latency · 100% Inbound Capture',
    tasks: [
      'Autonomous calendar booking & conflict resolution',
      'Insurance & clinical pre-screening triage',
      'Instant SMS confirmations & cancellation backfills',
    ],
  },
  {
    id: 'sales',
    role: 'AI Sales Specialist',
    status: 'Available Now',
    isLive: false,
    description:
      'High-velocity pipeline qualification. Re-engages inbound website leads within 60 seconds, qualifies project scope, and books discovery calls on rep calendars.',
    icon: <Users className="w-5 h-5 text-neutral-300" />,
    metrics: '4x Lead Qualification Speed',
    tasks: [
      'Instant outbound callback to web inquiry submissions',
      'BANT budget and timeline qualification',
      'CRM contact enrichment & calendar assignment',
    ],
  },
  {
    id: 'support',
    role: 'AI Support Analyst',
    status: 'Available Now',
    isLive: false,
    description:
      'Post-visit care and tier-1 ticket resolution. Conducts next-day check-in calls after clinical procedures or hotel stays, and captures guest feedback.',
    icon: <Headphones className="w-5 h-5 text-neutral-300" />,
    metrics: '94% First-Contact Resolution',
    tasks: [
      'Post-procedure patient wellness follow-up calls',
      'Guest feedback collation & Google Review invitation',
      'Billing question triage & receipt dispatch',
    ],
  },
  {
    id: 'operations',
    role: 'AI Operations Lead',
    status: 'Available Now',
    isLive: false,
    description:
      'Autonomous emergency shift coverage and roster balancing. Calls qualified relief staff when a team member calls in sick, ensuring zero service disruption.',
    icon: <Activity className="w-5 h-5 text-neutral-300" />,
    metrics: 'Under 12 mins to Fill Emergency Shift',
    tasks: [
      'Automated sequential calling to available relief staff',
      'On-call physician dispatch & emergency escalation',
      'Delivery courier coordination & access code dispatch',
    ],
  },
];

export const WorkforceVision: React.FC = () => {
  const [selectedNodeId, setSelectedNodeId] = useState<string>('receptionist');
  const activeNode = NODES.find((n) => n.id === selectedNodeId) || NODES[0];

  return (
    <section id="architecture" className="py-24 md:py-32 bg-[#0B0B0B] text-white relative overflow-hidden">
      {/* Background ambient aurora */}
      <AuroraGlow dark={true} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="max-w-3xl space-y-4">
          <motion.span
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-semibold"
          >
            Unified Cognitive Architecture
          </motion.span>
          <div className="text-3xl sm:text-4xl lg:text-5xl font-editorial font-normal tracking-tight text-white text-balance">
            <BlurText
              text="One AI employee today. An entire workforce tomorrow."
              delay={40}
              className="font-editorial text-white"
            />
          </div>
          <p className="text-base sm:text-lg text-neutral-400 font-sans leading-relaxed text-balance">
            Start with the world's most capable AI receptionist. Expand across sales, customer service, and field dispatching on a unified cognitive system.
          </p>
        </div>

        {/* Mobile Swipable Nodes Deck */}
        <div className="block sm:hidden mt-8">
          <TouchSwipeDeck
            minHeightClass="min-h-[290px]"
            onIndexChange={(idx) => setSelectedNodeId(NODES[idx].id)}
          >
            {NODES.map((node) => {
              const isSelected = selectedNodeId === node.id;
              return (
                <div
                  key={node.id}
                  onClick={() => setSelectedNodeId(node.id)}
                  className={`p-6 rounded-2xl border transition-all duration-300 cursor-pointer flex flex-col justify-between relative h-full ${
                    isSelected
                      ? 'bg-neutral-900 border-emerald-500/70 shadow-lg ring-1 ring-emerald-500/30'
                      : 'bg-white/5 border-white/10 text-neutral-400'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between pb-4 border-b border-white/10">
                      <div className="p-2.5 rounded-xl bg-white/10">
                        {node.icon}
                      </div>
                      <span
                        className={`text-[11px] font-mono px-2 py-0.5 rounded-full ${
                          node.isLive
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-white/10 text-neutral-400'
                        }`}
                      >
                        {node.status}
                      </span>
                    </div>

                    <h3 className="text-lg font-semibold text-white mt-4 tracking-tight">
                      {node.role}
                    </h3>
                    <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
                      {node.description}
                    </p>
                  </div>

                  <div className="pt-4 mt-4 border-t border-white/10 flex items-center justify-between text-xs">
                    <span className="font-mono text-neutral-500 text-[11px]">
                      {node.isLive ? 'Deployed' : 'Plug-and-play'}
                    </span>
                    <span className={`text-[11px] font-mono ${isSelected ? 'text-emerald-400 font-semibold' : 'text-neutral-400'}`}>
                      {isSelected ? 'Inspecting' : 'Tap to inspect'}
                    </span>
                  </div>
                </div>
              );
            })}
          </TouchSwipeDeck>
        </div>

        {/* Tablet & Desktop 4 Interactive Nodes Grid */}
        <div className="hidden sm:grid grid-cols-2 lg:grid-cols-4 gap-4 mt-12 lg:mt-14">
          {NODES.map((node) => {
            const isSelected = selectedNodeId === node.id;
            return (
              <motion.div
                key={node.id}
                onClick={() => setSelectedNodeId(node.id)}
                whileHover={{ y: -4 }}
                className={`p-6 rounded-2xl border transition-all duration-300 cursor-pointer flex flex-col justify-between relative ${
                  isSelected
                    ? 'bg-neutral-900 border-emerald-500/70 shadow-lg ring-1 ring-emerald-500/30'
                    : 'bg-white/5 border-white/10 hover:bg-white/10 text-neutral-400'
                }`}
              >
                {isSelected && (
                  <motion.div
                    layoutId="activeNodeGlow"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    className="absolute inset-0 bg-emerald-500/5 rounded-2xl border border-emerald-500/60 pointer-events-none"
                  />
                )}

                <div>
                  <div className="flex items-center justify-between pb-4 border-b border-white/10">
                    <div className="p-2.5 rounded-xl bg-white/10">
                      {node.icon}
                    </div>
                    <span
                      className={`text-[11px] font-mono px-2 py-0.5 rounded-full ${
                        node.isLive
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-white/10 text-neutral-400'
                      }`}
                    >
                      {node.status}
                    </span>
                  </div>

                  <h3 className="text-lg font-semibold text-white mt-4 tracking-tight">
                    {node.role}
                  </h3>
                  <p className="text-xs text-neutral-400 mt-2 leading-relaxed line-clamp-3">
                    {node.description}
                  </p>
                </div>

                <div className="pt-4 mt-4 border-t border-white/10 flex items-center justify-between text-xs">
                  <span className="font-mono text-neutral-500 text-[11px]">
                    {node.isLive ? 'Deployed' : 'Plug-and-play'}
                  </span>
                  <span className={`text-[11px] font-mono ${isSelected ? 'text-emerald-400 font-semibold' : 'text-neutral-400'}`}>
                    {isSelected ? 'Inspecting' : 'Tap to inspect'}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Selected Node Detailed Architecture Card with AnimatePresence */}
        <div className="mt-8 p-6 sm:p-8 rounded-3xl glass-panel-dark border border-white/15 relative overflow-hidden">
          <BorderBeam size={240} duration={14} />

          <AnimatePresence mode="wait">
            <motion.div
              key={activeNode.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center"
            >
              <div className="lg:col-span-7 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-mono uppercase tracking-wider text-emerald-400">
                    Autonomous Agent Specification
                  </span>
                </div>
                <h3 className="text-2xl font-editorial font-normal text-white">
                  {activeNode.role}
                </h3>
                <p className="text-sm text-neutral-300 leading-relaxed">
                  {activeNode.description}
                </p>

                <div className="pt-2 space-y-2">
                  <span className="text-xs font-mono text-neutral-400 uppercase tracking-wider block">
                    Core Autonomous Workflows:
                  </span>
                  {activeNode.tasks.map((task, i) => (
                    <div key={i} className="flex items-center gap-2.5 text-xs text-neutral-200">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{task}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-5 p-5 rounded-2xl bg-black/60 border border-white/10 space-y-4">
                <div className="text-xs font-mono text-neutral-400 flex items-center justify-between">
                  <span>Operational Benchmark</span>
                  <span className="text-emerald-400 font-semibold">Verified Metric</span>
                </div>
                <div className="text-xl font-mono font-semibold text-white">
                  {activeNode.metrics}
                </div>
                <div className="pt-3 border-t border-white/10 text-xs text-neutral-400 space-y-1">
                  <p>• Unified enterprise knowledge graph</p>
                  <p>• Zero training data leakage</p>
                  <p>• Cross-role situational memory</p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
};
