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

interface BrowserProfile {
  userAgent: string;
  secChUa?: string;
  secChUaMobile?: string;
  secChUaPlatform?: string;
}

const BROWSER_PROFILES: BrowserProfile[] = [
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    secChUa: '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    secChUaMobile: "?0",
    secChUaPlatform: '"Windows"',
  },
  {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    secChUa: '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    secChUaMobile: "?0",
    secChUaPlatform: '"macOS"',
  },
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  },
  {
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    secChUa: '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    secChUaMobile: "?0",
    secChUaPlatform: '"Linux"',
  },
];

const getHeaders = (referer?: string) => {
  const profile = BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)];

  const headers: Record<string, string> = {
    "User-Agent": profile.userAgent,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": referer ? "same-origin" : "none",
    "Sec-Fetch-User": "?1",
    "Cache-Control": "max-age=0",
  };

  if (profile.secChUa) {
    headers["sec-ch-ua"] = profile.secChUa;
    headers["sec-ch-ua-mobile"] = profile.secChUaMobile || "?0";
    headers["sec-ch-ua-platform"] = profile.secChUaPlatform || '"Windows"';
  }

  if (referer) {
    headers["Referer"] = referer;
  }

  return headers;
};

const toScraperUrl = (url: string, forceProxy = false) => {
  const key = process.env.SCRAPER_API_KEY;
  if (!key) return url;
  if (!forceProxy && !key) return url;
  return `http://api.scraperapi.com?api_key=${key}&url=${encodeURIComponent(url)}&country_code=us&device_type=desktop`;
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
  const queue: { url: string; depth: number; referer?: string }[] = [{ url: normalizedStart, depth: 0 }];
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
            queue.push({ url: norm, depth: 1, referer: normalizedStart });
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

    const { url, depth, referer } = item;

    // Ignorar si ya fue visitada o si es un archivo .xml
    if (visitedUrls.has(url) || url.endsWith(".xml")) continue;
    visitedUrls.add(url);

    try {
      console.log(`🌐 Scrapeando (${visitedUrls.size}/${maxPages}) [Profundidad ${depth}]: ${url}`);
      let response = await fetch(toScraperUrl(url), { headers: getHeaders(referer) });

      // Si detectamos HTTP 403 (Bloqueo WAF/Cloudflare) y hay ScraperAPI configurada, reintentar con proxy residencial
      if (response.status === 403 && process.env.SCRAPER_API_KEY) {
        console.warn(`🛡️ HTTP 403 detectado en ${url}. Reintentando automáticamente con proxy residencial de ScraperAPI...`);
        await new Promise((res) => setTimeout(res, 800));
        response = await fetch(toScraperUrl(url, true), { headers: getHeaders(referer) });
      }

      if (response.status === 429) {
        console.warn(`⏳ El sitio respondió con HTTP 429 (Límite de peticiones). Pausando 3.5 segundos antes de reintentar ${url}...`);
        visitedUrls.delete(url); // Permitir reintento
        queue.unshift({ url, depth, referer }); // Devolver a la cola
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
              queue.push({ url: resolved, depth: depth + 1, referer: url });
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

/**
 * Scrapea y extrae los fragmentos semánticos de una sola página bajo demanda
 */
export async function scrapeSingleUrl(
  url: string,
  chunkSize = 1000,
  chunkOverlap = 150
): Promise<PageChunk[]> {
  const origin = new URL(url).origin;
  let response = await fetch(toScraperUrl(url), { headers: getHeaders(origin) });

  // Si detectamos HTTP 403 (Protección Cloudflare/WAF) y hay ScraperAPI configurada, rescatar automáticamente
  if (response.status === 403 && process.env.SCRAPER_API_KEY) {
    console.warn(`🛡️ HTTP 403 detectado en single-url ${url}. Reintentando con proxy residencial de ScraperAPI...`);
    await new Promise((res) => setTimeout(res, 800));
    response = await fetch(toScraperUrl(url, true), { headers: getHeaders(origin) });
  }

  if (!response.ok) {
    throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    throw new Error(`El recurso no es HTML (${contentType})`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const h1Text = $("h1").first().text().trim() || $("title").text().trim() || "Sin Título";

  // 1. Detectar y convertir imágenes que son enlaces en CTAs
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

  // 3. Selección jerárquica del contenedor principal
  const mainContainer = $(
    "main, article, [role='main'], #main-content, #content, .post-content, .entry-content, .article-content, .page-content, .blog-post, .content, body"
  ).first();
  const htmlContent = mainContainer.html() || "";
  const markdown = turndownService.turndown(htmlContent).trim();

  if (markdown.length < 50) {
    throw new Error("La página tiene contenido insuficiente o está protegida contra scraping.");
  }

  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
  });

  const chunks = await textSplitter.splitText(markdown);
  return chunks.map((chunkText) => ({
    url,
    h1: h1Text,
    text: chunkText,
  }));
}

