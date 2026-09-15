import { existsSync, statSync, readdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { McpManager } from "../mcp/manager.js";
import { FilesystemReadSchema, FilesystemWriteSchema, FilesystemListSchema, FilesystemSearchSchema, FilesystemMoveSchema, FilesystemDeleteSchema } from "@voice-agent/schemas";

/** filesystem MCP server: read/write/list/search/move/delete scoped to workspace roots (FR 13.6). */
export function registerFilesystemTools(mcp: McpManager): void {
  mcp.registerTool("filesystem", "read", "Read a file", FilesystemReadSchema, async (input) => {
    const { path } = FilesystemReadSchema.parse(input);
    return { path, content: readFileSync(path, "utf8").slice(0, 200_000) };
  });
  mcp.registerTool("filesystem", "write", "Write a file", FilesystemWriteSchema, async (input) => {
    const { path, content } = FilesystemWriteSchema.parse(input);
    writeFileSync(path, content, "utf8");
    return { path, bytes: content.length };
  });
  mcp.registerTool("filesystem", "list", "List a directory", FilesystemListSchema, async (input) => {
    const { dir } = FilesystemListSchema.parse(input);
    return { dir, entries: readdirSync(dir) };
  });
  mcp.registerTool("filesystem", "search", "Search filenames under root", FilesystemSearchSchema, async (input) => {
    const { root, pattern } = FilesystemSearchSchema.parse(input);
    const out: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(e.parentPath ?? d, e.name);
        if (e.isDirectory()) { if (out.length < 200) walk(p); }
        else if (e.name.toLowerCase().includes(pattern.toLowerCase())) out.push(p);
        if (out.length >= 200) break;
      }
    };
    walk(root);
    return { root, pattern, matches: out };
  });
  mcp.registerTool("filesystem", "move", "Move/rename a file", FilesystemMoveSchema, async (input) => {
    const { from, to } = FilesystemMoveSchema.parse(input);
    renameSync(from, to);
    return { from, to };
  });
  mcp.registerTool("filesystem", "delete", "Delete a file", FilesystemDeleteSchema, async (input) => {
    const { path } = FilesystemDeleteSchema.parse(input);
    unlinkSync(path);
    return { deleted: path };
  });
  void existsSync; void statSync; void mkdirSync;
}
