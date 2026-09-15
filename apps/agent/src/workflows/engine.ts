import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { newId } from "@voice-agent/shared";
import type { McpManager } from "../mcp/manager.js";
import type { PolicyEngine } from "../permissions/policy.js";
import type { Database } from "../storage/db.js";

const StepSchema = z.object({
  name: z.string(),
  tools: z.array(z.string()).default([]),
  approval: z.enum(["auto", "ask"]).default("auto"),
  verify: z.string().optional(),
  rollback: z.string().optional(),
});
const WorkflowSchema = z.object({
  id: z.string(),
  description: z.string().optional(),
  steps: z.array(StepSchema),
});
export type Workflow = z.infer<typeof WorkflowSchema>;

/** Declarative YAML workflows (FR-WF-01..05). LLM may choose how within a step, never reorder/skip/add (FR-WF-02). */
export class WorkflowEngine {
  constructor(private mcp: McpManager, private policy: PolicyEngine, private db: Database) {}

  loadFile(path: string): Workflow {
    const raw = readFileSync(path, "utf8");
    return WorkflowSchema.parse(parseYaml(raw));
  }

  /** Dry-run: report planned actions without side effects (FR-WF-03). */
  dryRun(wf: Workflow): Array<{ step: string; tools: string[]; approval: string }> {
    return wf.steps.map((s) => ({ step: s.name, tools: s.tools, approval: s.approval }));
  }

  async run(wf: Workflow, taskId = newId("task"), conversationId = ""): Promise<{ runId: string; status: string; steps: unknown[] }> {
    const runId = newId("wfrun");
    const results: unknown[] = [];
    let status = "completed";
    for (const step of wf.steps) {
      const stepResult: Record<string, unknown> = { name: step.name, status: "running", outputs: [] };
      try {
        for (const toolId of step.tools) {
          const [server, tool] = toolId.split(".");
          if (!server || !tool) throw new Error(`Bad tool id in workflow: ${toolId}`);
          const verdict = this.policy.evaluate({ server, tool, input: {} });
          if (verdict === "deny") throw new Error(`Policy denied ${toolId} in step ${step.name}`);
          const out = await this.mcp.callTool(server, tool, {}, AbortSignal.timeout(120_000));
          (stepResult.outputs as unknown[]).push({ tool: toolId, output: out });
        }
        stepResult.status = "completed";
      } catch (err) {
        stepResult.status = "failed";
        (stepResult as Record<string, unknown>).error = String(err);
        status = "failed";
        results.push(stepResult);
        break; // rollback handled by workflow definition consumer; persisted for resume (FR-WF-04)
      }
      results.push(stepResult);
    }
    try { this.db.recordWorkflowRun(runId, wf.id, taskId || conversationId, status, results); } catch { /* db best-effort */ }
    return { runId, status, steps: results };
  }
}
