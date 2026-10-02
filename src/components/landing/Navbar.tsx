import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, ArrowUpRight, Menu, X, Sparkles } from 'lucide-react';
import { ShinyButton } from './motion/ShinyButton.tsx';

interface NavbarProps {
  onOpenCallModal: () => void;
  onOpenDemoModal: () => void;
}

const NAV_LINKS = [
  { href: '#principles', label: 'Product' },
  { href: '#understanding', label: 'Technology' },
  { href: '#industries', label: 'Industries' },
  { href: '#architecture', label: 'Architecture' },
  { href: '#security', label: 'Security' },
  { href: '#pricing', label: 'Pricing' },
];

export const Navbar: React.FC<NavbarProps> = ({ onOpenCallModal, onOpenDemoModal }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'glass-panel shadow-xs py-2.5 sm:py-3'
          : 'bg-transparent py-4 sm:py-5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          {/* Zone 1: Single text element wordmark with reactive pulsing dot */}
          <a
            href="/"
            className="flex items-center gap-2 group text-neutral-950 font-medium tracking-tight text-xl focus:outline-hidden shrink-0"
          >
            <div className="relative flex items-center justify-center">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-accent transition-transform duration-300 group-hover:scale-125" />
              <span className="absolute w-4 h-4 rounded-full bg-emerald-500/30 animate-ping pointer-events-none" />
            </div>
            <span className="font-semibold tracking-tight">Aura AI</span>
          </a>

          {/* Zone 2: Navigation links with animated hover pill (Desktop & Large Tablet) */}
          <nav
            onMouseLeave={() => setHoveredLink(null)}
            className="hidden lg:flex items-center gap-1 text-sm font-medium text-neutral-600 bg-white/60 backdrop-blur-md px-3 py-1 rounded-full border border-neutral-200/70 shadow-2xs"
          >
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onMouseEnter={() => setHoveredLink(link.href)}
                className="relative px-3.5 py-1.5 rounded-full text-xs xl:text-sm transition-colors hover:text-neutral-950"
              >
                {hoveredLink === link.href && (
                  <motion.div
                    layoutId="navHoverPill"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    className="absolute inset-0 bg-neutral-100 rounded-full -z-10"
                  />
                )}
                {link.label}
              </a>
            ))}
          </nav>

          {/* Zone 3: Action Buttons (Responsive on Mobile, Tablet & Desktop) */}
          <div className="hidden sm:flex items-center gap-2 sm:gap-2.5">
            <ShinyButton
              variant="secondary"
              onClick={onOpenCallModal}
              className="px-3.5 lg:px-4 py-2 text-xs font-medium"
            >
              <Phone className="w-3.5 h-3.5 text-emerald-600" />
              <span>Talk to Receptionist</span>
            </ShinyButton>

            <ShinyButton
              variant="primary"
              onClick={onOpenDemoModal}
              className="px-3.5 lg:px-4 py-2 text-xs font-medium"
            >
              <span>Experience AI</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </ShinyButton>
          </div>

          {/* Tablet & Mobile hamburger button (visible < lg) */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-xl text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100/80 focus:outline-hidden transition-colors"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Tablet & Mobile drawer with AnimatePresence */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="lg:hidden overflow-hidden bg-[#FBF9F8]/95 backdrop-blur-xl border-b border-neutral-200/90 px-6 py-6 space-y-4 shadow-xl"
          >
            <nav className="flex flex-col space-y-3 text-base font-medium text-neutral-700">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="hover:text-neutral-950 py-1.5 px-2 rounded-lg hover:bg-neutral-100/70 transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <div className="pt-4 border-t border-neutral-200 flex flex-col sm:hidden gap-2.5">
              <ShinyButton
                variant="secondary"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenCallModal();
                }}
                className="w-full py-3 text-sm font-medium"
              >
                <Phone className="w-4 h-4 text-emerald-600" />
                <span>Talk to Receptionist</span>
              </ShinyButton>
              <ShinyButton
                variant="primary"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenDemoModal();
                }}
                className="w-full py-3 text-sm font-medium shadow-sm"
              >
                <span>Experience AI Receptionist</span>
                <ArrowUpRight className="w-4 h-4" />
              </ShinyButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
};
