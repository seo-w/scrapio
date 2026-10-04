import { ContextChunk } from "@/lib/ai";

const STOP_WORDS = new Set([
  "que", "como", "para", "por", "los", "las", "con", "una", "uno", "del",
  "cual", "cuales", "donde", "cuando", "este", "esta", "sobre", "desde",
  "estos", "estas", "pero", "entre", "hacia", "hasta", "sobre", "tras",
  "the", "and", "for", "with", "from", "that", "this", "what", "which",
]);

/**
 * Re-ranking híbrido ligero en memoria: combina la similitud vectorial de Pinecone
 * con boosting de coincidencias léxicas exactas (códigos, números, SKUs y frases).
 * 
 * Costo de almacenamiento adicional: 0 bytes.
 * Latencia añadida: < 2 ms.
 */
export function rerankHybridChunks(
  query: string,
  matches: Array<{ metadata: any; score?: number }>,
  topLimit: number = 8
): ContextChunk[] {
  const rawTerms = query
    .toLowerCase()
    .replace(/[¿?¡!.,;:()\[\]{}"'\\\/]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));

  const uniqueTerms = Array.from(new Set(rawTerms));
  const cleanQueryLower = query.toLowerCase().trim();

  const scored = matches.map((match) => {
    const text = (match.metadata?.text_chunk || "").toLowerCase();
    const h1 = (match.metadata?.h1 || "").toLowerCase();
    const vectorScore = match.score || 0;

    let lexicalBoost = 0;

    // Coincidencia de frase exacta completa
    if (uniqueTerms.length > 1 && text.includes(cleanQueryLower)) {
      lexicalBoost += 0.35;
    }

    // Coincidencia de términos individuales en H1 y texto
    for (const term of uniqueTerms) {
      if (h1.includes(term)) {
        lexicalBoost += 0.15;
      }
      if (text.includes(term)) {
        lexicalBoost += 0.10;
      }
      // Detección de números o códigos (ej: teléfonos, RFCs, SKUs)
      if (/\d/.test(term) && text.includes(term)) {
        lexicalBoost += 0.25;
      }
    }

    return {
      chunk: {
        url: match.metadata.url,
        h1: match.metadata.h1,
        text: match.metadata.text_chunk,
      },
      finalScore: vectorScore + lexicalBoost,
      hasLexicalMatch: lexicalBoost > 0,
    };
  });

  // Ordenar de mayor a menor relevancia híbrida
  scored.sort((a, b) => b.finalScore - a.finalScore);

  // Retornar los top N fragmentos más pertinentes
  return scored.slice(0, topLimit).map((item) => item.chunk);
}
