import { z } from "zod";

/** Zod validation for tool I/O and config (FR-MCP-07, FR-DATA-02). */

export const WorkspacePathSchema = z.string().min(1);

export const FilesystemReadSchema = z.object({ path: z.string().min(1) });
export const FilesystemWriteSchema = z.object({ path: z.string().min(1), content: z.string() });
export const FilesystemListSchema = z.object({ dir: z.string().min(1) });
export const FilesystemSearchSchema = z.object({ root: z.string().min(1), pattern: z.string().min(1) });
export const FilesystemMoveSchema = z.object({ from: z.string().min(1), to: z.string().min(1) });
export const FilesystemDeleteSchema = z.object({ path: z.string().min(1) });

export const ShellExecSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().optional(),
  timeoutMs: z.number().int().positive().max(300_000).default(30_000),
});

export const ProcessStartSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().optional(),
});
export const ProcessStopSchema = z.object({ pid: z.number().int().positive() });

export const ServiceControlSchema = z.object({ name: z.string().min(1) });

export const BrowserNavigateSchema = z.object({ url: z.string().url() });
export const BrowserClickSchema = z.object({ selector: z.string().min(1) });
export const BrowserTypeSchema = z.object({ selector: z.string().min(1), text: z.string() });

export const ComputerClickSchema = z.object({ x: z.number().int(), y: z.number().int() });
export const ComputerTypeSchema = z.object({ text: z.string() });
export const ComputerKeySchema = z.object({ key: z.string().min(1) });

export const McpServerConfigSchema = z.object({
  name: z.string().min(1),
  transport: z.enum(["stdio", "http"]),
  command: z.string().optional(),
  args: z.array(z.string()).default([]),
  url: z.string().url().optional(),
  env: z.record(z.string()).default({}),
  enabled: z.boolean().default(true),
});

export const AgentConfigSchema = z.object({
  agent: z.object({
    provider: z.enum(["openrouter", "nvidia"]).default("openrouter"),
    defaultModel: z.string().default("openai/gpt-4o-mini"),
    workspaceRoots: z.array(z.string()).default([]),
    localhostPort: z.number().int().default(3790),
    authToken: z.string().default("dev-token-change-me"),
  }).default({}),
  voice: z.object({
    asrModel: z.enum(["distil-small.en", "tiny.en", "distil-large-v3"]).default("distil-small.en"),
    minSpeechMs: z.number().default(200),
    minSilenceMs: z.number().default(600),
    speechPaddingMs: z.number().default(150),
    bargeInPersistenceMs: z.number().default(150),
  }).default({}),
  permissions: z.object({
    writeInsideWorkspace: z.enum(["auto", "ask"]).default("auto"),
  }).default({}),
  mcpServers: z.array(McpServerConfigSchema).default([]),
  opencode: z.object({
    baseUrl: z.string().default("http://127.0.0.1:4096"),
    projectPath: z.string().optional(),
  }).default({}),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;
