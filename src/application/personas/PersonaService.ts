import { PersonaRegistry } from '../../personas/PersonaRegistry';
import { PersonaListResponseDto, PersonaResponseDto } from '../../api/dto/PersonaDtos';

export class PersonaService {
  public static listPersonas(): PersonaListResponseDto {
    const list = PersonaRegistry.list();
    const personas: PersonaResponseDto[] = list.map((p) => ({
      id: p.id,
      name: p.identity.businessName || p.identity.name,
      industry: p.id.replace('aura-', '').replace('-dining', '').replace('-hvac', '').replace('-motors', '').replace('-dental', ''),
      version: p.version,
      role: p.identity.role,
      tagline: p.identity.tagline || p.identity.description,
      services: p.services.map((s) => ({
        name: s.name,
        durationMinutes: s.durationMinutes,
        price: typeof s.price === 'number' ? s.price : undefined,
      })),
      workingHours: '09:00 - 18:00',
    }));

    return {
      personas,
      total: personas.length,
    };
  }

  public static getPersona(id: string): PersonaResponseDto {
    const p = PersonaRegistry.get(id);
    return {
      id: p.id,
      name: p.identity.businessName || p.identity.name,
      industry: p.id.replace('aura-', '').replace('-dining', '').replace('-hvac', '').replace('-motors', '').replace('-dental', ''),
      version: p.version,
      role: p.identity.role,
      tagline: p.identity.tagline || p.identity.description,
      services: p.services.map((s) => ({
        name: s.name,
        durationMinutes: s.durationMinutes,
        price: typeof s.price === 'number' ? s.price : undefined,
      })),
      workingHours: '09:00 - 18:00',
    };
  }
}
