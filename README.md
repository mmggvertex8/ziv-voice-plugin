# ziv-voice-plugin

> A drop-in OpenClaw plugin that fixes the `responseModel` problem in the
> official `@openclaw/voice-call` plugin and adds an **agent routing** mode
> so callers can speak directly to your main Ziv agent session.

---

## The Problem This Solves

The official `@openclaw/voice-call` plugin exposes a `responseModel` config
field intended to control which LLM generates spoken replies. In practice the
setting is silently ignored — every voice response falls back to the main
agent model (whatever model is running the top-level Ziv session).

This plugin intercepts the `voice_transcript_received` hook _before_ the stock
plugin can respond and generates the reply itself, using whichever model and
system prompt you configure.

---

## Prerequisites

`@openclaw/voice-call` must also be installed and enabled. This plugin
**extends** it — it does not replace the Twilio webhook handling, media
streams, or speech-to-text pipeline. You need both.

---

## Installation

```bash
# From the workspace root (or wherever you keep plugin source)
openclaw plugins install ./ziv-voice-plugin
```

Then restart or reload the OpenClaw gateway so the plugin is picked up:

```bash
openclaw gateway restart
```

---

## Configuration

Add a `ziv-voice` entry to your OpenClaw plugin config (typically in
`openclaw.config.json` or through the dashboard):

```json
{
  "plugins": {
    "ziv-voice": {
      "responseMode": "standalone",
      "responseModel": "openai/gpt-4o-mini",
      "responseSystemPrompt": "You are Ziv, a helpful voice assistant. Be concise.",
      "responseTimeoutMs": 8000
    }
  }
}
```

### Config options

| Field | Type | Default | Description |
|---|---|---|---|
| `responseMode` | `"standalone"` \| `"agent"` | `"standalone"` | How to generate replies. See below. |
| `responseModel` | string | `"openai/gpt-4o-mini"` | Model identifier used in **standalone** mode, e.g. `openai/gpt-4o`, `anthropic/claude-haiku-3`. |
| `responseSystemPrompt` | string | Ziv default | System prompt injected into every voice response. Keep it short and voice-appropriate. |
| `responseTimeoutMs` | integer | _(provider default)_ | Optional hard timeout (ms) on model calls. |

---

## Response Modes

### `standalone` (default)

The plugin calls `responseModel` directly, outside of any agent session. This
gives you:

- **Predictable latency** — no session overhead
- **Full model control** — pick a cheap/fast model (e.g. `gpt-4o-mini`)
- **Stateless** — each call turn is independent (no conversation history)

Best for: simple Q&A, quick lookups, kiosk-style voice interfaces.

### `agent`

The transcript is forwarded to the main Ziv agent session as if the caller
typed it in chat. The agent's full response text is then converted to speech
and played back to the caller.

This gives you:

- **Full context** — the agent has memory, tools, and conversation history
- **Rich capability** — the agent can look things up, run tools, etc.
- **Higher latency** — a full agent turn takes longer than a direct model call

If the agent session is unavailable the plugin falls back to `standalone`
automatically so the caller always gets a reply.

Best for: personal assistants where the caller needs full agent intelligence.

---

## How It Works Internally

1. `@openclaw/voice-call` handles everything up to transcription (Twilio,
   media streams, STT). When it has a transcript it fires the
   `voice_transcript_received` hook.

2. `ziv-voice-plugin` is registered on that hook. It runs first, generates a
   spoken reply, calls `respond({ spoken })`, and returns `{ handled: true }`.

3. The `handled: true` return value tells `@openclaw/voice-call` not to
   attempt its own response — so the `responseModel` bypass in the stock
   plugin is effectively neutralised.

---

## Development / Debugging

Logs are prefixed `[ziv-voice]`. On startup you should see:

```
[ziv-voice] Loaded — responseMode: standalone, responseModel: openai/gpt-4o-mini
```

If a response generation fails you'll see:

```
[ziv-voice] Response generation failed: <error message>
```

…and the caller will hear a fallback "Sorry, I had trouble responding."

---

## License

MIT — do whatever you want with it.
