import { ContextChunk } from "@/lib/ai";

const STOP_WORDS = new Set([
  "que", "como", "para", "por", "los", "las", "con", "una", "uno", "del",
  "cual", "cuales", "donde", "cuando", "este", "esta", "sobre", "desde",
  "estos", "estas", "pero", "entre", "hacia", "hasta", "sobre", "tras",
  "dime", "entiendes", "entiende", "sabes", "conectate", "conectate",
  "conéctate", "namescpace", "namespace", "cliente", "sitio", "web",
  "the", "and", "for", "with", "from", "that", "this", "what", "which",
]);

/**
 * Normaliza términos en español para tolerar variaciones fonéticas comunes (c/s/z, acentos)
 */
function normalizePhonetic(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[cz]/g, "s");
}

/**
 * Re-ranking híbrido ligero en memoria: combina la similitud vectorial de Pinecone
 * con boosting de coincidencias léxicas exactas (códigos, números, SKUs, acrónimos y URLs).
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
    const url = (match.metadata?.url || "").toLowerCase();
    const vectorScore = match.score || 0;

    const normText = normalizePhonetic(text);
    const normH1 = normalizePhonetic(h1);
    const normUrl = normalizePhonetic(url);

    let lexicalBoost = 0;

    // Coincidencia de frase exacta completa
    if (uniqueTerms.length > 1 && text.includes(cleanQueryLower)) {
      lexicalBoost += 0.45;
    }

    // Coincidencia de términos individuales en H1, texto y URL
    for (const term of uniqueTerms) {
      const normTerm = normalizePhonetic(term);
      const isExactInText = text.includes(term) || normText.includes(normTerm);
      const isExactInH1 = h1.includes(term) || normH1.includes(normTerm);
      const isExactInUrl = url.includes(term) || normUrl.includes(normTerm);

      if (isExactInH1) {
        lexicalBoost += 0.30;
      }
      if (isExactInUrl) {
        lexicalBoost += 0.25;
      }
      if (isExactInText) {
        lexicalBoost += 0.20;
      }
      // Detección de números o códigos (ej: teléfonos, RFCs, SKUs)
      if (/\d/.test(term) && isExactInText) {
        lexicalBoost += 0.30;
      }
      // Acrónimos o nombres propios clave (>= 5 letras, ej: CONDUSEF, PROFECO)
      if (term.length >= 5 && isExactInText) {
        lexicalBoost += 0.35;
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
