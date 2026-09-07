import { createFileRoute } from "@tanstack/react-router";

/** Lit XAI_API_KEY côté serveur uniquement — ne jamais exposer au client. */
function readXaiKey(): string | undefined {
  const key = process.env.XAI_API_KEY;
  return key && key.trim() ? key.trim() : undefined;
}

async function GET() {
  return Response.json({
    available: Boolean(readXaiKey()),
    model: "grok-4.5",
  });
}

async function POST({ request }: { request: Request }) {
  const apiKey = readXaiKey();
  let body: { prompt?: string; summary?: string; mode?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "JSON invalide" }, { status: 400 });
  }
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return Response.json({ ok: false, error: "prompt requis" }, { status: 400 });
  }
  if (!apiKey) {
    return Response.json({
      ok: false,
      live: false,
      error: "Définir XAI_API_KEY pour Grok live — agents locaux disponibles.",
    });
  }

  const summary = (body.summary ?? "").slice(0, 2500);
  const mode = body.mode === "draft" ? "draft" : "chat";

  try {
    if (mode === "draft") {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-4.5",
          temperature: 0.4,
          max_tokens: 1400,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                'Tu génères un AiDraft JSON FORMA (name, location, brief, roof, stories, rooms, openings, furniture). Réponds uniquement JSON.',
            },
            {
              role: "user",
              content: `Programme:\n${prompt}\n\nContexte:\n${summary}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) {
        return Response.json({ ok: false, live: true, error: `IA ${res.status}` });
      }
      const data = (await res.json()) as { choices: { message: { content: string } }[] };
      const text = data.choices[0]?.message.content ?? "{}";
      let draft: unknown = null;
      try {
        const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        const raw = fence ? fence[1]!.trim() : text.trim();
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        draft = JSON.parse(raw.slice(start, end + 1));
      } catch {
        return Response.json({ ok: false, live: true, error: "JSON draft invalide" });
      }
      return Response.json({ ok: true, live: true, source: "grok", draft });
    }

    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 0.45,
        max_tokens: 900,
        messages: [
          {
            role: "system",
            content:
              "Tu es le copilote FORMA (xAI Grok). Français, concis, actionnable.",
          },
          {
            role: "user",
            content: `Résumé projet:\n${summary}\n\nDemande:\n${prompt}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      return Response.json({ ok: false, live: true, error: `IA ${res.status}` });
    }
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return Response.json({
      ok: true,
      live: true,
      text: data.choices[0]?.message.content ?? "",
    });
  } catch {
    return Response.json({ ok: false, live: true, error: "Copilote indisponible" });
  }
}

export const Route = createFileRoute("/api/copilot")({
  server: { handlers: { GET, POST } },
});
