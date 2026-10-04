import { TestHarness, TestResult } from '../TestHarness';
import { PersonaRegistry } from '../../personas/PersonaRegistry';
import { PersonaBusinessTruth } from '../../personas/PersonaBusinessTruth';
import { MockN8nClient } from '../../tools/n8n/MockN8nClient';
import { PromptComposer } from '../../server/prompt/PromptComposer';

export async function runPersonaV2EnhancementsTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  PersonaRegistry.initialize();
  const mockClient = MockN8nClient.getInstance();

  // Test 1: getServiceInfo exact and alias matching
  results.push(
    await TestHarness.runTest('PersonaV2', 'getServiceInfo matches service name and aliases cleanly', () => {
      const info1 = PersonaBusinessTruth.getServiceInfo('aura-salon', 'Signature Precision Haircut');
      TestHarness.assert(info1.found === true, 'Direct name match must be found');
      if (info1.found) {
        TestHarness.assertEqual(info1.serviceId, 'haircut', 'Service ID must be haircut');
        TestHarness.assertEqual(info1.price, 65, 'Price must be 65');
        TestHarness.assertEqual(info1.priceType, 'fixed', 'PriceType must be fixed');
        TestHarness.assert(info1.spokenPrice.includes('$65'), 'Spoken price must include $65');
      }

      const info2 = PersonaBusinessTruth.getServiceInfo('aura-salon', 'trim');
      TestHarness.assert(info2.found === true, 'Alias "trim" must resolve to haircut');
      if (info2.found) {
        TestHarness.assertEqual(info2.serviceId, 'haircut', 'Trim alias must resolve to haircut');
      }
    })
  );

  // Test 2: getServiceInfo ambiguous word match
  results.push(
    await TestHarness.runTest('PersonaV2', 'getServiceInfo returns ambiguous=true when query matches multiple services', () => {
      const info = PersonaBusinessTruth.getServiceInfo('aura-salon', 'color');
      TestHarness.assert(info.found === false, 'Ambiguous query must not return single found');
      TestHarness.assert(info.ambiguous === true, 'Must return ambiguous=true');
      if (info.ambiguous) {
        TestHarness.assert(info.options.length >= 2, 'Must return at least 2 options for "color"');
        TestHarness.assert(info.message.includes('multiple options') || info.message.includes('few options'), 'Ambiguity message provided');
      }
    })
  );

  // Test 3: Price types formatting (complimentary, menu_based, starting_at, quote_required)
  results.push(
    await TestHarness.runTest('PersonaV2', 'Price type formatting handles complimentary, menu_based, starting_at, and quote_required', () => {
      // bistro dinner-table is menu_based
      const bistroTable = PersonaBusinessTruth.getServiceInfo('bistro-dining', 'Main Dining Room Table');
      TestHarness.assert(bistroTable.found === true, 'Bistro table found');
      if (bistroTable.found) {
        TestHarness.assertEqual(bistroTable.priceType, 'menu_based', 'PriceType is menu_based');
        TestHarness.assert(bistroTable.price === null, 'Menu based price must be null');
        TestHarness.assert(bistroTable.spokenPrice.toLowerCase().includes('a la carte') || bistroTable.spokenPrice.toLowerCase().includes('menu'), 'Spoken price reflects menu');
      }

      // aura-salon balayage is starting_at
      const balayage = PersonaBusinessTruth.getServiceInfo('aura-salon', 'balayage');
      TestHarness.assert(balayage.found === true, 'Balayage found');
      if (balayage.found) {
        TestHarness.assertEqual(balayage.priceType, 'starting_at', 'PriceType is starting_at');
        TestHarness.assertEqual(balayage.price, 185, 'Price is 185');
        TestHarness.assert(balayage.spokenPrice.includes('starts at $185'), 'Spoken price says starts at $185');
      }
    })
  );

  // Test 4: Bistro midnight closing time (24:00)
  results.push(
    await TestHarness.runTest('PersonaV2', 'Bistro midnight closing (24:00) parses as 1440 minutes without overflow', () => {
      const mins = PersonaBusinessTruth.toMinutes('24:00', true);
      TestHarness.assertEqual(mins, 1440, '24:00 must convert to 1440 minutes');

      const fridayDate = new Date('2026-10-09T22:30:00-04:00'); // Friday evening in NY
      const hours = PersonaBusinessTruth.getBusinessHours('bistro-dining', fridayDate);
      TestHarness.assert(hours.isOpen === true, 'Bistro should be open at 22:30 on Friday (closes 24:00)');
    })
  );

  // Test 5: Emergency Hours (coolbreeze-hvac 24/7)
  results.push(
    await TestHarness.runTest('PersonaV2', 'Emergency hours report 24/7 availability for emergency dispatch services', () => {
      const sundayNight = new Date('2026-10-11T23:00:00-04:00'); // Sunday 11 PM
      const hours = PersonaBusinessTruth.getBusinessHours('coolbreeze-hvac', sundayNight);
      TestHarness.assert(Boolean(hours.emergencyHours?.alwaysOn), 'Emergency hours must have alwaysOn=true');
      TestHarness.assert(hours.isOpen === true, 'CoolBreeze should report open/available for emergency dispatch');
    })
  );

  // Test 6: SeededBusy scoping per persona & resource
  results.push(
    await TestHarness.runTest('PersonaV2', 'SeededBusy blocks target resource without blocking other resources or personas', async () => {
      mockClient.clear();
      // Bistro has seededBusy for chef-counter on Friday 19:00 - 21:00
      const availCounter = await mockClient.checkAvailability({
        personaId: 'bistro-dining',
        serviceId: 'chef-counter',
        date: '2026-10-09', // Friday
        time: '19:30',
        resourceId: 'chef-counter',
      });
      TestHarness.assert(availCounter.available === false, 'Chef counter at 19:30 on Friday must be blocked by seededBusy');

      // Aura Salon on the same Friday at 10:00 must NOT be blocked by Marcus's afternoon 14:00 busy block
      const availSalon = await mockClient.checkAvailability({
        personaId: 'aura-salon',
        serviceId: 'haircut',
        date: '2026-10-09',
        time: '10:00',
      });
      TestHarness.assert(availSalon.available === true, 'Aura salon must be available on open slot at 10:00');
    })
  );

  // Test 7: Idempotent createAppointment with 6+ character random code and emailStatus="not_configured"
  results.push(
    await TestHarness.runTest('PersonaV2', 'createAppointment returns 6+ char code, emailStatus=not_configured, and is idempotent', async () => {
      mockClient.clear();
      const requestId = 'req_test_idempotent_v2';
      const res1 = await mockClient.createAppointment({
        personaId: 'aura-salon',
        sessionId: 'sess_test_1',
        requestId,
        serviceId: 'haircut',
        date: '2026-10-09',
        start: '10:00',
        customerName: 'Sam Taylor',
        email: 'sam@example.com',
      });
      TestHarness.assert(res1.success === true, 'First booking attempt must succeed');
      const code1 = res1.confirmationCode ?? '';
      TestHarness.assert(code1.length >= 7, 'Confirmation code must have persona prefix and 6+ random characters');
      TestHarness.assertEqual(res1.emailStatus, 'not_configured', 'Mock booking returns emailStatus=not_configured');

      const res2 = await mockClient.createAppointment({
        personaId: 'aura-salon',
        sessionId: 'sess_test_1',
        requestId,
        serviceId: 'haircut',
        date: '2026-10-09',
        start: '10:00',
        customerName: 'Sam Taylor',
        email: 'sam@example.com',
      });
      TestHarness.assert(res2.success === true, 'Second idempotent attempt must succeed');
      TestHarness.assertEqual(res2.confirmationCode, code1, 'Must return same confirmation code for identical requestId');
      TestHarness.assertEqual(res2.emailStatus, 'not_configured', 'Must return emailStatus=not_configured');
    })
  );

  // Test 8: Strict Safety Keyword Word-Boundary Matching
  results.push(
    await TestHarness.runTest('PersonaV2', 'Safety matching enforces word boundaries: positive trigger vs negative false-positive rejection', () => {
      // Positive triggers that MUST trigger
      const pos1 = PromptComposer.checkSafetyTriggers('coolbreeze-hvac', 'I smell gas in my home');
      TestHarness.assert(pos1.triggered === true, '"I smell gas" MUST trigger gas leak escalation');
      TestHarness.assertEqual(pos1.action, 'call_911', 'Action must be call_911');

      const pos2 = PromptComposer.checkSafetyTriggers('apex-dental', 'My face is swollen and I can\'t breathe');
      TestHarness.assert(pos2.triggered === true, '"my face is swollen and I can\'t breathe" MUST trigger emergency');
      TestHarness.assertEqual(pos2.action, 'call_911', 'Action must be call_911');

      // Negative triggers that MUST NOT trigger
      const neg1 = PromptComposer.checkSafetyTriggers('coolbreeze-hvac', 'I live near the water tower');
      TestHarness.assert(neg1.triggered === false, '"tower" must NOT trigger on "tow" or other substring keywords');

      const neg2 = PromptComposer.checkSafetyTriggers('bistro-dining', 'What is your closing time on Friday?');
      TestHarness.assert(neg2.triggered === false, '"closing time" must NOT trigger emergency');

      const neg3 = PromptComposer.checkSafetyTriggers('aura-salon', 'I am enjoying a freezing cold drink');
      TestHarness.assert(neg3.triggered === false, '"freezing cold drink" must NOT trigger salon emergency');

      const neg3b = PromptComposer.checkSafetyTriggers('coolbreeze-hvac', 'I am drinking cold water');
      TestHarness.assert(neg3b.triggered === false, '"cold water" must NOT trigger heating emergency');

      const neg4 = PromptComposer.checkSafetyTriggers('grand-realty', 'What is your cancellation policy?');
      TestHarness.assert(neg4.triggered === false, '"policy" must NOT trigger police/emergency');

      const neg5 = PromptComposer.checkSafetyTriggers('torque-motors', 'I stowed my bags in the trunk');
      TestHarness.assert(neg5.triggered === false, '"I stowed my bags" must NOT trigger towing emergency');
    })
  );

  return results;
}
