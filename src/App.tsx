import React, { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { Navbar } from './components/landing/Navbar.tsx';
import { Hero } from './components/landing/Hero.tsx';
import { CorePrinciples } from './components/landing/CorePrinciples.tsx';
import { UnderstandingEngine } from './components/landing/UnderstandingEngine.tsx';
import { SetupTimeline } from './components/landing/SetupTimeline.tsx';
import { IndustryShowcase } from './components/landing/IndustryShowcase.tsx';
import { ComparisonSection } from './components/landing/ComparisonSection.tsx';
import { WorkforceVision } from './components/landing/WorkforceVision.tsx';
import { SecurityTrust } from './components/landing/SecurityTrust.tsx';
import { OperationalTelemetry } from './components/landing/OperationalTelemetry.tsx';
import { InteractiveConsole } from './components/landing/InteractiveConsole.tsx';
import { Pricing } from './components/landing/Pricing.tsx';
import { FinalCta } from './components/landing/FinalCta.tsx';
import { Footer } from './components/landing/Footer.tsx';
import { LiveVoiceAgentModal } from './components/modal/LiveVoiceAgentModal.tsx';
import { EnterpriseDemoModal } from './components/landing/EnterpriseDemoModal.tsx';
import { ScrollProgress } from './components/landing/motion/ScrollProgress.tsx';
import { InteractiveCursor } from './components/landing/motion/InteractiveCursor.tsx';
import { SectionReveal } from './components/landing/motion/SectionReveal.tsx';
import { AnimatedSeparator } from './components/landing/motion/AnimatedSeparator.tsx';

export default function App() {
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [selectedPlanForDemo, setSelectedPlanForDemo] = useState('Professional Plan');

  const handleOpenCallModal = () => {
    setIsCallModalOpen(true);
  };

  const handleOpenDemoModal = (planName?: string) => {
    if (planName) setSelectedPlanForDemo(planName);
    setIsDemoModalOpen(true);
  };

  return (
    <ThemeProvider>
      <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-[#FBF9F8] text-[#111111] antialiased selection:bg-emerald-accent/15 selection:text-emerald-accent scroll-smooth scroll-snap-container lg:snap-y lg:snap-proximity">
        {/* Top Reading Scroll Progress Bar */}
        <ScrollProgress />

        {/* Interactive Custom Cursor Follower */}
        <InteractiveCursor />

        {/* Primary Navigation */}
        <Navbar
          onOpenCallModal={handleOpenCallModal}
          onOpenDemoModal={() => handleOpenDemoModal('Professional Plan')}
        />

        {/* Hero Section with interactive tsParticles and ambient aurora */}
        <div className="snap-section lg:snap-start">
          <Hero
            onOpenCallModal={handleOpenCallModal}
            onOpenDemoModal={() => handleOpenDemoModal('Professional Plan')}
          />
        </div>

        {/* Animated Divider */}
        <AnimatedSeparator />

        {/* Section 1: Every customer deserves an answer */}
        <SectionReveal delay={0.05}>
          <CorePrinciples />
        </SectionReveal>

        {/* Animated Divider */}
        <AnimatedSeparator />

        {/* Section 2: It doesn't just answer. It understands */}
        <SectionReveal delay={0.05}>
          <UnderstandingEngine />
        </SectionReveal>

        {/* Animated Divider */}
        <AnimatedSeparator />

        {/* Section 3: From setup to your first conversation */}
        <SectionReveal delay={0.05}>
          <SetupTimeline />
        </SectionReveal>

        {/* Animated Divider */}
        <AnimatedSeparator />

        {/* Section 4: Where every conversation matters */}
        <SectionReveal delay={0.05}>
          <IndustryShowcase />
        </SectionReveal>

        {/* Animated Divider */}
        <AnimatedSeparator />

        {/* Section 5: The difference between waiting and hearing */}
        <SectionReveal delay={0.05}>
          <ComparisonSection />
        </SectionReveal>

        {/* Animated Divider */}
        <AnimatedSeparator />

        {/* Section 6: One AI employee today. An entire workforce tomorrow */}
        <SectionReveal delay={0.05}>
          <WorkforceVision />
        </SectionReveal>

        {/* Animated Divider */}
        <AnimatedSeparator />

        {/* Section 7: Built for businesses where trust is non-negotiable */}
        <SectionReveal delay={0.05}>
          <SecurityTrust />
        </SectionReveal>

        {/* Animated Divider */}
        <AnimatedSeparator />

        {/* Section 8: Audited Production Telemetry & SLA Benchmarks */}
        <SectionReveal delay={0.05}>
          <OperationalTelemetry />
        </SectionReveal>

        {/* Animated Divider */}
        <AnimatedSeparator />

        {/* Section 9: Live Interactive Experience Console */}
        <SectionReveal delay={0.05}>
          <InteractiveConsole />
        </SectionReveal>

        {/* Animated Divider */}
        <AnimatedSeparator />

        {/* Section 10: Less than the cost of one missed booking */}
        <SectionReveal delay={0.05}>
          <Pricing onSelectPlan={(plan) => handleOpenDemoModal(plan)} />
        </SectionReveal>

        {/* Animated Divider */}
        <AnimatedSeparator />

        {/* Section 11: Your next employee is already here */}
        <SectionReveal delay={0.05}>
          <FinalCta
            onOpenCallModal={handleOpenCallModal}
            onOpenDemoModal={() => handleOpenDemoModal('Professional Plan')}
          />
        </SectionReveal>

        {/* Footer */}
        <Footer />

        {/* Real Live Voice Agent Modal with 2 Steps (Persona Selector + Custom Live Voice Globe) */}
        <LiveVoiceAgentModal
          isOpen={isCallModalOpen}
          onClose={() => setIsCallModalOpen(false)}
        />

        {/* Enterprise Sandbox & Demo Request Modal */}
        <EnterpriseDemoModal
          isOpen={isDemoModalOpen}
          onClose={() => setIsDemoModalOpen(false)}
          initialPlan={selectedPlanForDemo}
        />
      </div>
    </ThemeProvider>
  );
}
