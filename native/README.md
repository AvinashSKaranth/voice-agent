# Native adapters (whisper.cpp / TTS / platform)

- `whisper/`: managed `whisper.cpp` child-process wrapper implementing `SpeechRecognizer`.
  Models (GGML Q5): `distil-small.en` default (~100–170MB), `tiny.en` fallback.
  Downloaded on first run with progress + checksum (NFR-13). See `models/README.md`.
- `tts/`: TinyTTS ONNX in-process PCM (`SpeechSynthesizer`); Piper/Kokoro as selectable 2nd engine (R-01).
- `platform/windows/`: UI Automation + PowerShell adapters for computer-use (Phase 4).

Engines run behind interfaces in `apps/agent/src/voice/*` — no compile-time dep on a specific engine (BR-05).
