import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

function getGenAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Falta la variable de entorno GEMINI_API_KEY");
  }
  return new GoogleGenerativeAI(apiKey);
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Falta la variable de entorno OPENAI_API_KEY en Vercel/env.");
  }
  return new OpenAI({ apiKey });
}

export interface ContextChunk {
  url: string;
  h1: string;
  text: string;
}

/**
 * Genera un vector embedding de 768 dimensiones soportando alternancia dinámica entre Gemini y OpenAI
 */
export async function generateEmbedding(text: string, overrideProvider?: string, retries = 3): Promise<number[]> {
  const provider = (overrideProvider || process.env.AI_PROVIDER || "gemini").toLowerCase();

  if (provider === "openai") {
    const openai = getOpenAIClient();
    const res = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
      dimensions: 768,
    });
    return res.data[0].embedding;
  }

  // Proveedor por defecto: Google Gemini
  const genAI = getGenAIClient();
  const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await model.embedContent({
        content: { parts: [{ text }], role: "user" },
        // @ts-ignore
        outputDimensionality: 768,
      });
      return result.embedding.values;
    } catch (err: any) {
      const isQuotaError =
        err.status === 429 ||
        err.message?.includes("429") ||
        err.message?.includes("RESOURCE_EXHAUSTED") ||
        err.message?.includes("quota") ||
        err.message?.includes("Quota");

      if (attempt === retries || isQuotaError) {
        throw err;
      }

      const backoffMs = Math.pow(2, attempt) * 1500;
      console.warn(`⏳ Control de velocidad de Gemini. Reintentando (${attempt}/${retries}) en ${backoffMs / 1000}s...`);
      await new Promise((res) => setTimeout(res, backoffMs));
    }
  }

  throw new Error("Error al generar embedding tras reintentos.");
}

/**
 * Genera vectores embedding por lotes con salvaguarda de cuotas
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  overrideProvider?: string,
  batchSize = 3,
  delayMs = 350
): Promise<{ vectors: number[][]; processedCount: number; quotaExhausted: boolean }> {
  const vectors: number[][] = [];
  let quotaExhausted = false;

  for (let i = 0; i < texts.length; i += batchSize) {
    if (quotaExhausted) break;
    const batch = texts.slice(i, i + batchSize);
    
    try {
      const batchResults = await Promise.all(
        batch.map((t) => generateEmbedding(t, overrideProvider))
      );
      vectors.push(...batchResults);
    } catch (err: any) {
      const isQuota =
        err.status === 429 ||
        err.message?.includes("429") ||
        err.message?.includes("quota") ||
        err.message?.includes("Quota") ||
        err.message?.includes("RESOURCE_EXHAUSTED");

      if (isQuota) {
        console.warn(`\n⚠️ Se ha alcanzado el límite de cuota del proveedor de IA activo.`);
        console.warn(`💾 Salvaguardando de forma segura los ${vectors.length} vectores procesados hasta el momento...`);
        quotaExhausted = true;
        break;
      }
      throw err;
    }

    if (i + batchSize < texts.length) {
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }

  return { vectors, processedCount: vectors.length, quotaExhausted };
}

/**
 * Genera una respuesta RAG estricta usando Gemini u OpenAI según la preferencia dinámica
 */
export async function generateRAGResponse(
  query: string,
  contextChunks: ContextChunk[],
  overrideProvider?: string
): Promise<{ text: string; sources: string[] }> {
  const provider = (overrideProvider || process.env.AI_PROVIDER || "gemini").toLowerCase();
  const formattedContext = contextChunks
    .map((chunk, index) => `[Fuente ${index + 1}] (URL: ${chunk.url}, H1: ${chunk.h1}):\n${chunk.text}`)
    .join("\n\n---\n\n");

  const sources = Array.from(new Set(contextChunks.map((c) => c.url)));

  const systemPrompt = `Eres un asistente virtual experto y analista SEO de alta precisión.
Tu objetivo es atender la solicitud del usuario utilizando la información de contexto proporcionada sobre el sitio web.

Capacidades y Modo de Respuesta:
1. Si el usuario te pide extraer entidades SEO, marcas, productos, servicios, personas, lugares o conceptos clave, analiza minuciosamente el contexto disponible y entrega un listado clasificado y claro (idealmente en formato de tabla o lista estructurada).
2. Si el usuario te pide sugerencias de Schema.org o datos estructurados, clasifica las entidades encontradas con su tipo de Schema correspondiente.
3. Responde de forma clara, directa y estructurada en español.
4. Si el contexto recuperado es escaso o no cubre completamente la pregunta, explica qué entidades o información sí aparecen en los fragmentos disponibles antes de indicar que no hay más datos.
5. NO inventes hechos que contradigan el contexto.

CONTEXTO RECUPERADO:
${formattedContext}`;

  if (provider === "openai") {
    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
    });

    return {
      text: completion.choices[0]?.message?.content || "Sin respuesta.",
      sources,
    };
  }

  // Proveedor por defecto: Gemini
  const genAI = getGenAIClient();
  const model = genAI.getGenerativeModel({ 
    model: "gemini-3.8-flash",
    generationConfig: {
      temperature: 0.2,
    }
  });

  const fullPrompt = `${systemPrompt}\n\nPREGUNTA DEL USUARIO:\n${query}`;
  const result = await model.generateContent(fullPrompt);
  
  return {
    text: result.response.text(),
    sources,
  };
}
