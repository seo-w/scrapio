"use client";

import React, { useState, useEffect } from "react";
import {
  FileText,
  Search,
  Download,
  ExternalLink,
  Copy,
  Check,
  AlertTriangle,
  RefreshCw,
  X,
  Code,
  Link as LinkIcon,
  Sparkles,
  Layers,
  ArrowLeft,
  ShieldCheck,
  Globe,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

interface SeoAuditDashboardProps {
  namespace: string;
  onBackToChat: () => void;
}

export default function SeoAuditDashboard({ namespace, onBackToChat }: SeoAuditDashboardProps) {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<
    "all" | "orphan" | "cannibalized" | "thin" | "missing_meta" | "missing_title"
  >("all");
  const [isCannibalizationExpanded, setIsCannibalizationExpanded] = useState(false);
  const [selectedCannibalizationEntity, setSelectedCannibalizationEntity] = useState<string | null>(null);

  // Inspección de página individual
  const [selectedPage, setSelectedPage] = useState<any>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<"markdown" | "schema" | "links">("markdown");
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const [copiedSchema, setCopiedSchema] = useState(false);
  const [isSyncingPinecone, setIsSyncingPinecone] = useState(false);

  const handleSyncFromPinecone = async () => {
    if (!namespace) return;
    setIsSyncingPinecone(true);
    try {
      const res = await fetch("/api/seo/sync-pinecone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ namespace }),
      });
      const resJson = await res.json();
      if (res.ok && resJson.success) {
        alert(resJson.message);
        fetchAudit();
      } else {
        alert(resJson.message || resJson.error || "No se pudo sincronizar.");
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsSyncingPinecone(false);
    }
  };

  const fetchAudit = async () => {
    if (!namespace) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/seo/audit?namespace=${encodeURIComponent(namespace)}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || `Error HTTP ${res.status}`);
      }
      setData(json);
    } catch (err: any) {
      setError(err.message || "Error al cargar la auditoría");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAudit();
  }, [namespace]);

  // Paginación y Ordenamiento
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortField, setSortField] = useState<"inlinks" | "outlinks" | "words" | "title" | "url">("inlinks");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Reset de página cuando cambian filtros o búsqueda
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeFilter, pageSize, selectedCannibalizationEntity]);

  // Filtrado de páginas
  const pages: any[] = data?.pages || [];
  const metrics = data?.metrics || {
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
  };

  const filteredPages = pages.filter((page) => {
    // Filtro específico por entidad canibalizada seleccionada
    if (selectedCannibalizationEntity) {
      const entName = (page.main_entity?.name || "").toLowerCase();
      if (entName !== selectedCannibalizationEntity.toLowerCase()) {
        return false;
      }
    }

    const matchesSearch =
      page.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (page.title && page.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (page.slug && page.slug.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (page.main_entity && page.main_entity.name.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (activeFilter === "orphan") return page.is_orphan;
    if (activeFilter === "cannibalized") return page.is_cannibalized;
    if (activeFilter === "thin") return page.is_thin;
    if (activeFilter === "missing_meta") return page.is_missing_meta;
    if (activeFilter === "missing_title") return page.is_missing_title || page.is_missing_h1;

    return true;
  });

  // Ordenamiento
  const sortedPages = [...filteredPages].sort((a, b) => {
    let aVal: any = 0;
    let bVal: any = 0;
    if (sortField === "inlinks") {
      aVal = a.inlinks_count || 0;
      bVal = b.inlinks_count || 0;
    } else if (sortField === "outlinks") {
      aVal = a.outlinks_count || 0;
      bVal = b.outlinks_count || 0;
    } else if (sortField === "words") {
      aVal = a.word_count || 0;
      bVal = b.word_count || 0;
    } else if (sortField === "title") {
      aVal = (a.title || "").toLowerCase();
      bVal = (b.title || "").toLowerCase();
    } else if (sortField === "url") {
      aVal = a.url.toLowerCase();
      bVal = b.url.toLowerCase();
    }

    if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
    if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const totalPagesCount = Math.max(1, Math.ceil(sortedPages.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, sortedPages.length);
  const paginatedPages = sortedPages.slice(startIndex, endIndex);

  const handleSort = (field: "inlinks" | "outlinks" | "words" | "title" | "url") => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder(field === "inlinks" || field === "words" || field === "outlinks" ? "desc" : "asc");
    }
  };

  // Copiar al portapapeles
  const handleCopy = (text: string, type: "markdown" | "schema") => {
    navigator.clipboard.writeText(text);
    if (type === "markdown") {
      setCopiedMarkdown(true);
      setTimeout(() => setCopiedMarkdown(false), 2000);
    } else {
      setCopiedSchema(true);
      setTimeout(() => setCopiedSchema(false), 2000);
    }
  };

  // Descargar archivo .md individual
  const downloadMarkdownFile = (page: any) => {
    const blob = new Blob([page.markdown_content || ""], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${page.slug || "pagina"}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Exportar auditoría a CSV
  const exportCsv = () => {
    if (!pages || pages.length === 0) return;
    const headers = [
      "URL",
      "Slug",
      "Title",
      "H1",
      "Meta Description",
      "Palabras",
      "Inlinks",
      "Outlinks",
      "Huérfana",
      "Canibalizada",
      "Entidad Principal",
      "Schema Type",
      "Google KG ID",
    ];

    const rows = pages.map((p) => [
      `"${p.url.replace(/"/g, '""')}"`,
      `"${p.slug.replace(/"/g, '""')}"`,
      `"${(p.title || "").replace(/"/g, '""')}"`,
      `"${(p.h1 || "").replace(/"/g, '""')}"`,
      `"${(p.meta_description || "").replace(/"/g, '""')}"`,
      p.word_count || 0,
      p.inlinks_count || 0,
      p.outlinks_count || 0,
      p.is_orphan ? "Sí" : "No",
      p.is_cannibalized ? "Sí" : "No",
      `"${(p.main_entity?.name || "").replace(/"/g, '""')}"`,
      `"${(p.main_entity?.schema_type || "").replace(/"/g, '""')}"`,
      `"${(p.main_entity?.kg_mid || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `auditoria_seo_${namespace}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Barra de cabecera de la auditoría */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToChat}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Volver a la vista de chat RAG"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">Auditoría SEO & Arquitectura Web</h2>
              <span className="text-xs px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">
                Screaming Frog Style
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500">
              Inventario de URLs, Wikilinks, Entidades y Marcado Schema.org en <strong className="text-slate-800">{namespace}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {metrics.totalPages === 0 && (
            <button
              onClick={handleSyncFromPinecone}
              disabled={isSyncingPinecone}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingPinecone ? "animate-spin" : ""}`} />
              <span>{isSyncingPinecone ? "Migrando..." : "Poblar desde Pinecone"}</span>
            </button>
          )}
          <button
            onClick={fetchAudit}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Actualizar</span>
          </button>
          <button
            onClick={exportCsv}
            disabled={pages.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* Tarjetas de Métricas (KPIs de Salud SEO) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs space-y-1">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Páginas</div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900">{metrics.totalPages}</div>
          <div className="text-[11px] text-slate-400">~{metrics.avgWordCount} palabras/pág</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs space-y-1">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Enlaces Internos</div>
          <div className="text-xl sm:text-2xl font-bold text-blue-600">{metrics.totalInlinks}</div>
          <div className="text-[11px] text-slate-400">Contextuales editoriales</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs space-y-1">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Entidades KG</div>
          <div className="text-xl sm:text-2xl font-bold text-indigo-600">{metrics.totalEntities}</div>
          <div className="text-[11px] text-slate-400">Google & Wikidata</div>
        </div>

        <div
          onClick={() => setActiveFilter(activeFilter === "orphan" ? "all" : "orphan")}
          className={`border rounded-xl p-3.5 shadow-2xs space-y-1 cursor-pointer transition-all ${
            metrics.orphanPagesCount > 0
              ? activeFilter === "orphan"
                ? "bg-amber-100/70 border-amber-400 ring-2 ring-amber-400"
                : "bg-amber-50/60 border-amber-200 hover:bg-amber-50"
              : "bg-white border-slate-200"
          }`}
        >
          <div className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider flex items-center justify-between">
            <span>Páginas Huérfanas</span>
            {metrics.orphanPagesCount > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>}
          </div>
          <div className="text-xl sm:text-2xl font-bold text-amber-900">{metrics.orphanPagesCount}</div>
          <div className="text-[11px] text-amber-700/80">0 enlaces entrantes</div>
        </div>

        <div
          onClick={() => setActiveFilter(activeFilter === "cannibalized" ? "all" : "cannibalized")}
          className={`border rounded-xl p-3.5 shadow-2xs space-y-1 cursor-pointer transition-all ${
            metrics.cannibalizationCount > 0
              ? activeFilter === "cannibalized"
                ? "bg-rose-100/70 border-rose-400 ring-2 ring-rose-400"
                : "bg-rose-50/60 border-rose-200 hover:bg-rose-50"
              : "bg-white border-slate-200"
          }`}
        >
          <div className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider flex items-center justify-between">
            <span>Canibalizaciones</span>
            {metrics.cannibalizationCount > 0 && <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>}
          </div>
          <div className="text-xl sm:text-2xl font-bold text-rose-900">{metrics.cannibalizationCount}</div>
          <div className="text-[11px] text-rose-700/80">URLs con mismo tema</div>
        </div>

        <div
          onClick={() => setActiveFilter(activeFilter === "thin" ? "all" : "thin")}
          className={`border rounded-xl p-3.5 shadow-2xs space-y-1 cursor-pointer transition-all ${
            activeFilter === "thin" ? "bg-slate-100 border-slate-400 ring-2 ring-slate-400" : "bg-white border-slate-200 hover:bg-slate-50"
          }`}
        >
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Thin Content</div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900">{metrics.thinContentCount}</div>
          <div className="text-[11px] text-slate-400">&lt; 300 palabras</div>
        </div>
      </div>

      {/* Alerta de Canibalización Elegante y Compacta */}
      {data?.cannibalizations && data.cannibalizations.length > 0 && (
        <div className="bg-white border border-rose-200/90 rounded-2xl p-4 shadow-2xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                    Canibalizaciones Semánticas Detectadas
                  </h4>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold">
                    {data.cannibalizations.length} temas en conflicto
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  URLs distintas que compiten por posicionar la misma entidad temática. Haz clic en un tema para filtrar la tabla.
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsCannibalizationExpanded(!isCannibalizationExpanded)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors cursor-pointer self-start sm:self-auto shrink-0"
            >
              <span>{isCannibalizationExpanded ? "Ocultar detalles" : `Ver los ${data.cannibalizations.length} temas`}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isCannibalizationExpanded ? "rotate-180" : ""}`} />
            </button>
          </div>

          {/* Chips de Temas Rápidos */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Temas en conflicto:</span>
            {data.cannibalizations.slice(0, isCannibalizationExpanded ? undefined : 6).map((c: any) => {
              const isSelected = selectedCannibalizationEntity === c.entityName;
              return (
                <button
                  key={c.entityName}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedCannibalizationEntity(null);
                    } else {
                      setSelectedCannibalizationEntity(c.entityName);
                      setActiveFilter("all");
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    isSelected
                      ? "bg-rose-600 text-white shadow-2xs"
                      : "bg-rose-50/70 hover:bg-rose-100 text-rose-900 border border-rose-200/60"
                  }`}
                  title={`Filtrar tabla por ${c.urls.length} URLs de "${c.entityName}"`}
                >
                  <span>{c.entityName}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? "bg-rose-700 text-white" : "bg-rose-200/80 text-rose-800"}`}>
                    {c.urls.length}
                  </span>
                </button>
              );
            })}
            {!isCannibalizationExpanded && data.cannibalizations.length > 6 && (
              <button
                onClick={() => setIsCannibalizationExpanded(true)}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold px-1 py-0.5 cursor-pointer"
              >
                +{data.cannibalizations.length - 6} más...
              </button>
            )}
          </div>

          {/* Vista Expandida en Tarjetas Limpias */}
          {isCannibalizationExpanded && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-2 border-t border-slate-100 max-h-72 overflow-y-auto">
              {data.cannibalizations.map((c: any) => {
                const isSelected = selectedCannibalizationEntity === c.entityName;
                return (
                  <div
                    key={c.entityName}
                    className={`rounded-xl p-3 border transition-all ${
                      isSelected
                        ? "bg-rose-50/90 border-rose-400 ring-2 ring-rose-400/40"
                        : "bg-slate-50/60 border-slate-200/80 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span className="font-bold text-xs text-slate-900 truncate" title={c.entityName}>
                        {c.entityName}
                      </span>
                      <button
                        onClick={() => setSelectedCannibalizationEntity(isSelected ? null : c.entityName)}
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded cursor-pointer ${
                          isSelected ? "bg-rose-600 text-white" : "bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50"
                        }`}
                      >
                        {isSelected ? "Quitar filtro" : `Filtrar (${c.urls.length})`}
                      </button>
                    </div>
                    <ul className="space-y-1 text-[11px] text-slate-500">
                      {c.urls.slice(0, 3).map((u: string) => (
                        <li key={u} className="truncate flex items-center gap-1 hover:text-blue-600">
                          <span className="w-1 h-1 rounded-full bg-slate-400 shrink-0"></span>
                          <a href={u} target="_blank" rel="noopener noreferrer" className="truncate">
                            {u.replace(/^https?:\/\/(www\.)?/, "")}
                          </a>
                        </li>
                      ))}
                      {c.urls.length > 3 && (
                        <li className="text-[10px] text-slate-400 italic">
                          +{c.urls.length - 3} URLs adicionales...
                        </li>
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Indicador de filtro de canibalización activo */}
      {selectedCannibalizationEntity && (
        <div className="flex items-center justify-between gap-2 px-3.5 py-2 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900">
          <div className="flex items-center gap-2">
            <span className="font-bold">Filtrando URLs por canibalización:</span>
            <span className="px-2 py-0.5 rounded bg-rose-200/80 font-mono font-bold text-rose-950">
              {selectedCannibalizationEntity}
            </span>
            <span className="text-rose-700">({filteredPages.length} URLs encontradas)</span>
          </div>
          <button
            onClick={() => setSelectedCannibalizationEntity(null)}
            className="inline-flex items-center gap-1 font-semibold text-rose-700 hover:text-rose-900 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Quitar filtro</span>
          </button>
        </div>
      )}

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setActiveFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              activeFilter === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
            }`}
          >
            Todas ({pages.length})
          </button>
          <button
            onClick={() => setActiveFilter("orphan")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeFilter === "orphan"
                ? "bg-amber-600 text-white"
                : "bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200/60"
            }`}
          >
            <span>⚠️ Huérfanas ({metrics.orphanPagesCount})</span>
          </button>
          <button
            onClick={() => setActiveFilter("cannibalized")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeFilter === "cannibalized"
                ? "bg-rose-600 text-white"
                : "bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200/60"
            }`}
          >
            <span>🚨 Canibalizaciones ({metrics.cannibalizationCount})</span>
          </button>
          <button
            onClick={() => setActiveFilter("thin")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              activeFilter === "thin" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
            }`}
          >
            Poco contenido ({metrics.thinContentCount})
          </button>
          <button
            onClick={() => setActiveFilter("missing_title")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              activeFilter === "missing_title"
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
            }`}
          >
            Falta Title/H1 ({metrics.missingTitleCount + metrics.missingH1Count})
          </button>
        </div>

        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por URL, título o entidad..."
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Tabla Maestra de URLs (Screaming Frog Style) */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
            <p className="text-sm font-semibold text-slate-700">Analizando arquitectura y grafo de conocimiento...</p>
          </div>
        ) : error ? (
          <div className="py-12 px-4 text-center space-y-2">
            <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
            <p className="text-sm font-bold text-slate-800">No se pudo cargar la auditoría</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">{error}</p>
          </div>
        ) : metrics.totalPages === 0 ? (
          <div className="py-16 px-4 text-center space-y-4 max-w-lg mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center mx-auto shadow-2xs">
              <Layers className="w-7 h-7" />
            </div>
            <div>
              <h4 className="text-base sm:text-lg font-bold text-slate-900">
                Este cliente aún no tiene páginas en Supabase
              </h4>
              <p className="text-xs sm:text-sm text-slate-500 mt-1.5 leading-relaxed">
                Tus vectores de este cliente ya están en Pinecone. Puedes poblarlos directamente en Supabase con 1 solo clic sin tener que volver a rastrear el sitio web.
              </p>
            </div>
            <div className="pt-2">
              <button
                onClick={handleSyncFromPinecone}
                disabled={isSyncingPinecone}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncingPinecone ? "animate-spin" : ""}`} />
                <span>{isSyncingPinecone ? "Migrando datos..." : "📥 Poblar Supabase desde Pinecone"}</span>
              </button>
            </div>
          </div>
        ) : filteredPages.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <FileText className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">No se encontraron páginas con los filtros actuales</p>
            <p className="text-xs text-slate-400">Prueba cambiando de filtro o busca otro término.</p>
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider select-none">
                    <th
                      onClick={() => handleSort("url")}
                      className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        <span>Página & Slug</span>
                        {sortField === "url" ? (
                          sortOrder === "asc" ? <ChevronUp className="w-3 h-3 text-indigo-600" /> : <ChevronDown className="w-3 h-3 text-indigo-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("title")}
                      className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        <span>Title & H1</span>
                        {sortField === "title" ? (
                          sortOrder === "asc" ? <ChevronUp className="w-3 h-3 text-indigo-600" /> : <ChevronDown className="w-3 h-3 text-indigo-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("inlinks")}
                      className="py-3 px-3 text-center cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Inlinks</span>
                        {sortField === "inlinks" ? (
                          sortOrder === "asc" ? <ChevronUp className="w-3 h-3 text-indigo-600" /> : <ChevronDown className="w-3 h-3 text-indigo-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("outlinks")}
                      className="py-3 px-3 text-center cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Outlinks</span>
                        {sortField === "outlinks" ? (
                          sortOrder === "asc" ? <ChevronUp className="w-3 h-3 text-indigo-600" /> : <ChevronDown className="w-3 h-3 text-indigo-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("words")}
                      className="py-3 px-3 text-center cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Palabras</span>
                        {sortField === "words" ? (
                          sortOrder === "asc" ? <ChevronUp className="w-3 h-3 text-indigo-600" /> : <ChevronDown className="w-3 h-3 text-indigo-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                        )}
                      </div>
                    </th>
                    <th className="py-3 px-4">Entidad Principal</th>
                    <th className="py-3 px-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedPages.map((page) => (
                    <tr key={page.id} className="hover:bg-slate-50/80 transition-colors group">
                      {/* URL & Slug */}
                      <td className="py-3 px-4 max-w-xs">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-[11px] text-indigo-700 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200/50">
                            {page.slug}
                          </span>
                          {page.is_orphan && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-bold" title="Página huérfana: 0 enlaces internos apuntan a ella">
                              Huérfana
                            </span>
                          )}
                          {page.is_cannibalized && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 font-bold" title="Canibalización: comparte entidad con otra página">
                              Canibalizada
                            </span>
                          )}
                        </div>
                        <a
                          href={page.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-500 hover:text-blue-600 hover:underline flex items-center gap-1 text-[11px] mt-0.5 truncate"
                          title={page.url}
                        >
                          <span className="truncate">{page.url}</span>
                          <ExternalLink className="w-3 h-3 shrink-0 opacity-50" />
                        </a>
                      </td>

                      {/* Title & H1 */}
                      <td className="py-3 px-4 max-w-sm">
                        <div className="font-semibold text-slate-800 truncate" title={page.title}>
                          {page.title || <span className="text-rose-500 italic">Sin etiqueta Title</span>}
                        </div>
                        <div className="text-slate-500 text-[11px] truncate flex items-center gap-1" title={page.h1}>
                          <span className="font-mono text-[10px] text-slate-400">H1:</span>
                          <span>{page.h1 || <span className="text-amber-500 italic">Sin H1</span>}</span>
                        </div>
                      </td>

                      {/* Inlinks */}
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-block font-mono font-bold px-2 py-0.5 rounded text-xs ${
                            page.inlinks_count === 0
                              ? "bg-amber-100 text-amber-900"
                              : "bg-blue-50 text-blue-800 border border-blue-200/60"
                          }`}
                          title={`${page.inlinks_count} enlaces internos entrantes hacia esta URL`}
                        >
                          {page.inlinks_count}
                        </span>
                      </td>

                      {/* Outlinks */}
                      <td className="py-3 px-3 text-center font-mono text-slate-600 text-xs">{page.outlinks_count}</td>

                      {/* Palabras */}
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`font-mono text-xs ${
                            page.is_thin ? "text-amber-700 font-bold" : "text-slate-600"
                          }`}
                        >
                          {page.word_count || 0}
                        </span>
                      </td>

                      {/* Entidad Principal */}
                      <td className="py-3 px-4 max-w-xs">
                        {page.main_entity ? (
                          <div className="space-y-0.5">
                            <div className="font-semibold text-slate-900 flex items-center gap-1">
                              <span className="truncate text-xs">{page.main_entity.name}</span>
                              {page.main_entity.kg_mid && (
                                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1 rounded font-mono font-bold shrink-0" title="Reconciliada con Google Knowledge Graph">
                                  Google KG
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              {page.main_entity.schema_type}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">No clasificada</span>
                        )}
                      </td>

                      {/* Acción: Inspeccionar */}
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedPage(page)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs transition-colors cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Inspeccionar</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Barra de Paginación Organizada */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-slate-50/80 border-t border-slate-200 text-xs text-slate-600">
              <div className="flex items-center gap-4">
                <span>
                  Mostrando <strong className="text-slate-900">{startIndex + 1}</strong> a{" "}
                  <strong className="text-slate-900">{endIndex}</strong> de{" "}
                  <strong className="text-slate-900">{sortedPages.length}</strong> páginas
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">Por página:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Primera página"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Anterior</span>
                </button>

                <div className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800">
                  Página {currentPage} de {totalPagesCount}
                </div>

                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPagesCount, p + 1))}
                  disabled={currentPage === totalPagesCount}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  <span className="hidden sm:inline">Siguiente</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setCurrentPage(totalPagesCount)}
                  disabled={currentPage === totalPagesCount}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Última página"
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Drawer / Modal de Inspección de Página */}
      {selectedPage && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white rounded-2xl border border-slate-300 w-full max-w-4xl p-5 sm:p-6 shadow-2xl relative max-h-[92vh] flex flex-col">
            {/* Header del Modal */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-200">
              <div className="space-y-1 max-w-[85%]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold">
                    slug: {selectedPage.slug}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                    Idioma: {selectedPage.language || "es"}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                    {selectedPage.word_count} palabras
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate" title={selectedPage.title}>
                  {selectedPage.title || "Sin Título"}
                </h3>
                <a
                  href={selectedPage.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1 truncate"
                >
                  <span className="truncate">{selectedPage.url}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              </div>
              <button
                onClick={() => setSelectedPage(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Pestañas de Inspección */}
            <div className="flex items-center gap-2 border-b border-slate-200 pt-3">
              <button
                onClick={() => setActiveDetailTab("markdown")}
                className={`pb-2.5 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeDetailTab === "markdown"
                    ? "border-indigo-600 text-indigo-600 font-bold"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Markdown &amp; Wikilinks</span>
              </button>
              <button
                onClick={() => setActiveDetailTab("schema")}
                className={`pb-2.5 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeDetailTab === "schema"
                    ? "border-indigo-600 text-indigo-600 font-bold"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <Code className="w-4 h-4" />
                <span>Schema.org JSON-LD</span>
              </button>
              <button
                onClick={() => setActiveDetailTab("links")}
                className={`pb-2.5 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeDetailTab === "links"
                    ? "border-indigo-600 text-indigo-600 font-bold"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <LinkIcon className="w-4 h-4" />
                <span>Enlaces Internos ({selectedPage.inlinks_count})</span>
              </button>
            </div>

            {/* Contenido de la pestaña */}
            <div className="flex-1 overflow-y-auto py-4">
              {activeDetailTab === "markdown" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      Incluye Frontmatter YAML y enlaces transformados a Wikilinks [[slug|anchor]].
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCopy(selectedPage.markdown_content || "", "markdown")}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        {copiedMarkdown ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedMarkdown ? "Copiado" : "Copiar"}</span>
                      </button>
                      <button
                        onClick={() => downloadMarkdownFile(selectedPage)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Descargar .md</span>
                      </button>
                    </div>
                  </div>
                  <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-96 select-all">
                    {selectedPage.markdown_content || "# Sin contenido disponible"}
                  </pre>
                </div>
              )}

              {activeDetailTab === "schema" && (
                <div className="space-y-4">
                  {/* Botones de Prueba Oficial de Google */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-slate-600">
                      Valida el marcado Schema directamente en los servidores oficiales de Google y Schema.org:
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={`https://search.google.com/test/rich-results?url=${encodeURIComponent(selectedPage.url)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                      >
                        <span>Google Rich Results</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <a
                        href={`https://validator.schema.org/#url=${encodeURIComponent(selectedPage.url)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
                      >
                        <span>Schema Validator</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>

                  {/* Schema Existente vs Generado */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700">Schema detectado en vivo (Original):</span>
                      </div>
                      <pre className="bg-slate-50 border border-slate-200 text-slate-800 p-3 rounded-xl text-[11px] font-mono overflow-x-auto max-h-72 whitespace-pre-wrap">
                        {selectedPage.existing_schema
                          ? JSON.stringify(selectedPage.existing_schema, null, 2)
                          : "No se detectó marcado Schema.org en el HTML en vivo."}
                      </pre>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-700 flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Schema Generado por Scrapio:</span>
                        </span>
                        <button
                          onClick={() =>
                            handleCopy(
                              JSON.stringify(
                                {
                                  "@context": "https://schema.org",
                                  "@type": selectedPage.main_entity?.schema_type || "WebPage",
                                  name: selectedPage.main_entity?.name || selectedPage.title,
                                  url: selectedPage.url,
                                  ...(selectedPage.main_entity?.kg_mid
                                    ? {
                                        sameAs: [
                                          `https://www.google.com/search?kgmid=${selectedPage.main_entity.kg_mid}`,
                                          selectedPage.main_entity.wikidata_url,
                                        ].filter(Boolean),
                                      }
                                    : {}),
                                },
                                null,
                                2
                              ),
                              "schema"
                            )
                          }
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                        >
                          {copiedSchema ? "¡Copiado!" : "Copiar JSON-LD"}
                        </button>
                      </div>
                      <pre className="bg-slate-900 text-emerald-400 p-3 rounded-xl text-[11px] font-mono overflow-x-auto max-h-72 whitespace-pre-wrap">
                        {JSON.stringify(
                          {
                            "@context": "https://schema.org",
                            "@type": selectedPage.main_entity?.schema_type || "WebPage",
                            name: selectedPage.main_entity?.name || selectedPage.title,
                            url: selectedPage.url,
                            ...(selectedPage.main_entity?.kg_mid
                              ? {
                                  sameAs: [
                                    `https://www.google.com/search?kgmid=${selectedPage.main_entity.kg_mid}`,
                                    selectedPage.main_entity.wikidata_url,
                                  ].filter(Boolean),
                                }
                              : {}),
                          },
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  </div>
                </div>
              )}

              {activeDetailTab === "links" && (
                <div className="space-y-3">
                  <div className="text-xs text-slate-500">
                    Textos ancla (*Anchor Texts*) con los que otras páginas del sitio enlazan hacia esta URL:
                  </div>
                  {selectedPage.inlink_anchors && selectedPage.inlink_anchors.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedPage.inlink_anchors.map((anchor: string, idx: number) => (
                        <span
                          key={idx}
                          className="bg-blue-50 text-blue-800 border border-blue-200 text-xs px-2.5 py-1 rounded-lg font-medium"
                        >
                          &ldquo;{anchor}&rdquo;
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
                      Esta página es huérfana o no recibe ningún enlace interno editorial de las demás URLs indexadas.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
