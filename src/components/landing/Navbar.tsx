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
      className={`fixed top-0 left-0 right-0 w-full z-50 transition-all duration-500 ease-out ${
        isScrolled
          ? 'bg-white/75 backdrop-blur-2xl saturate-180 border-b border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.04)] py-2.5 sm:py-3'
          : 'bg-transparent border-b border-transparent shadow-none py-4 sm:py-5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3 sm:gap-4">
          {/* Zone 1: Single text element wordmark with reactive pulsing dot */}
          <a
            href="/"
            className="flex items-center gap-2 group text-neutral-950 font-medium tracking-tight text-lg sm:text-xl focus:outline-hidden shrink-0"
          >
            <div className="relative flex items-center justify-center">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-accent transition-transform duration-300 group-hover:scale-125" />
              <span className="absolute w-4 h-4 rounded-full bg-emerald-500/30 animate-ping pointer-events-none" />
            </div>
            <span className="font-semibold tracking-tight">Aura AI</span>
          </a>

          {/* Zone 2: Navigation links (Desktop lg+ only) - morphs from floating capsule in State A to direct in-bar in State B */}
          <nav
            onMouseLeave={() => setHoveredLink(null)}
            className={`hidden lg:flex items-center gap-1 text-sm font-medium text-neutral-700 transition-all duration-500 ease-out ${
              isScrolled
                ? 'bg-transparent backdrop-blur-none border border-transparent shadow-none px-0 py-0'
                : 'bg-white/70 backdrop-blur-xl border border-white/80 shadow-sm px-3.5 py-1.5 rounded-full'
            }`}
          >
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onMouseEnter={() => setHoveredLink(link.href)}
                className="relative px-3.5 py-1.5 rounded-full text-xs xl:text-sm font-medium transition-colors hover:text-neutral-950"
              >
                {hoveredLink === link.href && (
                  <motion.div
                    layoutId="navHoverPill"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="absolute inset-0 bg-neutral-900/[0.06] backdrop-blur-md rounded-full -z-10 border border-neutral-900/[0.04]"
                  />
                )}
                {link.label}
              </a>
            ))}
          </nav>

          {/* Zone 3: Action Buttons & Responsive Mobile/Tablet Access */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Call Action Button (All devices) */}
            <ShinyButton
              variant="secondary"
              onClick={onOpenCallModal}
              className="px-3 sm:px-3.5 lg:px-4 py-1.5 sm:py-2 text-[11px] sm:text-xs font-medium backdrop-blur-md bg-white/80 border border-white/90 shadow-2xs"
            >
              <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="hidden sm:inline">Talk to Receptionist</span>
              <span className="sm:hidden">Call</span>
            </ShinyButton>

            {/* Experience AI Demo Action Button (Desktop lg+ only to keep tablet uncluttered) */}
            <div className="hidden lg:block">
              <ShinyButton
                variant="primary"
                onClick={onOpenDemoModal}
                className="px-3.5 lg:px-4 py-2 text-xs font-medium shadow-md shadow-emerald-900/10"
              >
                <span>Experience AI</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </ShinyButton>
            </div>

            {/* Mobile / Tablet Hamburger Toggle Button (< lg) */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-xl text-neutral-800 hover:text-neutral-950 bg-white/80 backdrop-blur-xl border border-white/90 hover:bg-white focus:outline-hidden transition-all shadow-2xs cursor-pointer active:scale-95"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Tablet & Mobile dropdown drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0, filter: 'blur(8px)' }}
            animate={{ opacity: 1, height: 'auto', filter: 'blur(0px)' }}
            exit={{ opacity: 0, height: 0, filter: 'blur(8px)' }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="lg:hidden overflow-hidden bg-white/80 backdrop-blur-3xl saturate-200 border-b border-white/70 shadow-[0_16px_40px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] px-5 sm:px-6 py-5 space-y-4"
          >
            <nav className="flex flex-col space-y-1 text-sm font-medium text-neutral-800">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="hover:text-neutral-950 py-2.5 px-3.5 rounded-xl hover:bg-neutral-900/5 transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <div className="pt-3 border-t border-neutral-200/50 flex flex-col gap-2.5">
              <ShinyButton
                variant="primary"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenDemoModal();
                }}
                className="w-full py-3 text-xs font-medium shadow-md shadow-emerald-900/10"
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
