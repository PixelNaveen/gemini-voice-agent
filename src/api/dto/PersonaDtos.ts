export interface PersonaResponseDto {
  id: string;
  name: string;
  industry: string;
  version: string;
  role: string;
  tagline: string;
  services: { name: string; durationMinutes: number; price?: number }[];
  workingHours: string;
}

export interface PersonaListResponseDto {
  personas: PersonaResponseDto[];
  total: number;
}
