import { describe, it, expect } from "vitest";
import { PolicyEngine } from "../src/permissions/policy.js";

describe("policy engine (BRD §13.8 defaults)", () => {
  it("auto-approves reads, asks deletes, denies outside workspace", () => {
    const p = new PolicyEngine();
    p.configure({ workspaceRoots: ["C:\\work"] });
    expect(p.evaluate({ server: "filesystem", tool: "read", input: { path: "C:\\work\\a.txt" } })).toBe("auto");
    expect(p.evaluate({ server: "filesystem", tool: "delete", input: { path: "C:\\work\\a.txt" } })).toBe("ask");
    expect(p.evaluate({ server: "filesystem", tool: "read", input: { path: "C:\\Windows\\secret.txt" } })).toBe("deny");
    expect(p.evaluate({ server: "filesystem", tool: "write", input: { path: "C:\\evil\\x.txt" } })).toBe("deny");
  });
  it("requires approval for kill/process and shell", () => {
    const p = new PolicyEngine();
    expect(p.evaluate({ server: "process", tool: "stop", input: { pid: 1 } })).toBe("ask");
    expect(p.evaluate({ server: "shell", tool: "exec", input: { command: "git" } })).toBe("ask");
  });
});
