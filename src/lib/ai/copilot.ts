import { createServerFn } from "@tanstack/react-start";
import { fallbackDraftFromPrompt, type AiDraft } from "@/lib/bim/seed";

const SYSTEM = `Tu es FORMA, architecte BIM expert (France, Eurocodes, RE2020).
Tu génères des bâtiments en JSON strict, coordonnées en mètres, origine coin sud-ouest, Y = nord.
Les pièces sont des rectangles {x,y,w,d} qui s'emboîtent sans vide (sauf patio).
Épaisseur de mur implicite 0.22 m. Portes 0.9×2.1, fenêtres 1.4–2.4 × 1.4, baies 2.4–4.0 × 2.2.
Réponds UNIQUEMENT avec un objet JSON valide, sans markdown.

Schéma:
{
  "name": string,
  "location": string,
  "brief": string,
  "roof": "flat" | "gable",
  "stories": [{"name": string, "elevation": number, "height": number}],
  "rooms": [{"x":n,"y":n,"w":n,"d":n,"name":string,"function":"living|kitchen|bedroom|bath|wc|entry|corridor|office|dining|storage|laundry|terrace|patio|garage|studio|other","story":0}],
  "openings": [{"x":n,"y":n,"kind":"door|window","width":n,"height":n,"sill":n,"story":0}],
  "furniture": [{"kind":"sofa|table|bed|kitchen|desk|bath|plant|car|pool|counter","x":n,"y":n,"rotation":0,"story":0}]
}`;

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1]!.trim() : trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("JSON introuvable");
  return JSON.parse(raw.slice(start, end + 1));
}

/** Lit XAI_API_KEY côté serveur uniquement — ne jamais exposer au client. */
function readXaiKey(): string | undefined {
  const key = process.env.XAI_API_KEY;
  return key && key.trim() ? key.trim() : undefined;
}

export const copilotStatus = createServerFn({ method: "GET" }).handler(async () => {
  return { available: Boolean(readXaiKey()), model: "grok-4.5" as const };
});

export const generateBuilding = createServerFn({ method: "POST" })
  .validator((input: { prompt: string; summary?: string }) => input)
  .handler(async ({ data }) => {
    const apiKey = readXaiKey();
    if (!apiKey) {
      return {
        ok: true as const,
        source: "local" as const,
        draft: fallbackDraftFromPrompt(data.prompt),
        note: "IA indisponible — massing local appliqué. Définir XAI_API_KEY.",
      };
    }
    try {
      const contextBlock = data.summary
        ? `\nContexte projet courant (indicatif) :\n${data.summary.slice(0, 1800)}\n`
        : "";
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
            { role: "system", content: SYSTEM },
            {
              role: "user",
              content: `Programme architectural à modéliser :\n${data.prompt}${contextBlock}\nConstruis un bâtiment cohérent, 80–220 m², pièces fermées, ouvertures sur les murs existants.`,
            },
          ],
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) {
        return {
          ok: true as const,
          source: "local" as const,
          draft: fallbackDraftFromPrompt(data.prompt),
          note: `IA ${res.status} — massing local.`,
        };
      }
      const body = (await res.json()) as {
        choices: { message: { content: string } }[];
      };
      const draft = extractJson(body.choices[0]?.message.content ?? "") as AiDraft;
      return { ok: true as const, source: "grok" as const, draft, note: "" };
    } catch {
      return {
        ok: true as const,
        source: "local" as const,
        draft: fallbackDraftFromPrompt(data.prompt),
        note: "Analyse locale — l'IA n'a pas renvoyé de JSON.",
      };
    }
  });

export const askArchitect = createServerFn({ method: "POST" })
  .validator((input: { question: string; context: string }) => input)
  .handler(async ({ data }) => {
    const apiKey = readXaiKey();
    if (!apiKey) {
      return {
        ok: false as const,
        error: "Les fonctions IA ne sont pas disponibles ici. Définir XAI_API_KEY.",
      };
    }
    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-4.5",
          temperature: 0.5,
          max_tokens: 700,
          messages: [
            {
              role: "system",
              content:
                "Tu es FORMA, architecte associé. Réponses courtes, précises, en français. Surfaces, lumières, structure, usages. Pas de markdown décoratif.",
            },
            {
              role: "user",
              content: `Contexte BIM:\n${data.context.slice(0, 4000)}\n\nQuestion:\n${data.question}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { ok: false as const, error: `Erreur IA ${res.status}` };
      const body = (await res.json()) as {
        choices: { message: { content: string } }[];
      };
      return { ok: true as const, text: body.choices[0]?.message.content ?? "" };
    } catch {
      return { ok: false as const, error: "L'architecte IA n'a pas répondu." };
    }
  });

/** Chat copilote : conseil texte (live) ou indication de fallback local. */
export const chatCopilot = createServerFn({ method: "POST" })
  .validator((input: { prompt: string; summary: string }) => input)
  .handler(async ({ data }) => {
    const apiKey = readXaiKey();
    if (!apiKey) {
      return {
        ok: false as const,
        live: false as const,
        error: "Définir XAI_API_KEY pour Grok live — agents locaux disponibles.",
      };
    }
    try {
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
                "Tu es le copilote FORMA (xAI Grok). Français, concis, actionnable. Si on te demande un bâtiment neuf, décris le programme ; la génération JSON passe par generateBuilding.",
            },
            {
              role: "user",
              content: `Résumé projet:\n${data.summary.slice(0, 2500)}\n\nDemande:\n${data.prompt}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) {
        return { ok: false as const, live: true as const, error: `Erreur IA ${res.status}` };
      }
      const body = (await res.json()) as {
        choices: { message: { content: string } }[];
      };
      return {
        ok: true as const,
        live: true as const,
        text: body.choices[0]?.message.content ?? "",
      };
    } catch {
      return { ok: false as const, live: true as const, error: "Copilote Grok indisponible." };
    }
  });
