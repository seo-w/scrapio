import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

function getGenAIClient(customApiKey?: string) {
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Falta la API Key de Gemini. Ingresa tu clave en Ajustes de API o configúrala en el entorno.");
  }
  return new GoogleGenerativeAI(apiKey);
}

function getOpenAIClient(customApiKey?: string) {
  const apiKey = customApiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Falta la API Key de OpenAI. Ingresa tu clave en Ajustes de API o contacta al administrador.");
  }
  return new OpenAI({ apiKey });
}

export interface ContextChunk {
  url: string;
  h1: string;
  text: string;
}

/**
 * Genera un vector embedding de 768 dimensiones soportando alternancia dinámica y fallback entre Gemini y OpenAI
 */
export async function generateEmbedding(
  text: string,
  overrideProvider?: string,
  retries = 3,
  customApiKey?: string
): Promise<number[]> {
  const provider = (overrideProvider || process.env.AI_PROVIDER || "gemini").toLowerCase();

  // Función auxiliar para generar embedding con OpenAI (768 dimensiones)
  const tryOpenAIEmbedding = async (): Promise<number[] | null> => {
    try {
      const openai = getOpenAIClient(customApiKey);
      const res = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
        dimensions: 768,
      });
      return res.data[0].embedding;
    } catch (err: any) {
      console.warn("⚠️ Error en OpenAI embedding:", err.message);
      return null;
    }
  };

  if (provider === "openai") {
    const vector = await tryOpenAIEmbedding();
    if (vector) return vector;
    console.warn("⚠️ Fallback de embedding OpenAI a Google Gemini...");
  }

  // Proveedor por defecto: Google Gemini
  const genAI = getGenAIClient(customApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

  let geminiError: any = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await model.embedContent({
        content: { parts: [{ text }], role: "user" },
        // @ts-ignore
        outputDimensionality: 768,
      });
      return result.embedding.values;
    } catch (err: any) {
      geminiError = err;
      const isQuotaOrBillingError =
        err.status === 429 ||
        err.status === 402 ||
        err.status === 403 ||
        err.message?.includes("429") ||
        err.message?.includes("RESOURCE_EXHAUSTED") ||
        err.message?.includes("quota") ||
        err.message?.includes("Quota") ||
        err.message?.includes("billing") ||
        err.message?.includes("Billing");

      if (attempt === retries || isQuotaOrBillingError) {
        break; // Romper el bucle para intentar fallback con OpenAI
      }

      const backoffMs = Math.pow(2, attempt) * 1500;
      console.warn(`⏳ Control de velocidad de Gemini. Reintentando (${attempt}/${retries}) en ${backoffMs / 1000}s...`);
      await new Promise((res) => setTimeout(res, backoffMs));
    }
  }

  // Si Gemini falló por cuota/billing, intentar fallback a OpenAI si hay clave disponible
  const hasOpenAI = Boolean(customApiKey || process.env.OPENAI_API_KEY);
  if (hasOpenAI) {
    console.warn("⚠️ Gemini embedding falló o agotó cuota. Intentando fallback a OpenAI (text-embedding-3-small)...");
    const fallbackVector = await tryOpenAIEmbedding();
    if (fallbackVector) return fallbackVector;
  }

  throw geminiError || new Error("Error al generar embedding tras reintentos y fallbacks.");
}

/**
 * Genera vectores embedding por lotes con salvaguarda de cuotas
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  overrideProvider?: string,
  batchSize = 3,
  delayMs = 350,
  customApiKey?: string
): Promise<{ vectors: number[][]; processedCount: number; quotaExhausted: boolean }> {
  const vectors: number[][] = [];
  let quotaExhausted = false;

  for (let i = 0; i < texts.length; i += batchSize) {
    if (quotaExhausted) break;
    const batch = texts.slice(i, i + batchSize);
    
    try {
      const batchResults = await Promise.all(
        batch.map((t) => generateEmbedding(t, overrideProvider, 3, customApiKey))
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
  overrideProvider?: string,
  customApiKey?: string
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
4. RIGOR Y LÍMITES DEL CONTEXTO:
   - Si la pregunta indaga sobre una entidad, término o relación específica (ej. CONDUSEF, SIPRES, PROFECO, regulaciones, marcas o temas legales) y dicha información no aparece explícitamente en los fragmentos de contexto proporcionados:
     * NUNCA concluyas ni afirmes categóricamente que "el cliente no tiene relación", "la empresa no está registrada" o "no existe mención alguna en el sitio web".
     * En su lugar, aclara con rigor: "En los fragmentos recuperados en esta consulta no se encontró mención explícita sobre [término]".
     * Resume con precisión qué entidades o regulaciones sí constan en los fragmentos disponibles (por ejemplo, si aparece PROFECO, contratos o términos de crédito).
5. NO inventes hechos que contradigan el contexto ni hagas inferencias categóricas de ausencia total basándote únicamente en una recuperación parcial de fragmentos.

CONTEXTO RECUPERADO:
${formattedContext}`;

  // Función auxiliar para generar respuesta RAG con OpenAI (gpt-4o-mini)
  const tryOpenAIChat = async (): Promise<{ text: string; sources: string[] } | null> => {
    try {
      const openai = getOpenAIClient(customApiKey);
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
    } catch (openAiErr: any) {
      console.warn("⚠️ Error en OpenAI chat completion:", openAiErr.message);
      return null;
    }
  };

  if (provider === "openai") {
    const res = await tryOpenAIChat();
    if (res) return res;
    console.warn("⚠️ OpenAI no disponible o agotó cuota. Intentando fallback con Google Gemini...");
  }

  // Proveedor por defecto: Gemini (con lista ordenada de modelos de alta disponibilidad)
  const genAI = getGenAIClient(customApiKey);
  const preferredModel = process.env.GEMINI_MODEL || "gemini-flash-latest";
  const candidateModels = Array.from(
    new Set([preferredModel, "gemini-flash-latest", "gemini-3.5-flash", "gemini-2.5-flash-lite"])
  );

  let lastError: any = null;
  const fullPrompt = `${systemPrompt}\n\nPREGUNTA DEL USUARIO:\n${query}`;

  for (const modelName of candidateModels) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.2,
        },
      });

      const result = await model.generateContent(fullPrompt);
      return {
        text: result.response.text(),
        sources,
      };
    } catch (err: any) {
      lastError = err;
      console.warn(`⚠️ Modelo Gemini '${modelName}' no respondió (${err.status || err.message}). Intentando siguiente fallback...`);
      // Si no es el último modelo de la lista, continúa con el siguiente modelo candidato
      if (modelName !== candidateModels[candidateModels.length - 1]) {
        continue;
      }
    }
  }

  // Si todos los modelos de Gemini fallaron (ej. cuota / billing details en Google Cloud),
  // intentar fallback automático a OpenAI si hay una clave configurada en el entorno o BYOK
  const hasOpenAI = Boolean(customApiKey || process.env.OPENAI_API_KEY);
  if (hasOpenAI && provider !== "openai") {
    console.warn("⚠️ Todos los modelos de Gemini fallaron o tienen restricciones de facturación. Ejecutando fallback a OpenAI (gpt-4o-mini)...");
    const openAiFallback = await tryOpenAIChat();
    if (openAiFallback) return openAiFallback;
  }

  throw lastError || new Error("Error al generar respuesta RAG con Gemini y OpenAI tras agotar fallbacks.");
}
