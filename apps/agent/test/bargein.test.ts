import { describe, it, expect } from "vitest";
import { ConversationState } from "../src/agent/conversationState.js";

describe("barge-in state machine (FR-BI-01/02)", () => {
  it("transitions and triggers interruption after persistence", () => {
    const s = new ConversationState({ bargeInPersistenceMs: 150, minSpeechMs: 200 });
    s.toListening(); s.toThinking(); s.toSpeaking();
    expect(s.current).toBe("speaking");
    expect(s.vadWhileSpeaking(1000)).toBe(false);
    expect(s.vadWhileSpeaking(1000 + 200)).toBe(true);
    expect(s.current).toBe("interrupted");
    s.resumeListening();
    expect(s.current).toBe("listening");
  });
});
