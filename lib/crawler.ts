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
}

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

// Remover elementos irrelevantes de Turndown mediante función de filtro
turndownService.remove((node) => {
  const name = node.nodeName.toLowerCase();
  return ["script", "style", "nav", "footer", "header", "noscript", "iframe", "svg"].includes(name);
});

/**
 * Normaliza una URL resolviendo relativas y eliminando fragmentos (#)
 */
function normalizeUrl(rawUrl: string, baseUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl, baseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Comprueba si una URL pertenece al mismo dominio/host que la URL base
 */
function isSameDomain(targetUrl: string, baseUrl: string): boolean {
  try {
    const targetHost = new URL(targetUrl).hostname.replace(/^www\./, "");
    const baseHost = new URL(baseUrl).hostname.replace(/^www\./, "");
    return targetHost === baseHost;
  } catch {
    return false;
  }
}

/**
 * Rastrea recursivamente un dominio y devuelve los chunks procesados
 */
export async function crawlDomain(options: CrawlOptions): Promise<PageChunk[]> {
  const {
    startUrl,
    maxPages = 15,
    maxDepth = 2,
    chunkSize = 1000,
    chunkOverlap = 150,
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

  console.log(`🔍 Iniciando crawler en ${normalizedStart} (Límite: ${maxPages} páginas, Profundidad max: ${maxDepth})...`);

  while (queue.length > 0 && visitedUrls.size < maxPages) {
    const item = queue.shift();
    if (!item) break;

    const { url, depth } = item;

    if (visitedUrls.has(url)) continue;
    visitedUrls.add(url);

    try {
      console.log(`🌐 Scrapeando (${visitedUrls.size}/${maxPages}) [Profundidad ${depth}]: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 ScrapioBot/1.0",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

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

      // Extraer H1 o título principal
      const h1Text = $("h1").first().text().trim() || $("title").text().trim() || "Sin Título";

      // Eliminar elementos no deseados antes de extraer contenido
      $("nav, footer, header, script, style, noscript, svg, iframe, form").remove();

      // Seleccionar el contenedor principal o el body
      const mainContainer = $("main, article, .content, #content, body").first();
      const htmlContent = mainContainer.html() || "";

      // Convertir a Markdown limpio
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
            if (!/\.(pdf|png|jpg|jpeg|gif|css|js|zip|svg|ico)$/i.test(resolved)) {
              queue.push({ url: resolved, depth: depth + 1 });
            }
          }
        });
      }

    } catch (err: any) {
      console.error(`❌ Error scrapeando ${url}:`, err.message || err);
    }
  }

  console.log(`✅ Rastreo completado. Total páginas procesadas: ${visitedUrls.size}, Total Chunks generados: ${allChunks.length}`);
  return allChunks;
}
