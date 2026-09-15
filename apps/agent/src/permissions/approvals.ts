import { newId } from "@voice-agent/shared";

export type ApprovalDecision = "allow-once" | "allow-task" | "allow-workspace" | "deny";

/**
 * Pending approvals, answerable by voice ("yes"/"no") or click (FR-PERM-03).
 * once/task/workspace scopes (FR-PERM-04).
 */
export class ApprovalStore {
  private pending = new Map<string, { taskId: string; tool: string; input: unknown; resolve: (d: ApprovalDecision) => void }>();

  request(taskId: string, tool: string, input: unknown): string {
    const id = newId("appr");
    let resolve!: (d: ApprovalDecision) => void;
    const promise = new Promise<ApprovalDecision>((res) => { resolve = res; });
    void promise;
    this.pending.set(id, { taskId, tool, input, resolve });
    return id;
  }

  decide(id: string, decision: ApprovalDecision): boolean {
    const p = this.pending.get(id);
    if (!p) return false;
    this.pending.delete(id);
    p.resolve(decision);
    return true;
  }

  decideByVoice(text: string): string | null {
    const norm = text.trim().toLowerCase();
    const yes = /^(yes|yeah|yep|go ahead|approved|approve|do it)/.test(norm);
    const no = /^(no|nope|stop|cancel|don't|deny)/.test(norm);
    if (!yes && !no) return null;
    const first = [...this.pending.keys()][0];
    if (!first) return null;
    this.decide(first, yes ? "allow-once" : "deny");
    return first;
  }

  waitFor(id: string, signal: AbortSignal): Promise<ApprovalDecision> {
    const p = this.pending.get(id);
    if (!p) return Promise.resolve("deny");
    return new Promise<ApprovalDecision>((resolve) => {
      const cleanup = () => signal.removeEventListener("abort", onAbort);
      const onAbort = () => { this.pending.delete(id); cleanup(); resolve("deny"); };
      signal.addEventListener("abort", onAbort, { once: true });
      const base = p.resolve;
      p.resolve = (d) => { cleanup(); base(d); resolve(d); };
    });
  }

  pendingIds(): string[] { return [...this.pending.keys()]; }
}
