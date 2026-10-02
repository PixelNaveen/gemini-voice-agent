import React from 'react';
import { ArrowUpRight } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-white border-t border-neutral-200/80 py-16 lg:py-20 text-neutral-600">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-8 pb-14 border-b border-neutral-200">
          {/* Brand info */}
          <div className="lg:col-span-2 space-y-4">
            <a href="/" className="flex items-center gap-2 text-neutral-950 font-medium tracking-tight text-xl">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-accent" />
              <span className="font-semibold">Aura AI</span>
            </a>
            <p className="text-sm text-neutral-500 leading-relaxed max-w-sm">
              The autonomous voice standard for modern enterprise operations. Engineered for medical clinics, luxury hospitality, and high-touch service practices.
            </p>

            <div className="pt-2 flex items-center gap-2 text-xs font-mono text-neutral-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>All Systems Operational</span>
              <span>·</span>
              <span>99.99% Carrier SLA</span>
            </div>
          </div>

          {/* Column 1: Product */}
          <div className="space-y-3">
            <h4 className="text-xs font-mono uppercase tracking-wider text-neutral-900 font-semibold">
              Product
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <a href="#principles" className="hover:text-neutral-950 transition-colors">
                  Autonomous Receptionist
                </a>
              </li>
              <li>
                <a href="#understanding" className="hover:text-neutral-950 transition-colors">
                  Voice Synthesis Engine
                </a>
              </li>
              <li>
                <a href="#architecture" className="hover:text-neutral-950 transition-colors">
                  Cognitive Workflows
                </a>
              </li>
              <li>
                <a href="#demo" className="hover:text-neutral-950 transition-colors">
                  Live Testing Sandbox
                </a>
              </li>
            </ul>
          </div>

          {/* Column 2: Verticals */}
          <div className="space-y-3">
            <h4 className="text-xs font-mono uppercase tracking-wider text-neutral-900 font-semibold">
              Verticals
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <a href="#industries" className="hover:text-neutral-950 transition-colors">
                  Healthcare & Medical
                </a>
              </li>
              <li>
                <a href="#industries" className="hover:text-neutral-950 transition-colors">
                  Luxury Hospitality
                </a>
              </li>
              <li>
                <a href="#industries" className="hover:text-neutral-950 transition-colors">
                  Salons & Day Spas
                </a>
              </li>
              <li>
                <a href="#industries" className="hover:text-neutral-950 transition-colors">
                  High-End Real Estate
                </a>
              </li>
            </ul>
          </div>

          {/* Column 3: Trust & Governance */}
          <div className="space-y-3">
            <h4 className="text-xs font-mono uppercase tracking-wider text-neutral-900 font-semibold">
              Trust & Security
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <a href="#security" className="hover:text-neutral-950 transition-colors">
                  SOC 2 Type II Report
                </a>
              </li>
              <li>
                <a href="#security" className="hover:text-neutral-950 transition-colors">
                  HIPAA BAA Agreement
                </a>
              </li>
              <li>
                <a href="#security" className="hover:text-neutral-950 transition-colors">
                  Data Isolation Architecture
                </a>
              </li>
              <li>
                <a href="#security" className="hover:text-neutral-950 transition-colors">
                  Carrier Telephony Security
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom copyright row */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-500">
          <p>© 2026 Aura AI, Inc. Autonomous telemetric intelligence for mission-critical operations.</p>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-neutral-900 transition-colors">
              Privacy Policy
            </a>
            <a href="#" className="hover:text-neutral-900 transition-colors">
              Terms of Service
            </a>
            <a href="#" className="hover:text-neutral-900 transition-colors">
              Security Disclosures
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
