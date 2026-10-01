import { PersonaDefinition } from '../../personas/schema/persona.types';

export interface PersonaRecord {
  id: string;
  tenantId: string;
  personaKey: string;
  version: string;
  name: string;
  industry: string;
  definition: PersonaDefinition;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}
