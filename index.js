import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

export default definePluginEntry({
  id: "ziv-voice",
  name: "Ziv Voice Plugin",

  register(api) {
    const config = api.pluginConfig ?? {};
    const responseMode = config?.responseMode ?? "standalone";
    const responseModel = config?.responseModel ?? "openai/gpt-4o-mini";
    const responseSystemPrompt =
      config?.responseSystemPrompt ??
      "You are Ziv, a helpful voice AI assistant. Be concise and clear.";

    // Hook into voice transcript events to override response generation.
    // The voice-call plugin fires this hook when a transcript arrives from
    // the caller. By returning { handled: true } we prevent the stock plugin
    // from generating its own response with the main agent model.
    api.on("voice_transcript_received", async (ctx) => {
      const { transcript, callId, respond } = ctx;

      if (responseMode === "agent") {
        // Route to main agent session so it has full context / memory.
        try {
          const result = await api.sendToSession({
            message: transcript,
            sessionLabel: "main",
          });
          await respond({ spoken: result.text });
        } catch (e) {
          console.error(
            "[ziv-voice] Agent routing failed, falling back to standalone:",
            e.message
          );
          // Fallback to standalone so the caller always gets a response.
          await generateStandalone(
            api,
            transcript,
            responseModel,
            responseSystemPrompt,
            respond
          );
        }
      } else {
        await generateStandalone(
          api,
          transcript,
          responseModel,
          responseSystemPrompt,
          respond
        );
      }

      // Signal that this handler owned the response, so the stock plugin
      // doesn't also try to respond.
      return { handled: true };
    });

    console.log(
      `[ziv-voice] Loaded — responseMode: ${responseMode}, responseModel: ${responseModel}`
    );
  },
});

/**
 * Call the configured model directly and send the spoken reply.
 *
 * @param {object} api             - Plugin API surface provided by OpenClaw
 * @param {string} transcript      - What the caller said
 * @param {string} model           - Model identifier, e.g. "openai/gpt-4o-mini"
 * @param {string} systemPrompt    - System prompt for the model
 * @param {Function} respond       - Callback to send spoken audio back to caller
 */
async function generateStandalone(api, transcript, model, systemPrompt, respond) {
  try {
    const result = await api.generateText({
      model,
      system:
        systemPrompt +
        '\n\nOutput format: {"spoken":"your response here"}\n' +
        "Always return valid JSON. Keep the spoken response concise and natural for voice.",
      prompt: transcript,
    });

    // The model should return JSON; extract the "spoken" field.
    let spoken = result.text ?? "";
    try {
      // Strip markdown code fences if the model wrapped its output.
      const cleaned = spoken.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
      const parsed = JSON.parse(cleaned);
      spoken = parsed.spoken ?? spoken;
    } catch {
      // Model returned plain text — use as-is.
    }

    await respond({ spoken });
  } catch (e) {
    console.error("[ziv-voice] Response generation failed:", e.message);
    await respond({ spoken: "Sorry, I had trouble coming up with a response." });
  }
}
