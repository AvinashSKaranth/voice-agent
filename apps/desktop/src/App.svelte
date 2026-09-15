<script lang="ts">
  import { onMount } from "svelte";
  let state: string = "idle";
  let messages: Array<{ role: string; text: string }> = [];
  let input = "";
  let ws: WebSocket | null = null;
  let token = "dev-token-change-me";
  let log: string[] = [];

  function connect() {
    ws = new WebSocket(`ws://127.0.0.1:3790?token=${encodeURIComponent(token)}`);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.kind === "event") {
          const e = msg.payload;
          if (e.type === "llm.token") messages[messages.length - 1]!.text += e.text;
          else if (e.type === "llm.started") messages = [...messages, { role: "assistant", text: "" }];
          else if (e.type === "tool.approval_required") log = [...log, `approval: ${e.tool} (${e.approvalId})`];
          else if (e.type === "task.failed") log = [...log, `task failed: ${e.error}`];
        } else if (msg.kind === "response") {
          if (msg.payload?.conversationId) localStorage.setItem("conv", msg.payload.conversationId);
        }
      } catch {}
    };
  }
  onMount(() => { connect(); });
  function send() {
    if (!input.trim() || !ws) return;
    const conv = localStorage.getItem("conv") || "";
    messages = [...messages, { role: "user", text: input }];
    ws.send(JSON.stringify({ kind: "chat", conversationId: conv, text: input }));
    input = "";
    state = "thinking";
  }
</script>
<main style="padding:16px;max-width:760px;margin:0 auto">
  <h1>Voice Agent <small style="opacity:.6">v1 shell — Tauri/Svelte 5</small></h1>
  <p>State: <strong>{state}</strong> · mic: push-to-talk (v1) · runtime: ws://127.0.0.1:3790</p>
  <div>
    {#each messages as m}
      <div style="margin:8px 0;padding:8px;border:1px solid #2a3440;border-radius:8px"><b>{m.role}</b>: {m.text}</div>
    {/each}
  </div>
  <div style="display:flex;gap:8px;margin-top:12px">
    <input bind:value={input} placeholder="Type (voice pipeline plugs into same runtime)…" style="flex:1;padding:8px" onkeydown={(e)=>{if(e.key==='Enter')send();}} />
    <button onclick={send}>Send</button>
  </div>
  <h3>Tool activity / approvals</h3>
  <pre style="background:#0b0e11;padding:8px;border-radius:8px">{log.join("\n") || "—"}</pre>
  <p style="opacity:.6">UI never executes OS commands directly — all actions route through the agent runtime + permission layer (FR-UI-03).</p>
</main>
