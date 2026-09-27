import { GoogleGenerativeAI } from "@google/generative-ai";

function getGenAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Falta la variable de entorno GEMINI_API_KEY");
  }
  return new GoogleGenerativeAI(apiKey);
}

/**
 * Genera un vector embedding de 768 dimensiones usando gemini-embedding-001
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const genAI = getGenAIClient();
  const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
  
  const result = await model.embedContent({
    content: { parts: [{ text }], role: "user" },
    // @ts-ignore
    outputDimensionality: 768,
  });
  
  return result.embedding.values;
}

/**
 * Genera vectores embedding por lotes
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];
  for (const text of texts) {
    const vector = await generateEmbedding(text);
    embeddings.push(vector);
  }
  return embeddings;
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
