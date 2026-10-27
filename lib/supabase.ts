import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  if (!supabaseClient) {
    supabaseClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return supabaseClient;
}

export interface PageRecord {
  id?: string;
  namespace: string;
  url: string;
  slug?: string;
  title?: string;
  h1?: string;
  meta_description?: string;
  canonical?: string;
  language?: string;
  word_count?: number;
  existing_schema?: any;
  generated_schema?: any;
  markdown_content?: string;
  crawled_at?: string;
}

export interface EntityRecord {
  id?: string;
  name: string;
  schema_type: string;
  kg_mid?: string;
  wikidata_url?: string;
  wikipedia_url?: string;
  description?: string;
  created_at?: string;
}

export interface InternalLinkItem {
  target_url: string;
  anchor_text?: string;
}

/**
 * Guarda o actualiza una página completa con su markdown en Supabase
 * Diseñado con fallback seguro por si alguna columna nueva aún no ha sido agregada
 */
export async function savePageToSupabase(page: PageRecord) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const payload: Record<string, any> = {
      namespace: page.namespace,
      url: page.url,
      title: page.title || "",
      h1: page.h1 || "",
      meta_description: page.meta_description || "",
      canonical: page.canonical || page.url,
      markdown_content: page.markdown_content || "",
      crawled_at: new Date().toISOString(),
    };

    if (page.slug) payload.slug = page.slug;
    if (page.language) payload.language = page.language;
    if (page.word_count !== undefined) payload.word_count = page.word_count;
    if (page.existing_schema) payload.existing_schema = page.existing_schema;
    if (page.generated_schema) payload.generated_schema = page.generated_schema;

    let { data, error } = await supabase
      .from("pages")
      .upsert(payload, { onConflict: "url" })
      .select("id")
      .single();

    // Fallback defensivo si faltan columnas nuevas en Supabase
    if (error && error.message?.toLowerCase().includes("column")) {
      const basicPayload = {
        namespace: page.namespace,
        url: page.url,
        title: page.title || "",
        h1: page.h1 || "",
        meta_description: page.meta_description || "",
        canonical: page.canonical || page.url,
        markdown_content: page.markdown_content || "",
        crawled_at: new Date().toISOString(),
      };
      const retry = await supabase.from("pages").upsert(basicPayload, { onConflict: "url" }).select("id").single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.warn(`⚠️ Error guardando página en Supabase (${page.url}):`, error.message);
      return null;
    }

    return data?.id || null;
  } catch (err: any) {
    console.warn(`⚠️ Excepción guardando página en Supabase:`, err.message);
    return null;
  }
}

/**
 * Guarda o actualiza un lote de páginas en Supabase en bloques de 50
 */
export async function savePagesBatchToSupabase(pages: PageRecord[]): Promise<number> {
  const supabase = getSupabaseClient();
  if (!supabase || pages.length === 0) return 0;

  const BATCH_SIZE = 50;
  let savedCount = 0;

  for (let i = 0; i < pages.length; i += BATCH_SIZE) {
    const chunk = pages.slice(i, i + BATCH_SIZE);
    const payloads = chunk.map((page) => {
      const payload: Record<string, any> = {
        namespace: page.namespace,
        url: page.url,
        title: page.title || "",
        h1: page.h1 || "",
        meta_description: page.meta_description || "",
        canonical: page.canonical || page.url,
        markdown_content: page.markdown_content || "",
        crawled_at: page.crawled_at || new Date().toISOString(),
      };
      if (page.slug) payload.slug = page.slug;
      if (page.language) payload.language = page.language;
      if (page.word_count !== undefined) payload.word_count = page.word_count;
      if (page.existing_schema) payload.existing_schema = page.existing_schema;
      if (page.generated_schema) payload.generated_schema = page.generated_schema;
      return payload;
    });

    const { data, error } = await supabase
      .from("pages")
      .upsert(payloads, { onConflict: "url" })
      .select("id");

    if (error) {
      console.warn(`⚠️ Error en lote de páginas a Supabase:`, error.message);
      if (error.message?.toLowerCase().includes("column")) {
        const basicPayloads = chunk.map((p) => ({
          namespace: p.namespace,
          url: p.url,
          title: p.title || "",
          h1: p.h1 || "",
          meta_description: p.meta_description || "",
          canonical: p.canonical || p.url,
          markdown_content: p.markdown_content || "",
          crawled_at: p.crawled_at || new Date().toISOString(),
        }));
        const retry = await supabase.from("pages").upsert(basicPayloads, { onConflict: "url" }).select("id");
        if (retry.data) savedCount += retry.data.length;
      }
    } else if (data) {
      savedCount += data.length;
    } else {
      savedCount += chunk.length;
    }
  }

  return savedCount;
}

/**
 * Guarda los enlaces internos asociados a una página
 */
export async function saveInternalLinksToSupabase(
  sourcePageId: string,
  links: InternalLinkItem[]
) {
  const supabase = getSupabaseClient();
  if (!supabase || !sourcePageId || links.length === 0) return;

  try {
    // Eliminar enlaces previos de esta página para refrescarlos limpiamente
    await supabase.from("internal_links").delete().eq("source_page_id", sourcePageId);

    const rows = links.map((link) => ({
      source_page_id: sourcePageId,
      target_url: link.target_url,
      anchor_text: (link.anchor_text || "").trim().slice(0, 255),
    }));

    // Insertar en lotes de 100
    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      await supabase.from("internal_links").insert(batch);
    }
  } catch (err: any) {
    console.warn(`⚠️ Error guardando enlaces internos en Supabase:`, err.message);
  }
}

/**
 * Guarda o actualiza una entidad reconciliada en la tabla entities
 */
export async function saveEntityToSupabase(entity: EntityRecord): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("entities")
      .upsert(
        {
          name: entity.name,
          schema_type: entity.schema_type,
          kg_mid: entity.kg_mid || null,
          wikidata_url: entity.wikidata_url || null,
          wikipedia_url: entity.wikipedia_url || null,
          description: entity.description || null,
        },
        { onConflict: "name" }
      )
      .select("id")
      .single();

    if (error) {
      console.warn(`⚠️ Error guardando entidad '${entity.name}':`, error.message);
      return null;
    }

    return data?.id || null;
  } catch (err: any) {
    console.warn(`⚠️ Excepción guardando entidad:`, err.message);
    return null;
  }
}

/**
 * Asocia una entidad a una página (rol: 'main_entity' o 'mention')
 */
export async function linkPageToEntityInSupabase(
  pageId: string,
  entityId: string,
  role: "main_entity" | "mention",
  confidence: number = 1.0
) {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  try {
    await supabase.from("page_entities").upsert(
      {
        page_id: pageId,
        entity_id: entityId,
        role,
        confidence,
      },
      { onConflict: "page_id,entity_id,role" }
    );
  } catch (err: any) {
    console.warn(`⚠️ Error asociando entidad a página:`, err.message);
  }
}

/**
 * Obtiene el grafo de conocimiento completo de un namespace
 */
export async function getEntityGraphByNamespace(namespace: string) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    // 1. Obtener todas las páginas del namespace (búsqueda insensible a mayúsculas/minúsculas)
    const { data: pages, error: pError } = await supabase
      .from("pages")
      .select("id, url, title, h1, canonical, meta_description, crawled_at")
      .ilike("namespace", namespace);

    if (pError || !pages || pages.length === 0) {
      return { pages: [], entities: [], relations: [], internalLinks: [] };
    }

    const pageIds = pages.map((p) => p.id);

    // 2. Obtener las relaciones page_entities
    const { data: pageEntities } = await supabase
      .from("page_entities")
      .select("page_id, entity_id, role, confidence, entities(*)")
      .in("page_id", pageIds);

    // 3. Obtener los enlaces internos entre páginas
    const { data: internalLinks } = await supabase
      .from("internal_links")
      .select("source_page_id, target_url, anchor_text")
      .in("source_page_id", pageIds);

    return {
      pages,
      pageEntities: pageEntities || [],
      internalLinks: internalLinks || [],
    };
  } catch (err: any) {
    console.error("Error al obtener grafo de entidades:", err);
    return null;
  }
}

/**
 * Procesa y estructura el grafo de Supabase en métricas, entidades reconciliadas y alertas de canibalización
 */
export function summarizeGraph(graph: any) {
  if (!graph || !graph.pages || graph.pages.length === 0) return null;

  const pageMap = new Map<string, any>();
  for (const p of graph.pages) {
    pageMap.set(p.id, p);
  }

  const mainEntitiesByUrl: Record<string, string[]> = {};
  const mentionsByUrl: Record<string, string[]> = {};
  const mainEntityCounts: Record<string, string[]> = {};
  const entitiesMap = new Map<string, any>();

  for (const rel of graph.pageEntities) {
    const page = pageMap.get(rel.page_id);
    const entity = rel.entities;
    if (!page || !entity) continue;

    if (!entitiesMap.has(entity.name)) {
      entitiesMap.set(entity.name, {
        name: entity.name,
        schema_type: entity.schema_type,
        kg_mid: entity.kg_mid,
        wikidata_url: entity.wikidata_url,
        wikipedia_url: entity.wikipedia_url,
        description: entity.description,
      });
    }

    if (rel.role === "main_entity") {
      if (!mainEntitiesByUrl[page.url]) mainEntitiesByUrl[page.url] = [];
      mainEntitiesByUrl[page.url].push(entity.name);

      if (!mainEntityCounts[entity.name]) mainEntityCounts[entity.name] = [];
      mainEntityCounts[entity.name].push(page.url);
    } else {
      if (!mentionsByUrl[page.url]) mentionsByUrl[page.url] = [];
      mentionsByUrl[page.url].push(entity.name);
    }
  }

  // Detectar canibalizaciones (2+ URLs con la misma main_entity)
  const cannibalizationAlerts = Object.entries(mainEntityCounts)
    .filter(([_, urls]) => urls.length > 1)
    .map(([entity, urls]) => ({
      entity,
      competingUrls: urls,
      message: `Posible canibalización: ${urls.length} URLs compiten por la entidad principal '${entity}'.`,
    }));

  return {
    totalPages: graph.pages.length,
    totalEntities: entitiesMap.size,
    totalInternalLinks: graph.internalLinks.length,
    entities: Array.from(entitiesMap.values()),
    mainEntitiesByUrl,
    mentionsByUrl,
    cannibalizationAlerts,
  };
}

/**
 * Genera la auditoría SEO técnica y relacional completa para un namespace (Estilo Screaming Frog)
 */
export async function getSeoAuditDataByNamespace(namespace: string) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    // 1. Obtener todas las páginas (búsqueda insensible a mayúsculas/minúsculas)
    const { data: pages, error: pError } = await supabase
      .from("pages")
      .select("*")
      .ilike("namespace", namespace)
      .order("crawled_at", { ascending: false });

    if (pError || !pages) return null;

    const pageIds = pages.map((p) => p.id);
    if (pageIds.length === 0) {
      return {
        metrics: {
          totalPages: 0,
          totalInlinks: 0,
          orphanPagesCount: 0,
          cannibalizationCount: 0,
          thinContentCount: 0,
          missingTitleCount: 0,
          missingH1Count: 0,
          missingMetaDescCount: 0,
          avgWordCount: 0,
        },
        pages: [],
        entities: [],
        cannibalizations: [],
      };
    }

    // 2. Obtener enlaces y entidades en paralelo
    const [{ data: internalLinks }, { data: pageEntities }] = await Promise.all([
      supabase.from("internal_links").select("source_page_id, target_url, anchor_text").in("source_page_id", pageIds),
      supabase.from("page_entities").select("page_id, role, confidence, entities(*)").in("page_id", pageIds),
    ]);

    // Mapa de Inlinks y Outlinks
    const inlinksCountByUrl: Record<string, number> = {};
    const outlinksCountByPageId: Record<string, number> = {};
    const inlinkAnchorsByUrl: Record<string, string[]> = {};

    for (const link of internalLinks || []) {
      outlinksCountByPageId[link.source_page_id] = (outlinksCountByPageId[link.source_page_id] || 0) + 1;

      const normTarget = link.target_url.replace(/\/$/, "");
      inlinksCountByUrl[normTarget] = (inlinksCountByUrl[normTarget] || 0) + 1;

      if (link.anchor_text) {
        if (!inlinkAnchorsByUrl[normTarget]) inlinkAnchorsByUrl[normTarget] = [];
        if (!inlinkAnchorsByUrl[normTarget].includes(link.anchor_text)) {
          inlinkAnchorsByUrl[normTarget].push(link.anchor_text);
        }
      }
    }

    // Mapa de Entidades
    const mainEntityByPageId: Record<string, any> = {};
    const mentionsByPageId: Record<string, any[]> = {};
    const mainEntityToUrls: Record<string, string[]> = {};
    const allEntitiesMap = new Map<string, any>();

    for (const pe of pageEntities || []) {
      const ent = pe.entities as any;
      if (!ent) continue;

      if (!allEntitiesMap.has(ent.name)) {
        allEntitiesMap.set(ent.name, ent);
      }

      if (pe.role === "main_entity") {
        mainEntityByPageId[pe.page_id] = ent;
        if (!mainEntityToUrls[ent.name]) mainEntityToUrls[ent.name] = [];
        // Buscar la url de esta página
        const p = pages.find((pg) => pg.id === pe.page_id);
        if (p) mainEntityToUrls[ent.name].push(p.url);
      } else {
        if (!mentionsByPageId[pe.page_id]) mentionsByPageId[pe.page_id] = [];
        mentionsByPageId[pe.page_id].push(ent);
      }
    }

    // Alertas de canibalización
    const cannibalizations = Object.entries(mainEntityToUrls)
      .filter(([_, urls]) => urls.length > 1)
      .map(([entityName, urls]) => ({
        entityName,
        urls,
      }));

    const cannibalizedEntityNames = new Set(cannibalizations.map((c) => c.entityName));

    // Procesar cada página con sus métricas
    let thinCount = 0;
    let missingTitle = 0;
    let missingH1 = 0;
    let missingMeta = 0;
    let orphanCount = 0;
    let totalWords = 0;

    const auditedPages = pages.map((p) => {
      const normUrl = p.url.replace(/\/$/, "");
      const inlinks = inlinksCountByUrl[normUrl] || inlinksCountByUrl[p.url] || 0;
      const outlinks = outlinksCountByPageId[p.id] || 0;
      const mainEnt = mainEntityByPageId[p.id];
      const mentions = mentionsByPageId[p.id] || [];
      const wordCount = p.word_count || (p.markdown_content ? p.markdown_content.split(/\s+/).filter(Boolean).length : 0);

      const isOrphan = inlinks === 0;
      const isThin = wordCount < 300;
      const isMissingTitle = !p.title || p.title.trim().length === 0;
      const isMissingH1 = !p.h1 || p.h1.trim().length === 0 || p.h1 === "Sin Título";
      const isMissingMeta = !p.meta_description || p.meta_description.trim().length === 0;
      const isCannibalized = Boolean(mainEnt && cannibalizedEntityNames.has(mainEnt.name));

      if (isThin) thinCount++;
      if (isMissingTitle) missingTitle++;
      if (isMissingH1) missingH1++;
      if (isMissingMeta) missingMeta++;
      if (isOrphan) orphanCount++;
      totalWords += wordCount;

      return {
        id: p.id,
        url: p.url,
        slug: p.slug || new URL(p.url).pathname.replace(/^\/|\/$/g, "").replace(/\.html$/, "") || "inicio",
        title: p.title || "",
        h1: p.h1 || "",
        meta_description: p.meta_description || "",
        canonical: p.canonical || p.url,
        language: p.language || "es",
        word_count: wordCount,
        inlinks_count: inlinks,
        outlinks_count: outlinks,
        inlink_anchors: inlinkAnchorsByUrl[normUrl] || [],
        main_entity: mainEnt ? { name: mainEnt.name, schema_type: mainEnt.schema_type, kg_mid: mainEnt.kg_mid, wikidata_url: mainEnt.wikidata_url } : null,
        mentions_count: mentions.length,
        is_orphan: isOrphan,
        is_thin: isThin,
        is_missing_title: isMissingTitle,
        is_missing_h1: isMissingH1,
        is_missing_meta: isMissingMeta,
        is_cannibalized: isCannibalized,
        existing_schema: p.existing_schema || null,
        generated_schema: p.generated_schema || null,
        markdown_content: p.markdown_content || "",
        crawled_at: p.crawled_at,
      };
    });

    return {
      metrics: {
        totalPages: pages.length,
        totalInlinks: (internalLinks || []).length,
        totalEntities: allEntitiesMap.size,
        orphanPagesCount: orphanCount,
        cannibalizationCount: cannibalizations.length,
        thinContentCount: thinCount,
        missingTitleCount: missingTitle,
        missingH1Count: missingH1,
        missingMetaDescCount: missingMeta,
        avgWordCount: pages.length > 0 ? Math.round(totalWords / pages.length) : 0,
      },
      pages: auditedPages,
      entities: Array.from(allEntitiesMap.values()),
      cannibalizations,
    };
  } catch (err: any) {
    console.error("Error en getSeoAuditDataByNamespace:", err);
    return null;
  }
}
