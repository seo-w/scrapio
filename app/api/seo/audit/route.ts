import { NextRequest, NextResponse } from "next/server";
import { getScrapioUserOrApiKey, isNamespaceAllowed } from "@/lib/auth";
import { getSeoAuditDataByNamespace, getSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const user = await getScrapioUserOrApiKey(req);
    if (!user) {
      return NextResponse.json({ error: "No autorizado. Inicia sesión o proporciona tu Scrapio API Key." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const rawNamespace = searchParams.get("namespace");

    if (!rawNamespace) {
      return NextResponse.json({ error: "El parámetro 'namespace' es obligatorio." }, { status: 400 });
    }

    if (!isNamespaceAllowed(user, rawNamespace)) {
      return NextResponse.json({ error: `No tienes permisos para ver el namespace '${rawNamespace}'.` }, { status: 403 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json(
        {
          error:
            "Supabase no está conectado en el servidor. Asegúrate de agregar SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en las variables de entorno de Vercel.",
          notConfigured: true,
        },
        { status: 503 }
      );
    }

    const auditData = await getSeoAuditDataByNamespace(rawNamespace);

    if (!auditData) {
      return NextResponse.json({
        namespace: rawNamespace,
        metrics: {
          totalPages: 0,
          totalInlinks: 0,
          totalEntities: 0,
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
      });
    }

    return NextResponse.json({
      namespace: rawNamespace,
      ...auditData,
    });
  } catch (err: any) {
    console.error("Error en GET /api/seo/audit:", err);
    return NextResponse.json({ error: err.message || "Error al generar auditoría SEO." }, { status: 500 });
  }
}
