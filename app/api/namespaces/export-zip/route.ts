import { NextRequest, NextResponse } from "next/server";
import { getScrapioUserOrApiKey, isNamespaceAllowed } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";
import JSZip from "jszip";

export const dynamic = "force-dynamic";

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9\-_.]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function GET(req: NextRequest) {
  try {
    const user = await getScrapioUserOrApiKey(req);
    if (!user) {
      return NextResponse.json(
        { error: "No autorizado. Inicia sesión o proporciona tu API Key." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const namespace = searchParams.get("namespace");

    if (!namespace) {
      return NextResponse.json(
        { error: "El parámetro 'namespace' es obligatorio." },
        { status: 400 }
      );
    }

    if (!isNamespaceAllowed(user, namespace)) {
      return NextResponse.json(
        { error: `No tienes permisos para acceder al namespace '${namespace}'.` },
        { status: 403 }
      );
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase no está configurado." },
        { status: 503 }
      );
    }

    // Consultar todas las páginas del namespace con su contenido markdown
    const { data: pages, error } = await supabase
      .from("pages")
      .select("id, url, slug, title, h1, markdown_content")
      .ilike("namespace", namespace);

    if (error) {
      return NextResponse.json(
        { error: `Error al consultar Supabase: ${error.message}` },
        { status: 500 }
      );
    }

    if (!pages || pages.length === 0) {
      return NextResponse.json(
        { error: `No se encontraron páginas para el namespace '${namespace}'.` },
        { status: 404 }
      );
    }

    const zip = new JSZip();
    const usedFilenames = new Set<string>();

    for (const page of pages) {
      const rawContent = page.markdown_content || "";
      let baseName = page.slug ? sanitizeFilename(page.slug) : "";

      if (!baseName || baseName === "index" || baseName === "inicio") {
        try {
          const parsed = new URL(page.url);
          const pathPart = parsed.pathname.replace(/^\/|\/$/g, "").replace(/\//g, "-");
          baseName = sanitizeFilename(pathPart || parsed.hostname);
        } catch {
          baseName = sanitizeFilename(page.title || "pagina");
        }
      }

      if (!baseName) baseName = `page-${page.id || Math.random().toString(36).substring(7)}`;

      let fileName = `${baseName}.md`;
      let counter = 2;
      while (usedFilenames.has(fileName.toLowerCase())) {
        fileName = `${baseName}-${counter}.md`;
        counter++;
      }
      usedFilenames.add(fileName.toLowerCase());

      zip.file(fileName, rawContent);
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

    return new NextResponse(zipBuffer as any, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="markdowns-${sanitizeFilename(namespace)}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("Error al exportar ZIP de markdowns:", err);
    return NextResponse.json(
      { error: err.message || "Error interno al generar el ZIP." },
      { status: 500 }
    );
  }
}
