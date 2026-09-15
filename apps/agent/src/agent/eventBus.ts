import type { AgentEvent } from "@voice-agent/protocol";

export type EventHandler = (e: AgentEvent) => void;

/** Single typed AgentEvent stream (FR-OBS-01). */
export class EventBus {
  private handlers = new Set<EventHandler>();
  emit(e: AgentEvent): void {
    for (const h of [...this.handlers]) {
      try { h(e); } catch (err) { console.error(JSON.stringify({ level: "error", msg: "event-handler-failed", event: e, err: String(err) })); }
    }
  }
  subscribe(h: EventHandler): () => void {
    this.handlers.add(h);
    return () => { this.handlers.delete(h); };
  }
}
