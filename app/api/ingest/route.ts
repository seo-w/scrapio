import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { targetUrl, clientNamespace, maxPages = 50, aiProvider } = body;

    if (!targetUrl || typeof targetUrl !== "string") {
      return NextResponse.json(
        { error: "El campo 'targetUrl' es obligatorio." },
        { status: 400 }
      );
    }

    if (!clientNamespace || typeof clientNamespace !== "string") {
      return NextResponse.json(
        { error: "El campo 'clientNamespace' es obligatorio." },
        { status: 400 }
      );
    }

    const githubToken = process.env.GITHUB_TOKEN;
    const repoOwner = process.env.GITHUB_REPO_OWNER || "seo-w";
    const repoName = process.env.GITHUB_REPO_NAME || "scrapio";

    if (!githubToken) {
      return NextResponse.json(
        {
          error: "Falta la variable de entorno GITHUB_TOKEN en Vercel para autorizar el disparo del workflow en GitHub Actions.",
          requiresTokenSetup: true,
        },
        { status: 400 }
      );
    }

    // Disparar el evento workflow_dispatch mediante la REST API de GitHub
    const githubApiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/ingesta.yml/dispatches`;

    const ghResponse = await fetch(githubApiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "ScrapioApp/1.0",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          target_url: targetUrl,
          client_namespace: clientNamespace,
          max_pages: String(maxPages),
          ai_provider: aiProvider || "gemini",
        },
      }),
    });

    if (!ghResponse.ok) {
      const errorText = await ghResponse.text();
      console.error("Error al disparar GitHub Action:", errorText);
      return NextResponse.json(
        { error: `Error en la API de GitHub (${ghResponse.status}): ${errorText}` },
        { status: ghResponse.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: `🚀 ¡Orden enviada exitosamente a GitHub Actions! El sitio '${targetUrl}' se está escaneando e ingestando en segundo plano bajo el namespace '${clientNamespace}'.`,
      targetUrl,
      clientNamespace,
    });
  } catch (error: any) {
    console.error("Error en /api/ingest:", error);
    return NextResponse.json(
      { error: error.message || "Error interno al disparar el escaneo." },
      { status: 500 }
    );
  }
}
