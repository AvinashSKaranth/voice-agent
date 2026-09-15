import { describe, it, expect } from "vitest";
import { WorkflowEngine } from "../src/workflows/engine.js";
import { McpManager } from "../src/mcp/manager.js";
import { PolicyEngine } from "../src/permissions/policy.js";
import { Database } from "../src/storage/db.js";
describe("workflow engine (FR-WF)", () => {
    it("dry-run reports steps; run executes in order and persists", async () => {
        const mcp = new McpManager();
        const calls = [];
        mcp.registerTool("http", "health_check", "h", {}, async () => { calls.push("http.health_check"); return { ok: true }; });
        const db = new Database(":memory:");
        const engine = new WorkflowEngine(mcp, new PolicyEngine(), db);
        const wf = { id: "deploy-service", steps: [{ name: "health", tools: ["http.health_check"], approval: "auto" }] };
        expect(engine.dryRun(wf)).toEqual([{ step: "health", tools: ["http.health_check"], approval: "auto" }]);
        const res = await engine.run(wf, "task_1", "conv_1");
        expect(res.status).toBe("completed");
        expect(calls).toEqual(["http.health_check"]);
        db.close();
    });
});
//# sourceMappingURL=workflows.test.js.map