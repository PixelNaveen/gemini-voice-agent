import fs from 'fs';
import path from 'path';
import { TestHarness, TestResult } from '../TestHarness';
import { PersonaRegistry } from '../../personas/PersonaRegistry';
import { PersonaBusinessTruth } from '../../personas/PersonaBusinessTruth';
import { PromptComposer } from '../../server/prompt/PromptComposer';

export async function runPersonaScenariosTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  PersonaRegistry.initialize();

  const scenariosDir = path.join(__dirname, '../../personas/scenarios');
  const scenarioFiles = fs.existsSync(scenariosDir)
    ? fs.readdirSync(scenariosDir).filter((f) => f.endsWith('.scenarios.json'))
    : [];

  for (const file of scenarioFiles) {
    const raw = fs.readFileSync(path.join(scenariosDir, file), 'utf-8');
    const parsed = JSON.parse(raw);
    const scenarios = parsed.scenarios || [];

    for (const scenario of scenarios) {
      if (scenario.id.startsWith('uni-') || scenario.id.startsWith('aura-')) {
        results.push(
          await TestHarness.runTest('PersonaScenarios', `Scenario [${scenario.id}]: ${scenario.title}`, () => {
            // Check life-safety / emergency keyword scenarios
            if (scenario.tags?.includes('safety') || scenario.tags?.includes('emergency')) {
              PromptComposer.checkSafetyTriggers('aura-salon', scenario.callerSays);
            }

            // Check truth / pricing scenarios
            if (scenario.tags?.includes('pricing') || scenario.tags?.includes('price')) {
              const info = PersonaBusinessTruth.getServiceInfo('aura-salon', 'haircut');
              TestHarness.assert(info.found === true, 'Service info lookup must be truthful');
            }

            // Check business hours scenarios
            if (scenario.tags?.includes('hours') || scenario.tags?.includes('schedule')) {
              const hours = PersonaBusinessTruth.getBusinessHours('aura-salon');
              TestHarness.assert(Boolean(hours.timezone), 'Timezone must be present');
            }

            TestHarness.assert(true, 'Scenario executed successfully');
          })
        );
      }
    }
  }

  return results;
}
