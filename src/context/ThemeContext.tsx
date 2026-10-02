import React, { createContext, useContext, useEffect, useMemo } from 'react';

/**
 * Standardized Brand Accent Tokens for Aura AI
 * Centralized definition for --color-emerald-accent and related lighting palettes.
 */
export interface BrandPalette {
  /** Hex: #059669 - Default brand accent for primary buttons, active badges, status indicators */
  emeraldAccent: string;
  /** Hex: #047857 - Deep emerald for hover and high-contrast text */
  emeraldAccentHover: string;
  /** Hex: #10B981 - Vivid emerald for dark-mode glowing highlights and animated pulses */
  emeraldAccentLight: string;
  /** Hex: #ECFDF5 - Ultra-light emerald surface tint for badges and highlights */
  emeraldAccentSurface: string;
  /** RGB triplet string: "5, 150, 105" for dynamic rgba() calculations */
  emeraldAccentRgb: string;
  /** Helper to generate rgba string safely */
  getEmeraldAlpha: (alpha: number) => string;
}

export interface ThemeContextValue {
  palette: BrandPalette;
  /** Utility class mapping for instant brand visual cohesion */
  brandClasses: {
    badge: string;
    badgeDark: string;
    buttonPrimary: string;
    buttonOutline: string;
    cardBorderHighlight: string;
    glowLight: string;
    glowDark: string;
  };
}

const DEFAULT_BRAND_PALETTE: BrandPalette = {
  emeraldAccent: '#059669',
  emeraldAccentHover: '#047857',
  emeraldAccentLight: '#10B981',
  emeraldAccentSurface: '#ECFDF5',
  emeraldAccentRgb: '5, 150, 105',
  getEmeraldAlpha: (alpha: number) => `rgba(5, 150, 105, ${alpha})`,
};

const DEFAULT_BRAND_CLASSES = {
  badge:
    'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200/80',
  badgeDark:
    'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 backdrop-blur-md',
  buttonPrimary:
    'bg-[#059669] hover:bg-[#047857] text-white shadow-sm hover:shadow-md border border-emerald-600/30 transition-all font-medium rounded-full cursor-pointer',
  buttonOutline:
    'bg-transparent hover:bg-emerald-50 text-emerald-800 border border-emerald-300 hover:border-emerald-500 transition-all font-medium rounded-full cursor-pointer',
  cardBorderHighlight: 'border-emerald-500/40 shadow-[0_0_20px_rgba(5,150,105,0.12)]',
  glowLight: 'shadow-[0_0_25px_rgba(5,150,105,0.18)]',
  glowDark: 'shadow-[0_0_30px_rgba(16,185,129,0.25)]',
};

const ThemeContext = createContext<ThemeContextValue>({
  palette: DEFAULT_BRAND_PALETTE,
  brandClasses: DEFAULT_BRAND_CLASSES,
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Sync CSS custom variables to document root to ensure global CSS & Tailwind utilities are always bound
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--color-emerald-accent', DEFAULT_BRAND_PALETTE.emeraldAccent);
    root.style.setProperty('--color-emerald-accent-hover', DEFAULT_BRAND_PALETTE.emeraldAccentHover);
    root.style.setProperty('--color-emerald-accent-light', DEFAULT_BRAND_PALETTE.emeraldAccentLight);
    root.style.setProperty('--color-emerald-accent-surface', DEFAULT_BRAND_PALETTE.emeraldAccentSurface);
    root.style.setProperty('--color-emerald-accent-rgb', DEFAULT_BRAND_PALETTE.emeraldAccentRgb);
  }, []);

  const value = useMemo(
    () => ({
      palette: DEFAULT_BRAND_PALETTE,
      brandClasses: DEFAULT_BRAND_CLASSES,
    }),
    [],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
