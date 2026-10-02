import React, { useState } from 'react';
import { X, CheckCircle2, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';
import { ShinyButton } from './motion/ShinyButton.tsx';
import { useTheme } from '../../context/ThemeContext.tsx';

interface EnterpriseDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPlan?: string;
}

export const EnterpriseDemoModal: React.FC<EnterpriseDemoModalProps> = ({
  isOpen,
  onClose,
  initialPlan = 'Professional Plan',
}) => {
  const { palette } = useTheme();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    organization: '',
    industry: 'Healthcare / Medical Practice',
    callVolume: '500 - 2,000 calls / month',
    plan: initialPlan,
  });

  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    setTimeout(() => {
      setIsSubmitting(false);
      setIsSubmitted(true);
      confetti({
        particleCount: 50,
        spread: 70,
        origin: { y: 0.6 },
        colors: [palette.emeraldAccent, palette.emeraldAccentLight, '#34d399'],
      });
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div className="relative w-full max-w-xl bg-white rounded-3xl p-6 sm:p-8 border border-neutral-200 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {isSubmitted ? (
          <div className="py-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-800 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-editorial font-normal text-neutral-900">
              Your autonomous sandbox is provisioned.
            </h3>
            <p className="text-sm text-neutral-600 max-w-md mx-auto leading-relaxed">
              We've dispatched your personalized private DID telephone line and administrative access link to{' '}
              <span className="font-semibold text-neutral-900">{formData.email}</span>.
            </p>

            <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 text-xs text-left max-w-md mx-auto space-y-1.5 font-mono text-neutral-600">
              <div className="flex justify-between">
                <span>Account Tenant:</span>
                <span className="text-neutral-900 font-bold">{formData.organization || 'Aura Sandbox'}</span>
              </div>
              <div className="flex justify-between">
                <span>Direct Voice DID:</span>
                <span className="text-emerald-700 font-bold">+1 (888) 902-AURA</span>
              </div>
              <div className="flex justify-between">
                <span>Selected Plan:</span>
                <span className="text-neutral-900">{formData.plan}</span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-full bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 transition-colors"
            >
              Return to Website
            </button>
          </div>
        ) : (
          <>
            <div>
              <span className="text-xs font-mono uppercase tracking-wider text-emerald-700 font-semibold">
                Priority Enterprise Onboarding
              </span>
              <h3 className="text-2xl sm:text-3xl font-editorial font-normal text-neutral-900 mt-1">
                Experience Aura with your business parameters.
              </h3>
              <p className="text-xs sm:text-sm text-neutral-500 mt-1">
                Zero commitment. We provision a private test phone line loaded with your knowledge base in 15 minutes.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-neutral-700 block mb-1">
                    Your Name
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Dr. Julian Vance"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-200 text-xs text-neutral-900 focus:outline-hidden focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-700 block mb-1">
                    Corporate Email
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="julian@vanceclinic.com"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-200 text-xs text-neutral-900 focus:outline-hidden focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-neutral-700 block mb-1">
                    Practice / Organization
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.organization}
                    onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                    placeholder="Vance Aesthetic Centre"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-200 text-xs text-neutral-900 focus:outline-hidden focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-700 block mb-1">
                    Telephone (for Test Call)
                  </label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+1 (415) 890-4200"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-200 text-xs text-neutral-900 focus:outline-hidden focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-neutral-700 block mb-1">
                    Industry Domain
                  </label>
                  <select
                    value={formData.industry}
                    onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-200 text-xs text-neutral-900 bg-white focus:outline-hidden focus:border-neutral-900"
                  >
                    <option>Healthcare / Medical Practice</option>
                    <option>Boutique Hotel / Hospitality</option>
                    <option>Luxury Salon / Studio</option>
                    <option>High-End Real Estate</option>
                    <option>Legal & Financial Services</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-700 block mb-1">
                    Estimated Monthly Inbound Calls
                  </label>
                  <select
                    value={formData.callVolume}
                    onChange={(e) => setFormData({ ...formData, callVolume: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-200 text-xs text-neutral-900 bg-white focus:outline-hidden focus:border-neutral-900"
                  >
                    <option>&lt; 500 calls / month</option>
                    <option>500 - 2,000 calls / month</option>
                    <option>2,000 - 10,000 calls / month</option>
                    <option>10,000+ enterprise volume</option>
                  </select>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200/80 flex items-center justify-between text-xs">
                <span className="text-neutral-500">Target Plan Configuration:</span>
                <span className="font-semibold font-mono text-neutral-900">{formData.plan}</span>
              </div>

              <div className="pt-2">
                <ShinyButton
                  type="submit"
                  disabled={isSubmitting}
                  variant="primary"
                  className="w-full py-3.5 text-xs font-medium shadow-md"
                >
                  <span>{isSubmitting ? 'Provisioning Private DID...' : 'Provision Private AI Sandbox'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </ShinyButton>
              </div>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-neutral-500 font-mono text-center">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Zero sales harassment. Full HIPAA & SOC2 compliance confidentiality.</span>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
