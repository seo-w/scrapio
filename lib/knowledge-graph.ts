import { generateRAGResponse, ContextChunk } from "./ai";
import {
  saveEntityToSupabase,
  linkPageToEntityInSupabase,
  getSupabaseClient,
  EntityRecord,
} from "./supabase";

export interface ReconciledEntity {
  name: string;
  schemaType: string;
  kgMid?: string;
  wikidataUrl?: string;
  wikipediaUrl?: string;
  description?: string;
  confidence: number;
  role: "main_entity" | "mention";
}

/**
 * Consulta la API pública de Wikidata para reconciliar la entidad con su URI canónico
 */
export async function reconcileWithWikidata(
  query: string,
  lang = "es"
): Promise<{ wikidataUrl?: string; description?: string } | null> {
  try {
    const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(
      query
    )}&language=${lang}&limit=1&format=json&origin=*`;

    const res = await fetch(url, {
      headers: { "User-Agent": "ScrapioBot/1.0 (SEO Entity Extractor)" },
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (data.search && data.search.length > 0) {
      const top = data.search[0];
      return {
        wikidataUrl: `https://www.wikidata.org/wiki/${top.id}`,
        description: top.description || undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Consulta la API oficial de Google Knowledge Graph Search (si hay GEMINI_API_KEY habilitada para KG)
 */
export async function reconcileWithGoogleKG(
  query: string,
  apiKey?: string
): Promise<{ kgMid?: string; schemaType?: string; wikipediaUrl?: string; description?: string } | null> {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) return null;

  try {
    const url = `https://kgsearch.googleapis.com/v1/entities:search?query=${encodeURIComponent(
      query
    )}&key=${key}&limit=1&indent=True&languages=es,en`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const item = data.itemListElement?.[0]?.result;
    if (!item) return null;

    const kgMid = item["@id"]?.replace(/^kg:/, "") || undefined;
    const types: string[] = item["@type"] || [];
    const schemaType = types.find((t) => t !== "Thing") || types[0] || "Thing";
    const wikipediaUrl = item.detailedDescription?.url || undefined;
    const description = item.description || item.detailedDescription?.articleBody || undefined;

    return { kgMid, schemaType, wikipediaUrl, description };
  } catch {
    return null;
  }
}

/**
 * Analiza el contenido completo de una página con IA para extraer sus entidades principales y menciones
 */
export async function extractEntitiesFromMarkdown(
  url: string,
  h1: string,
  markdown: string,
  aiProvider?: string
): Promise<{ mainEntity: string; schemaType: string; mentions: string[] }> {
  // Recortamos el markdown a ~3500 caracteres representativos para optimizar tokens y latencia
  const sample = markdown.slice(0, 3500);

  const prompt = `Analiza el contenido de esta página web y extrae sus entidades SEO en formato JSON estricto.

URL: ${url}
H1: ${h1}
Contenido:
${sample}

Instrucciones:
1. "mainEntity": La entidad PRINCIPAL de la que trata esta página (ej: nombre específico del producto, servicio, marca o concepto central).
2. "schemaType": Tipo de Schema.org recomendado para la entidad principal (ej: FinancialProduct, Service, Organization, LocalBusiness, Article, Person, WebPage).
3. "mentions": Lista de máximo 5 entidades secundarias clave que se mencionan de forma relevante en el texto (ej: organismos reguladores, partners, marcas, conceptos de la industria).

Devuelve ÚNICAMENTE un JSON válido con esta estructura:
{
  "mainEntity": "Nombre de la entidad principal",
  "schemaType": "TipoDeSchema",
  "mentions": ["Entidad 1", "Entidad 2"]
}`;

  const dummyContext: ContextChunk[] = [{ url, h1, text: sample }];

  try {
    const { text } = await generateRAGResponse(prompt, dummyContext, aiProvider);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        mainEntity: parsed.mainEntity || h1 || "Página Web",
        schemaType: parsed.schemaType || "WebPage",
        mentions: Array.isArray(parsed.mentions) ? parsed.mentions : [],
      };
    }
  } catch (err: any) {
    console.warn("Error parseando entidades:", err.message);
  }

  return {
    mainEntity: h1 || "Página Web",
    schemaType: "WebPage",
    mentions: [],
  };
}

/**
 * Procesa y reconcilia todas las entidades de una página en Supabase
 */
export async function processAndSavePageEntities(
  pageId: string,
  url: string,
  h1: string,
  markdown: string,
  aiProvider?: string
) {
  const supabase = getSupabaseClient();
  if (!supabase || !pageId) return;

  try {
    const extracted = await extractEntitiesFromMarkdown(url, h1, markdown, aiProvider);

    // 1. Reconciliar y guardar la Main Entity
    const [googleMain, wikiMain] = await Promise.all([
      reconcileWithGoogleKG(extracted.mainEntity),
      reconcileWithWikidata(extracted.mainEntity),
    ]);

    const mainRecord: EntityRecord = {
      name: extracted.mainEntity,
      schema_type: googleMain?.schemaType || extracted.schemaType || "Thing",
      kg_mid: googleMain?.kgMid,
      wikipedia_url: googleMain?.wikipediaUrl,
      wikidata_url: wikiMain?.wikidataUrl,
      description: googleMain?.description || wikiMain?.description,
    };

    const mainEntityId = await saveEntityToSupabase(mainRecord);
    if (mainEntityId) {
      await linkPageToEntityInSupabase(pageId, mainEntityId, "main_entity", 1.0);
    }

    // 2. Reconciliar y guardar menciones secundarias (máximo 4 para no saturar cuotas)
    const mentionsToProcess = extracted.mentions.slice(0, 4);
    for (const mentionName of mentionsToProcess) {
      if (!mentionName || mentionName === extracted.mainEntity) continue;

      const [googleMention, wikiMention] = await Promise.all([
        reconcileWithGoogleKG(mentionName),
        reconcileWithWikidata(mentionName),
      ]);

      const mentionRecord: EntityRecord = {
        name: mentionName,
        schema_type: googleMention?.schemaType || "Thing",
        kg_mid: googleMention?.kgMid,
        wikipedia_url: googleMention?.wikipediaUrl,
        wikidata_url: wikiMention?.wikidataUrl,
        description: googleMention?.description || wikiMention?.description,
      };

      const mentionId = await saveEntityToSupabase(mentionRecord);
      if (mentionId) {
        await linkPageToEntityInSupabase(pageId, mentionId, "mention", 0.85);
      }
    }
  } catch (err: any) {
    console.warn(`⚠️ Error procesando grafo de entidades para ${url}:`, err.message);
  }
}
