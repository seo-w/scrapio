import * as cheerio from "cheerio";
import TurndownService from "turndown";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

export interface PageChunk {
  url: string;
  h1: string;
  text: string;
}

export interface CrawlOptions {
  startUrl: string;
  maxPages?: number;
  maxDepth?: number;
  chunkSize?: number;
  chunkOverlap?: number;
  useSitemap?: boolean;
}

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
];

const BASE_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
};

const getHeaders = () => ({
  ...BASE_HEADERS,
  "User-Agent": USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
});

const toScraperUrl = (url: string) => {
  const key = process.env.SCRAPER_API_KEY;
  return key ? `http://api.scraperapi.com?api_key=${key}&url=${encodeURIComponent(url)}` : url;
};

turndownService.remove((node) => {
  const name = node.nodeName.toLowerCase();
  return ["script", "style", "nav", "footer", "header", "noscript", "iframe", "svg"].includes(name);
});

function normalizeUrl(raw: string, base: string): string | null {
  try {
    const p = new URL(raw, base);
    return p.protocol.startsWith("http") ? `${p.origin}${p.pathname}${p.search}` : null;
  } catch {
    return null;
  }
}

function isSameDomain(a: string, b: string): boolean {
  try {
    return new URL(a).hostname.replace(/^www\./, "") === new URL(b).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
}

/**
 * Extrae URLs reales de páginas web resolviendo sitemaps recursivos (Sitemap Index)
 */
export async function fetchSitemapUrls(sitemapUrl: string, depth: number = 0): Promise<string[]> {
  if (depth > 2) return []; // Evitar bucles infinitos en sitemaps
  try {
    console.log(`🗺️ Leyendo sitemap (nivel ${depth}): ${sitemapUrl}`);
    const res = await fetch(toScraperUrl(sitemapUrl), {
      headers: getHeaders(),
    });
    if (!res.ok) return [];

    const xmlText = await res.text();
    const $ = cheerio.load(xmlText, { xmlMode: true });
    const urls: string[] = [];

    const locs: string[] = [];
    $("url > loc, sitemap > loc").each((_, el) => {
      const loc = $(el).text().trim();
      if (loc) locs.push(loc);
    });

    for (const loc of locs) {
      if (loc.endsWith(".xml") || loc.includes("sitemap")) {
        // Es un sub-sitemap (Sitemap Index), resolver de forma recursiva
        const subUrls = await fetchSitemapUrls(loc, depth + 1);
        urls.push(...subUrls);
      } else {
        urls.push(loc);
      }
    }

    return Array.from(new Set(urls));
  } catch (err: any) {
    console.warn(`⚠️ No se pudo procesar sitemap ${sitemapUrl}:`, err.message);
    return [];
  }
}

/**
 * Rastrea recursivamente un dominio y devuelve los chunks procesados
 */
export async function crawlDomain(options: CrawlOptions): Promise<PageChunk[]> {
  const {
    startUrl,
    maxPages = 50,
    maxDepth = 3,
    chunkSize = 1000,
    chunkOverlap = 150,
    useSitemap = true,
  } = options;

  const normalizedStart = normalizeUrl(startUrl, startUrl);
  if (!normalizedStart) {
    throw new Error(`URL de inicio no válida: ${startUrl}`);
  }

  const visitedUrls = new Set<string>();
  const queue: { url: string; depth: number }[] = [{ url: normalizedStart, depth: 0 }];
  const allChunks: PageChunk[] = [];

  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
  });

  // Intentar obtener URLs reales desde el sitemap.xml
  if (useSitemap) {
    const origin = new URL(normalizedStart).origin;
    const possibleSitemaps = [
      `${origin}/sitemap.xml`,
      `${origin}/sitemap_index.xml`,
    ];

    for (const sitemapUrl of possibleSitemaps) {
      const sitemapUrls = await fetchSitemapUrls(sitemapUrl);
      if (sitemapUrls.length > 0) {
        console.log(`✅ ¡Sitemap completo resuelto! Se encontraron ${sitemapUrls.length} URLs de páginas web.`);
        for (const u of sitemapUrls) {
          const norm = normalizeUrl(u, normalizedStart);
          if (norm && isSameDomain(norm, normalizedStart) && !norm.endsWith(".xml")) {
            queue.push({ url: norm, depth: 1 });
          }
        }
        break;
      }
    }
  }

  console.log(`🔍 Iniciando crawler en ${normalizedStart} (Límite: ${maxPages} páginas, Cola inicial: ${queue.length} URLs)...`);

  while (queue.length > 0 && visitedUrls.size < maxPages) {
    const item = queue.shift();
    if (!item) break;

    const { url, depth } = item;

    // Ignorar si ya fue visitada o si es un archivo .xml
    if (visitedUrls.has(url) || url.endsWith(".xml")) continue;
    visitedUrls.add(url);

    try {
      console.log(`🌐 Scrapeando (${visitedUrls.size}/${maxPages}) [Profundidad ${depth}]: ${url}`);
      const response = await fetch(toScraperUrl(url), { headers: getHeaders() });

      if (response.status === 429) {
        console.warn(`⏳ El sitio respondió con HTTP 429 (Límite de peticiones). Pausando 3.5 segundos antes de reintentar ${url}...`);
        visitedUrls.delete(url); // Permitir reintento
        queue.unshift({ url, depth }); // Devolver a la cola
        await new Promise((res) => setTimeout(res, 3500));
        continue;
      }

      if (!response.ok) {
        console.warn(`⚠️ HTTP ${response.status} en ${url}`);
        continue;
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) {
        continue;
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      const h1Text = $("h1").first().text().trim() || $("title").text().trim() || "Sin Título";

      // 1. Detectar y convertir imágenes que son enlaces a portales/formularios en CTAs explícitos
      $("a").each((_, el) => {
        const $a = $(el);
        const $img = $a.find("img");
        if ($img.length > 0 && !$a.text().trim()) {
          const alt = $img.attr("alt")?.trim() || $img.attr("title")?.trim() || "Imagen con enlace";
          const href = $a.attr("href") || "";
          if (href && !href.startsWith("#") && !href.startsWith("javascript:")) {
            $a.replaceWith(`<p><strong>[Banner de Conversión / CTA: "${alt}"](${href})</strong></p>`);
          }
        }
      });

      // 2. Eliminar ruido visual e interfaces repetitivas
      $("nav, footer, header, script, style, noscript, svg, iframe, form").remove();

      // 3. Selección jerárquica del contenedor principal con fallback seguro a <body>
      const mainContainer = $(
        "main, article, [role='main'], #main-content, #content, .post-content, .entry-content, .article-content, .page-content, .blog-post, .content, body"
      ).first();
      const htmlContent = mainContainer.html() || "";

      const markdown = turndownService.turndown(htmlContent).trim();

      if (markdown.length > 50) {
        const chunks = await textSplitter.splitText(markdown);
        for (const chunkText of chunks) {
          allChunks.push({
            url,
            h1: h1Text,
            text: chunkText,
          });
        }
      }

      if (depth < maxDepth) {
        $("a[href]").each((_, el) => {
          const href = $(el).attr("href");
          if (!href) return;

          const resolved = normalizeUrl(href, url);
          if (resolved && isSameDomain(resolved, normalizedStart) && !visitedUrls.has(resolved)) {
            if (!/\.(pdf|png|jpg|jpeg|gif|css|js|zip|svg|ico|xml)$/i.test(resolved)) {
              queue.push({ url: resolved, depth: depth + 1 });
            }
          }
        });
      }

      // Pausa aleatoria con jitter (350ms - 750ms) para imitar velocidad humana e impredecible
      const randomJitter = Math.floor(Math.random() * 400) + 350;
      await new Promise((res) => setTimeout(res, randomJitter));

    } catch (err: any) {
      console.error(`❌ Error scrapeando ${url}:`, err.message || err);
    }
  }

  console.log(`✅ Rastreo completado. Total páginas procesadas: ${visitedUrls.size}, Total Chunks generados: ${allChunks.length}`);
  return allChunks;
}
