import { IndustryPreset } from '../../types';
import { ConversationRuntimeState } from '../conversation';
import { MissingInfoResolver } from '../entities';
import { KnowledgeResolver } from '../../knowledge';
import { MemoryManager } from './MemoryManager';
import { TranscriptStore } from './TranscriptStore';

export interface ModelContextPayload {
  /**
   * Conversation context only.
   *
   * This used to also carry a `systemInstruction` composed here from the persona prompt. That
   * field was a second prompt authority: the server assembles the real system instruction and
   * ignores anything the client sends for it, so this copy was never transmitted and never
   * used. Its presence was actively harmful - it read as though the browser owned the prompt,
   * which is the exact boundary F-14 was closed to enforce, and it is why a client-side prompt
   * bug could look like a live feature while having no effect on the model.
   */
  compiledContext: string;
}

export class ContextBuilder {
  /**
   * Compiles the multi-layer context for Gemini Live real-time session.
   * Incorporates knowledge authority hierarchy, missing info analysis, and deterministic facts.
   */
  public static buildContext(
    preset: IndustryPreset,
    runtimeState: ConversationRuntimeState,
    memoryManager: MemoryManager,
    transcriptStore: TranscriptStore,
    recentTurnsLimit = 8,
    isRecovery = false
  ): ModelContextPayload {
    const now = new Date();

    // 1. Missing Info & Next Step Analysis
    const analysis = MissingInfoResolver.analyze(
      runtimeState.entities,
      preset.id,
      runtimeState.intent || 'BOOKING'
    );

    // 2. Authoritative Knowledge Resolution (Section 10 Hierarchy)
    const recentTranscriptItems = transcriptStore.getRecent(1);
    const lastUserText = recentTranscriptItems.length > 0 ? recentTranscriptItems[0].text : '';
    const authoritativeFacts = KnowledgeResolver.resolveContextualFacts(
      preset.id,
      runtimeState,
      lastUserText
    );

    const factLines = authoritativeFacts.map(
      (f) => `- [${f.source} (Auth: ${f.authority})] ${f.key}: ${JSON.stringify(f.value)}`
    );

    // 3. Active Runtime State & Entity Truth
    //
    // Everything below is conversation context: what the caller already said, what is confirmed,
    // what is still missing. It is sent as data alongside the server's system instruction and
    // cannot override it. The instruction itself is assembled by `PromptAuthority` on the
    // server, which owns the persona prompt, the business-truth block, and the fenced
    // operator override.
    const entities = runtimeState.entities;
    const entityLines: string[] = [];
    if (entities.service?.value) entityLines.push(`- Service: ${entities.service.value} [${entities.service.status}]`);
    if (entities.date?.value) {
      const displayDate = typeof entities.date.value === 'string' ? entities.date.value : entities.date.value.display;
      entityLines.push(`- Date: ${displayDate} [${entities.date.status}]`);
    }
    if (entities.time?.value) {
      const displayTime = typeof entities.time.value === 'string' ? entities.time.value : entities.time.value.display;
      entityLines.push(`- Time: ${displayTime} [${entities.time.status}]`);
    }
    if (entities.customerName?.value) entityLines.push(`- Caller Name: ${entities.customerName.value} [${entities.customerName.status}]`);
    if (entities.email?.value) entityLines.push(`- Caller Email: ${entities.email.value} [${entities.email.status}]`);
    if (entities.phone?.value) entityLines.push(`- Caller Phone: ${entities.phone.value} [${entities.phone.status}]`);
    if (entities.partySize?.value) entityLines.push(`- Party Size: ${entities.partySize.value} guests [${entities.partySize.status}]`);
    if (entities.vehicleInfo?.value) entityLines.push(`- Vehicle: ${entities.vehicleInfo.value} [${entities.vehicleInfo.status}]`);

    const runtimeSummary = [
      `=== AUTHORITATIVE APPLICATION RUNTIME STATE ===`,
      `Active Intent: ${runtimeState.intent || 'GENERAL_INQUIRY'}`,
      `Conversation Stage: ${runtimeState.state}`,
      `Confirmed / Known Entities:`,
      entityLines.length > 0 ? entityLines.join('\n') : '- No entities confirmed yet.',
      ``,
      `Next Required Step: ${analysis.guidancePrompt || 'Respond naturally to the caller’s inquiry.'}`,
      analysis.missingRequired.length > 0 ? `Missing Fields: ${analysis.missingRequired.join(', ')}` : 'All required fields collected!',
      ``,
      `Authoritative Knowledge Facts:`,
      factLines.length > 0 ? factLines.join('\n') : '- No specific business facts triggered.',
    ].join('\n');

    // 5. Structured Memory Facts & Caller Profile
    const memorySummary = memoryManager.formatForModelContext();

    // 6. Recent Dialog Window (Last 6-8 turns only to prevent token bloat & context confusion)
    const recentDialog = [
      `=== RECENT CONVERSATIONAL TURNS (LAST ${recentTurnsLimit}) ===`,
      transcriptStore.formatForModel(recentTurnsLimit),
    ].join('\n');

    const compiledContext = [
      runtimeSummary,
      ``,
      memorySummary,
      ``,
      recentDialog,
    ].join('\n');

    return {
      compiledContext,
    };
  }
}
