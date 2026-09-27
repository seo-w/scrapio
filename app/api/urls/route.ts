import { NextRequest, NextResponse } from "next/server";
import { getExistingIndexedUrls } from "@/lib/pinecone";
import { fetchSitemapUrls } from "@/lib/crawler";

function inferDomain(namespace: string): string {
  const clean = namespace.toLowerCase().replace(/^cliente-/, "").replace(/^pb_/, "");
  if (clean.includes("avafin")) return "https://www.avafin.mx";
  if (clean.includes("personalbliss")) return "https://personalbliss.org";
  return `https://www.${clean.replace(/_/g, "-")}.com`;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const namespace = searchParams.get("namespace");

    if (!namespace) {
      return NextResponse.json(
        { error: "El parámetro 'namespace' es obligatorio." },
        { status: 400 }
      );
    }

    // 1. URLs ya existentes en Pinecone para este namespace
    const existingSet = await getExistingIndexedUrls(namespace);
    const indexedUrls = Array.from(existingSet);

    // 2. URLs descubiertas desde el sitemap
    const domain = inferDomain(namespace);
    const possibleSitemaps = [
      `${domain}/sitemap.xml`,
      `${domain}/sitemap_index.xml`,
      `${domain}/blog-sitemap.xml`,
    ];

    let discoveredUrls: string[] = [];
    for (const sitemapUrl of possibleSitemaps) {
      const urls = await fetchSitemapUrls(sitemapUrl);
      if (urls.length > 0) {
        discoveredUrls = urls;
        break;
      }
    }

    // Si el sitemap no responde o no existe, las descubiertas son al menos las ya indexadas
    if (discoveredUrls.length === 0) {
      discoveredUrls = [...indexedUrls];
    }

    const pendingUrls = discoveredUrls.filter((u) => !existingSet.has(u));

    return NextResponse.json({
      namespace,
      domain,
      totalDiscovered: discoveredUrls.length,
      totalIndexed: indexedUrls.length,
      totalPending: pendingUrls.length,
      progressPercent:
        discoveredUrls.length > 0
          ? Math.round((indexedUrls.length / discoveredUrls.length) * 100)
          : 100,
      indexedUrls,
      pendingUrls,
    });
  } catch (err: any) {
    console.error("Error en GET /api/urls:", err);
    return NextResponse.json(
      { error: err.message || "Error al auditar URLs del proyecto." },
      { status: 500 }
    );
  }
}
