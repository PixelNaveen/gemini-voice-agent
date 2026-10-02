export interface CallScenario {
  id: string;
  name: string;
  industry: string;
  caller: {
    name: string;
    phone: string;
    status: string;
    avatar?: string;
  };
  duration: string;
  messages: {
    sender: 'caller' | 'receptionist';
    text: string;
    time: string;
    action?: string;
  }[];
  extractedData: {
    service: string;
    date: string;
    time: string;
    specialRequest?: string;
    sentimentScore: number;
    sentimentLabel: string;
  };
}

export interface IndustryCase {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  image: string;
  statNumber: string;
  statLabel: string;
  secondaryStat: string;
  quote: string;
  dialogueSnippet: {
    caller: string;
    receptionist: string;
  };
}

export interface PricingPlan {
  id: string;
  name: string;
  priceMonthly: number;
  priceAnnual: number;
  period: string;
  description: string;
  isPopular?: boolean;
  features: string[];
  ctaText: string;
}
