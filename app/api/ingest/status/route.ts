import { NextResponse } from "next/server";

export async function GET() {
  try {
    const repoOwner = process.env.GITHUB_REPO_OWNER || "seo-w";
    const repoName = process.env.GITHUB_REPO_NAME || "scrapio";
    const githubToken = process.env.GITHUB_TOKEN;

    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "ScrapioApp/1.0",
    };

    if (githubToken) {
      headers["Authorization"] = `Bearer ${githubToken}`;
    }

    const runsUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/ingesta.yml/runs?per_page=1`;
    const res = await fetch(runsUrl, { headers, cache: "no-store" });

    if (!res.ok) {
      return NextResponse.json({
        isAvailable: false,
        status: "unknown",
        message: "No se pudo obtener el estado desde GitHub API.",
      });
    }

    const data = await res.json();
    const latestRun = data.workflow_runs?.[0];

    if (!latestRun) {
      return NextResponse.json({
        isAvailable: false,
        status: "idle",
        message: "No hay ejecuciones de ingesta registradas.",
      });
    }

    let progressPercent = 0;
    let currentStepName = "Iniciando proceso...";

    if (latestRun.status === "completed") {
      progressPercent = 100;
      currentStepName = latestRun.conclusion === "success" 
        ? "✅ Ingesta finalizada exitosamente" 
        : "❌ Ingesta finalizada con error";
    } else if (latestRun.status === "in_progress") {
      // Intentar obtener el detalle del job para calcular el porcentaje real
      try {
        const jobsRes = await fetch(latestRun.jobs_url, { headers, cache: "no-store" });
        if (jobsRes.ok) {
          const jobsData = await jobsRes.json();
          const mainJob = jobsData.jobs?.[0];
          if (mainJob && Array.isArray(mainJob.steps)) {
            const steps = mainJob.steps;
            const completedSteps = steps.filter((s: any) => s.status === "completed").length;
            const activeStep = steps.find((s: any) => s.status === "in_progress");

            progressPercent = Math.min(95, Math.round((completedSteps / Math.max(steps.length, 5)) * 100));
            if (activeStep) {
              currentStepName = `⚙️ ${activeStep.name}...`;
            } else {
              currentStepName = "🌐 Procesando crawler e embeddings...";
            }
          }
        }
      } catch (err) {
        progressPercent = 50;
        currentStepName = "🌐 Ingesta en progreso en GitHub Actions...";
      }
    } else {
      progressPercent = 10;
      currentStepName = "⏳ En cola de ejecución en GitHub Actions...";
    }

    return NextResponse.json({
      isAvailable: true,
      runId: latestRun.id,
      runNumber: latestRun.run_number,
      status: latestRun.status, // "queued" | "in_progress" | "completed"
      conclusion: latestRun.conclusion, // "success" | "failure" | null
      createdAt: latestRun.created_at,
      updatedAt: latestRun.updated_at,
      htmlUrl: latestRun.html_url,
      progressPercent,
      currentStepName,
    });
  } catch (error: any) {
    console.error("Error en GET /api/ingest/status:", error);
    return NextResponse.json(
      { error: error.message || "Error al obtener el estado de ingesta." },
      { status: 500 }
    );
  }
}
