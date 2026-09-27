import { GoogleGenerativeAI } from "@google/generative-ai";

function getGenAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Falta la variable de entorno GEMINI_API_KEY");
  }
  return new GoogleGenerativeAI(apiKey);
}

/**
 * Genera un vector embedding de 768 dimensiones usando gemini-embedding-001 con reintentos automáticos
 */
export async function generateEmbedding(text: string, retries = 3): Promise<number[]> {
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
 * Genera vectores embedding por lotes con salvaguarda de cuotas de Gemini
 */
export async function generateEmbeddingsBatch(
  texts: string[],
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
        batch.map((t) => generateEmbedding(t))
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
        console.warn(`\n⚠️ Se ha alcanzado el límite de cuota de la cuenta gratuita de Gemini API.`);
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

export interface ContextChunk {
  url: string;
  h1: string;
  text: string;
}

/**
 * Genera una respuesta RAG estricta basada únicamente en el contexto provisto usando gemini-3.8-flash
 */
export async function generateRAGResponse(
  query: string,
  contextChunks: ContextChunk[]
): Promise<{ text: string; sources: string[] }> {
  const genAI = getGenAIClient();
  const model = genAI.getGenerativeModel({ 
    model: "gemini-3.8-flash",
    generationConfig: {
      temperature: 0.2,
    }
  });

  const formattedContext = contextChunks
    .map((chunk, index) => `[Fuente ${index + 1}] (URL: ${chunk.url}, H1: ${chunk.h1}):\n${chunk.text}`)
    .join("\n\n---\n\n");

  const sources = Array.from(new Set(contextChunks.map((c) => c.url)));

  const systemPrompt = `Eres un asistente virtual experto y preciso.
Tu objetivo es responder a la pregunta del usuario utilizando ÚNICAMENTE la siguiente información de contexto proporcionada.

Reglas Estrictas:
1. Responde de forma clara, directa y estructurada en español.
2. Basate EXCLUSIVAMENTE en el contexto proporcionado.
3. Si la respuesta no está contenida en el contexto, di explícitamente: "Lo siento, esa información no se encuentra disponible en la documentación procesada de este sitio web."
4. NO inventes ni asumas información fuera del contexto.

CONTEXTO RECUPERADO:
${formattedContext}

PREGUNTA DEL USUARIO:
${query}`;

  const result = await model.generateContent(systemPrompt);
  const responseText = result.response.text();

  return {
    text: responseText,
    sources,
  };
}

/**
 * Genera una respuesta RAG en modo Streaming
 */
export async function generateRAGStream(
  query: string,
  contextChunks: ContextChunk[]
) {
  const genAI = getGenAIClient();
  const model = genAI.getGenerativeModel({ 
    model: "gemini-3.8-flash",
    generationConfig: {
      temperature: 0.2,
    }
  });

  const formattedContext = contextChunks
    .map((chunk, index) => `[Fuente ${index + 1}] (URL: ${chunk.url}, H1: ${chunk.h1}):\n${chunk.text}`)
    .join("\n\n---\n\n");

  const systemPrompt = `Eres un asistente virtual experto y preciso.
Tu objetivo es responder a la pregunta del usuario utilizando ÚNICAMENTE la siguiente información de contexto proporcionada.

Reglas Estrictas:
1. Responde de forma clara, directa y estructurada en español.
2. Basate EXCLUSIVAMENTE en el contexto proporcionado.
3. Si la respuesta no está contenida en el contexto, di explícitamente: "Lo siento, esa información no se encuentra disponible en la documentación procesada de este sitio web."
4. NO inventes ni asumas información fuera del contexto.

CONTEXTO RECUPERADO:
${formattedContext}

PREGUNTA DEL USUARIO:
${query}`;

  const resultStream = await model.generateContentStream(systemPrompt);
  return resultStream.stream;
}
