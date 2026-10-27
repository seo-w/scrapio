import * as cheerio from "cheerio";

export interface SchemaValidationResult {
  status: "valid" | "warning" | "error";
  score: number; // 0 a 100
  warnings: string[];
  typesFound: string[];
}

/**
 * Extrae y parsea con total seguridad los scripts application/ld+json existentes en el HTML
 */
export function extractExistingJsonLd($: cheerio.CheerioAPI): { raw: any[]; validation: SchemaValidationResult } {
  const schemas: any[] = [];
  const warnings: string[] = [];
  const typesFound: string[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const text = $(el).text().trim();
      if (!text) return;
      const parsed = JSON.parse(text);

      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === "object") {
            schemas.push(item);
            if (item["@type"]) typesFound.push(String(item["@type"]));
          }
        }
      } else if (parsed && typeof parsed === "object") {
        if (parsed["@graph"] && Array.isArray(parsed["@graph"])) {
          for (const item of parsed["@graph"]) {
            schemas.push(item);
            if (item["@type"]) typesFound.push(String(item["@type"]));
          }
        } else {
          schemas.push(parsed);
          if (parsed["@type"]) typesFound.push(String(parsed["@type"]));
        }
      }
    } catch (err: any) {
      warnings.push(`Sintaxis JSON-LD malformada o rota: ${err.message}`);
    }
  });

  if (schemas.length === 0 && warnings.length === 0) {
    warnings.push("La página no cuenta con ningún marcado Schema.org JSON-LD en vivo.");
  }

  // Comprobar campos obligatorios según el tipo
  for (const s of schemas) {
    const type = s["@type"];
    if (type === "Article" || type === "BlogPosting") {
      if (!s.headline && !s.name) warnings.push("Falta 'headline' en Article.");
      if (!s.author) warnings.push("Falta 'author' en Article.");
      if (!s.datePublished) warnings.push("Falta 'datePublished' en Article.");
    } else if (type === "Product" || type === "FinancialProduct") {
      if (!s.name) warnings.push(`Falta 'name' en ${type}.`);
      if (!s.offers && !s.description) warnings.push(`Falta 'description' u 'offers' en ${type}.`);
    } else if (type === "Organization" || type === "LocalBusiness") {
      if (!s.name) warnings.push(`Falta 'name' en ${type}.`);
      if (!s.url) warnings.push(`Falta 'url' en ${type}.`);
    }
  }

  let status: "valid" | "warning" | "error" = "valid";
  let score = 100;

  if (warnings.some((w) => w.includes("malformada") || w.includes("rota"))) {
    status = "error";
    score = 25;
  } else if (warnings.length > 0) {
    status = "warning";
    score = Math.max(40, 100 - warnings.length * 15);
  }

  return {
    raw: schemas,
    validation: {
      status,
      score,
      warnings,
      typesFound: Array.from(new Set(typesFound)),
    },
  };
}

export interface GeneratedSchemaInput {
  url: string;
  title: string;
  h1: string;
  metaDescription?: string;
  language?: string;
  mainEntityName?: string;
  mainEntityType?: string;
  kgMid?: string;
  wikidataUrl?: string;
  secondaryEntities?: Array<{ name: string; schemaType?: string; wikidataUrl?: string }>;
  brandName?: string;
  domain?: string;
}

/**
 * Genera el marcado Schema.org JSON-LD completo e interconectado con @graph
 */
export function generateFullSchemaJsonLd(input: GeneratedSchemaInput): Record<string, any> {
  const origin = input.domain || (input.url ? new URL(input.url).origin : "https://sitio.com");
  const brand = input.brandName || "Organización";
  const schemaType = input.mainEntityType || "WebPage";

  const sameAsList: string[] = [];
  if (input.wikidataUrl) sameAsList.push(input.wikidataUrl);
  if (input.kgMid) sameAsList.push(`https://www.google.com/search?kgmid=${input.kgMid}`);

  // Entidad principal
  const mainEntityNode: Record<string, any> = {
    "@type": schemaType,
    "@id": `${input.url}#primary-entity`,
    name: input.mainEntityName || input.h1 || input.title,
    description: input.metaDescription || `Información sobre ${input.mainEntityName || input.h1}`,
    url: input.url,
  };

  if (sameAsList.length > 0) {
    mainEntityNode.sameAs = sameAsList;
  }

  // Nodo WebPage
  const webPageNode: Record<string, any> = {
    "@type": "WebPage",
    "@id": `${input.url}#webpage`,
    url: input.url,
    name: input.title,
    headline: input.h1,
    description: input.metaDescription || "",
    inLanguage: input.language || "es",
    isPartOf: {
      "@type": "WebSite",
      "@id": `${origin}#website`,
      name: brand,
      url: origin,
    },
    about: {
      "@id": `${input.url}#primary-entity`,
    },
  };

  // Menciones secundarias
  if (input.secondaryEntities && input.secondaryEntities.length > 0) {
    webPageNode.mentions = input.secondaryEntities.map((ent) => ({
      "@type": ent.schemaType || "Thing",
      name: ent.name,
      ...(ent.wikidataUrl ? { sameAs: ent.wikidataUrl } : {}),
    }));
  }

  // Nodo Organization
  const orgNode: Record<string, any> = {
    "@type": "Organization",
    "@id": `${origin}#organization`,
    name: brand,
    url: origin,
  };

  webPageNode.publisher = {
    "@id": `${origin}#organization`,
  };

  return {
    "@context": "https://schema.org",
    "@graph": [orgNode, mainEntityNode, webPageNode],
  };
}
