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

  // Vistas Principales: Páginas, Canibalizaciones y Entidades
  const [activeView, setActiveView] = useState<"pages" | "cannibalization" | "entities">("pages");

  // 1. Estados de Páginas (Filtros y Paginación)
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<
    "all" | "orphan" | "cannibalized" | "thin" | "missing_meta" | "missing_title"
  >("all");
  const [isCannibalizationExpanded, setIsCannibalizationExpanded] = useState(false);
  const [selectedCannibalizationEntity, setSelectedCannibalizationEntity] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortField, setSortField] = useState<"inlinks" | "outlinks" | "words" | "title" | "url">("inlinks");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // 2. Estados de Canibalizaciones (Filtros, Paginación y Orden)
  const [cannibalizationSearchQuery, setCannibalizationSearchQuery] = useState("");
  const [cannibalizationFilter, setCannibalizationFilter] = useState<"all" | "severe" | "intent" | "critical">("all");
  const [cannibalizationPage, setCannibalizationPage] = useState(1);
  const [cannibalizationPageSize, setCannibalizationPageSize] = useState(5);
  const [cannibalizationSortField, setCannibalizationSortField] = useState<"urls" | "topic" | "inlinks">("urls");
  const [cannibalizationSortOrder, setCannibalizationSortOrder] = useState<"asc" | "desc">("desc");
  const [expandedCannibalizationTopics, setExpandedCannibalizationTopics] = useState<Record<string, boolean>>({});

  const toggleCannibalizationTopic = (topic: string) => {
    setExpandedCannibalizationTopics((prev) => ({
      ...prev,
      [topic]: !prev[topic],
    }));
  };

  // 3. Estados de Entidades (Filtros y Paginación)
  const [entitySearchQuery, setEntitySearchQuery] = useState("");
  const [entityFilter, setEntityFilter] = useState<"all" | "google_kg" | "wikidata" | "multi_page" | "single_page">("all");
  const [entityPage, setEntityPage] = useState(1);
  const [entityPageSize, setEntityPageSize] = useState(10);
  const [entitySortField, setEntitySortField] = useState<"pages" | "name" | "type">("pages");
  const [entitySortOrder, setEntitySortOrder] = useState<"asc" | "desc">("desc");

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

  // Reset de páginas al cambiar filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeFilter, pageSize, selectedCannibalizationEntity]);

  useEffect(() => {
    setCannibalizationPage(1);
  }, [cannibalizationSearchQuery, cannibalizationFilter, cannibalizationPageSize, cannibalizationSortField, cannibalizationSortOrder]);

  useEffect(() => {
    setEntityPage(1);
  }, [entitySearchQuery, entityFilter, entityPageSize, entitySortField, entitySortOrder]);

  // Listas de datos y métricas
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

  // --- FILTRADO Y PAGINACIÓN DE PÁGINAS ---
  const filteredPages = pages.filter((page) => {
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

  const sortedPages = [...filteredPages].sort((a, b) => {
    // Si estamos filtrando por canibalizaciones y el orden es por inlinks (default),
    // agrupamos las URLs por entidad temática para que las competidoras aparezcan juntas
    if (activeFilter === "cannibalized" && sortField === "inlinks") {
      const entA = (a.main_entity?.name || "").toLowerCase();
      const entB = (b.main_entity?.name || "").toLowerCase();
      if (entA !== entB) {
        return entA.localeCompare(entB);
      }
      return (b.inlinks_count || 0) - (a.inlinks_count || 0);
    }

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

  // --- FILTRADO Y PAGINACIÓN DE CANIBALIZACIONES ---
  const rawCannibalizations: any[] = data?.cannibalizations || [];
  const filteredCannibalizations = rawCannibalizations.filter((c) => {
    const pagesInConflict = c.competingPages || [];
    const hasNearDuplicate = pagesInConflict.some((p: any) =>
      pagesInConflict.some(
        (other: any) =>
          other.url !== p.url &&
          (other.title?.toLowerCase() === p.title?.toLowerCase() ||
            other.slug?.replace(/-\d+$/, "") === p.slug?.replace(/-\d+$/, ""))
      )
    );

    if (cannibalizationFilter === "severe" && !hasNearDuplicate) return false;
    if (cannibalizationFilter === "intent" && hasNearDuplicate) return false;
    if (cannibalizationFilter === "critical" && pagesInConflict.length < 3) return false;

    if (!cannibalizationSearchQuery) return true;
    const q = cannibalizationSearchQuery.toLowerCase();
    if (c.entityName.toLowerCase().includes(q)) return true;
    return pagesInConflict.some(
      (p: any) => p.url.toLowerCase().includes(q) || (p.title && p.title.toLowerCase().includes(q))
    );
  });

  const sortedCannibalizations = [...filteredCannibalizations].sort((a, b) => {
    let aVal: any = 0;
    let bVal: any = 0;
    if (cannibalizationSortField === "urls") {
      aVal = (a.competingPages || []).length;
      bVal = (b.competingPages || []).length;
    } else if (cannibalizationSortField === "topic") {
      aVal = a.entityName.toLowerCase();
      bVal = b.entityName.toLowerCase();
    } else if (cannibalizationSortField === "inlinks") {
      aVal = a.competingPages?.[0]?.inlinks_count || 0;
      bVal = b.competingPages?.[0]?.inlinks_count || 0;
    }
    if (aVal < bVal) return cannibalizationSortOrder === "asc" ? -1 : 1;
    if (aVal > bVal) return cannibalizationSortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const totalCannibalizationPages = Math.max(1, Math.ceil(sortedCannibalizations.length / cannibalizationPageSize));
  const cbStartIndex = (cannibalizationPage - 1) * cannibalizationPageSize;
  const cbEndIndex = Math.min(cbStartIndex + cannibalizationPageSize, sortedCannibalizations.length);
  const paginatedCannibalizations = sortedCannibalizations.slice(cbStartIndex, cbEndIndex);

  // --- FILTRADO Y PAGINACIÓN DE ENTIDADES ---
  const rawEntities: any[] = data?.entities || [];
  const filteredEntities = rawEntities.filter((ent) => {
    if (entityFilter === "google_kg" && !ent.kg_mid) return false;
    if (entityFilter === "wikidata" && !ent.wikidata_url) return false;
    if (entityFilter === "multi_page" && (ent.pages_count || 1) <= 1) return false;
    if (entityFilter === "single_page" && (ent.pages_count || 1) > 1) return false;

    if (!entitySearchQuery) return true;
    const q = entitySearchQuery.toLowerCase();
    return (
      (ent.name && ent.name.toLowerCase().includes(q)) ||
      (ent.schema_type && ent.schema_type.toLowerCase().includes(q)) ||
      (ent.kg_mid && ent.kg_mid.toLowerCase().includes(q))
    );
  });

  const sortedEntities = [...filteredEntities].sort((a, b) => {
    let aVal: any = 0;
    let bVal: any = 0;
    if (entitySortField === "pages") {
      aVal = a.pages_count || 1;
      bVal = b.pages_count || 1;
    } else if (entitySortField === "name") {
      aVal = (a.name || "").toLowerCase();
      bVal = (b.name || "").toLowerCase();
    } else if (entitySortField === "type") {
      aVal = (a.schema_type || "").toLowerCase();
      bVal = (b.schema_type || "").toLowerCase();
    }
    if (aVal < bVal) return entitySortOrder === "asc" ? -1 : 1;
    if (aVal > bVal) return entitySortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const totalEntityPages = Math.max(1, Math.ceil(sortedEntities.length / entityPageSize));
  const entStartIndex = (entityPage - 1) * entityPageSize;
  const entEndIndex = Math.min(entStartIndex + entityPageSize, sortedEntities.length);
  const paginatedEntities = sortedEntities.slice(entStartIndex, entEndIndex);

  // Conteo rápido para badges de filtros
  const withKgCount = rawEntities.filter((e) => e.kg_mid).length;
  const withWdCount = rawEntities.filter((e) => e.wikidata_url).length;
  const multiPageCount = rawEntities.filter((e) => (e.pages_count || 1) > 1).length;

  const handleSort = (field: "inlinks" | "outlinks" | "words" | "title" | "url") => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder(field === "inlinks" || field === "words" || field === "outlinks" ? "desc" : "asc");
    }
  };

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

  const downloadMarkdownFile = (page: any) => {
    const blob = new Blob([page.markdown_content || ""], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${page.slug || "pagina"}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

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
        <div
          onClick={() => {
            setActiveView("pages");
            setActiveFilter("all");
          }}
          className={`border rounded-xl p-3.5 shadow-2xs space-y-1 cursor-pointer transition-all ${
            activeView === "pages" && activeFilter === "all"
              ? "bg-slate-100 border-slate-400 ring-2 ring-slate-400"
              : "bg-white border-slate-200 hover:bg-slate-50"
          }`}
        >
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Páginas</div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900">{metrics.totalPages}</div>
          <div className="text-[11px] text-slate-400">~{metrics.avgWordCount} palabras/pág</div>
        </div>

        <div
          onClick={() => {
            setActiveView("pages");
            setSortField("inlinks");
            setSortOrder("desc");
          }}
          className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs space-y-1 cursor-pointer hover:bg-slate-50 transition-colors"
        >
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Enlaces Internos</div>
          <div className="text-xl sm:text-2xl font-bold text-blue-600">{metrics.totalInlinks}</div>
          <div className="text-[11px] text-slate-400">Contextuales editoriales</div>
        </div>

        <div
          onClick={() => setActiveView("entities")}
          className={`border rounded-xl p-3.5 shadow-2xs space-y-1 cursor-pointer transition-all ${
            activeView === "entities"
              ? "bg-indigo-50 border-indigo-400 ring-2 ring-indigo-400"
              : "bg-white border-slate-200 hover:bg-indigo-50/40"
          }`}
        >
          <div className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider flex items-center justify-between">
            <span>Entidades KG</span>
            <span className="text-[10px] text-indigo-600 font-bold">Ver →</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-indigo-600">{metrics.totalEntities}</div>
          <div className="text-[11px] text-indigo-600/80">Google & Wikidata</div>
        </div>

        <div
          onClick={() => {
            setActiveView("pages");
            setActiveFilter(activeFilter === "orphan" ? "all" : "orphan");
          }}
          className={`border rounded-xl p-3.5 shadow-2xs space-y-1 cursor-pointer transition-all ${
            metrics.orphanPagesCount > 0
              ? activeFilter === "orphan" && activeView === "pages"
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
          onClick={() => setActiveView(activeView === "cannibalization" ? "pages" : "cannibalization")}
          className={`border rounded-xl p-3.5 shadow-2xs space-y-1 cursor-pointer transition-all ${
            metrics.cannibalizationCount > 0
              ? activeView === "cannibalization"
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
          <div className="text-[11px] text-rose-700/80">Ver tabla organizada →</div>
        </div>

        <div
          onClick={() => {
            setActiveView("pages");
            setActiveFilter(activeFilter === "thin" ? "all" : "thin");
          }}
          className={`border rounded-xl p-3.5 shadow-2xs space-y-1 cursor-pointer transition-all ${
            activeFilter === "thin" && activeView === "pages"
              ? "bg-slate-100 border-slate-400 ring-2 ring-slate-400"
              : "bg-white border-slate-200 hover:bg-slate-50"
          }`}
        >
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Thin Content</div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900">{metrics.thinContentCount}</div>
          <div className="text-[11px] text-slate-400">&lt; 300 palabras</div>
        </div>
      </div>

      {/* Pestañas de Vista Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200/80 w-fit">
          <button
            onClick={() => setActiveView("pages")}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeView === "pages"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-indigo-600" />
            <span>Auditoría de Páginas ({pages.length})</span>
          </button>

          <button
            onClick={() => setActiveView("cannibalization")}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeView === "cannibalization"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            <span>Tabla de Canibalizaciones ({data?.cannibalizations?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveView("entities")}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeView === "entities"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>Catálogo de Entidades ({data?.entities?.length || 0})</span>
          </button>
        </div>
      </div>

      {/* VISTA 1: AUDITORÍA DE PÁGINAS */}
      {activeView === "pages" && (
        <div className="space-y-5">
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

                <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                  <button
                    onClick={() => setActiveView("cannibalization")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-semibold border border-rose-200 transition-colors cursor-pointer"
                  >
                    <span>Ver tabla completa</span>
                  </button>
                  <button
                    onClick={() => setIsCannibalizationExpanded(!isCannibalizationExpanded)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <span>{isCannibalizationExpanded ? "Ocultar" : "Expandir temas"}</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isCannibalizationExpanded ? "rotate-180" : ""}`} />
                  </button>
                </div>
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
                            <span>Página &amp; Slug</span>
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
                            <span>Title &amp; H1</span>
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
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (page.main_entity?.name) {
                                      setSelectedCannibalizationEntity(page.main_entity.name);
                                      setActiveFilter("all");
                                    }
                                  }}
                                  className="text-[10px] px-1.5 py-0.2 rounded bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold transition-colors cursor-pointer"
                                  title={`Canibalizada: compite con ${page.cannibalized_with?.length || 1} URL(s) en "${page.main_entity?.name}". Clic para filtrar.`}
                                >
                                  Canibalizada ({page.cannibalized_with?.length || 1})
                                </button>
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
                            {page.is_cannibalized && page.cannibalized_with && page.cannibalized_with.length > 0 && (
                              <div className="text-[10px] text-rose-700 flex items-center gap-1 mt-0.5 font-medium truncate">
                                <span className="shrink-0 font-semibold">⚔️ Compite con:</span>
                                <span className="truncate font-mono text-[10px] text-rose-900 bg-rose-50 px-1 rounded border border-rose-100">
                                  {page.cannibalized_with[0]?.slug || page.cannibalized_with[0]?.url}
                                </span>
                                {page.cannibalized_with.length > 1 && (
                                  <span className="text-[10px] text-rose-500 shrink-0">+{page.cannibalized_with.length - 1} más</span>
                                )}
                              </div>
                            )}
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

                {/* Barra de Paginación Organizada (Iniciando desde 5 resultados) */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-slate-50/80 border-t border-slate-200 text-xs text-slate-600">
                  <div className="flex items-center gap-4">
                    <span>
                      Mostrando <strong className="text-slate-900">{sortedPages.length === 0 ? 0 : startIndex + 1}</strong> a{" "}
                      <strong className="text-slate-900">{endIndex}</strong> de{" "}
                      <strong className="text-slate-900">{sortedPages.length}</strong> páginas
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500 font-medium">Por página:</span>
                      <select
                        value={pageSize}
                        onChange={(e) => setPageSize(Number(e.target.value))}
                        className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                      >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
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
        </div>
      )}

      {/* VISTA 2: TABLA MAESTRA DE CANIBALIZACIONES */}
      {activeView === "cannibalization" && (
        <div className="space-y-4">
          <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-rose-950 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>Tabla Maestra de Canibalizaciones Semánticas</span>
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                Inventario unificado de conflictos temáticos en <strong className="text-slate-800">{namespace}</strong>. Haz clic en cualquier fila o en <strong>&ldquo;Comparar&rdquo;</strong> para desplegar la comparativa cara a cara de URLs.
              </p>
            </div>
            <div className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white border border-rose-200 text-rose-900 shrink-0">
              {filteredCannibalizations.length} temas en conflicto
            </div>
          </div>

          {/* Filtros y Buscador de Canibalizaciones */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => setCannibalizationFilter("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  cannibalizationFilter === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                }`}
              >
                Todos ({rawCannibalizations.length})
              </button>
              <button
                onClick={() => setCannibalizationFilter("severe")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                  cannibalizationFilter === "severe" ? "bg-rose-600 text-white" : "bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200/60"
                }`}
              >
                <span>⚠️ Duplicados severos (301)</span>
              </button>
              <button
                onClick={() => setCannibalizationFilter("intent")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                  cannibalizationFilter === "intent" ? "bg-amber-600 text-white" : "bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200/60"
                }`}
              >
                <span>Diferenciar Search Intent</span>
              </button>
              <button
                onClick={() => setCannibalizationFilter("critical")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                  cannibalizationFilter === "critical" ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-800 hover:bg-indigo-100 border border-indigo-200/60"
                }`}
              >
                <span>Críticos (≥3 URLs)</span>
              </button>
            </div>

            <div className="relative min-w-[220px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={cannibalizationSearchQuery}
                onChange={(e) => setCannibalizationSearchQuery(e.target.value)}
                placeholder="Buscar tema o URL en conflicto..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
            </div>
          </div>

          {filteredCannibalizations.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-500 bg-white border border-slate-200 rounded-2xl">
              No se encontraron canibalizaciones con los filtros actuales.
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider select-none">
                      <th
                        onClick={() => {
                          if (cannibalizationSortField === "topic") {
                            setCannibalizationSortOrder(cannibalizationSortOrder === "asc" ? "desc" : "asc");
                          } else {
                            setCannibalizationSortField("topic");
                            setCannibalizationSortOrder("asc");
                          }
                        }}
                        className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors"
                      >
                        <div className="flex items-center gap-1">
                          <span>Tópico / Entidad</span>
                          {cannibalizationSortField === "topic" ? (
                            cannibalizationSortOrder === "asc" ? <ChevronUp className="w-3 h-3 text-rose-600" /> : <ChevronDown className="w-3 h-3 text-rose-600" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                          )}
                        </div>
                      </th>

                      <th
                        onClick={() => {
                          if (cannibalizationSortField === "urls") {
                            setCannibalizationSortOrder(cannibalizationSortOrder === "asc" ? "desc" : "asc");
                          } else {
                            setCannibalizationSortField("urls");
                            setCannibalizationSortOrder("desc");
                          }
                        }}
                        className="py-3 px-3 text-center cursor-pointer hover:bg-slate-100 transition-colors"
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span>URLs</span>
                          {cannibalizationSortField === "urls" ? (
                            cannibalizationSortOrder === "asc" ? <ChevronUp className="w-3 h-3 text-rose-600" /> : <ChevronDown className="w-3 h-3 text-rose-600" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                          )}
                        </div>
                      </th>

                      <th
                        onClick={() => {
                          if (cannibalizationSortField === "inlinks") {
                            setCannibalizationSortOrder(cannibalizationSortOrder === "asc" ? "desc" : "asc");
                          } else {
                            setCannibalizationSortField("inlinks");
                            setCannibalizationSortOrder("desc");
                          }
                        }}
                        className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors"
                      >
                        <div className="flex items-center gap-1">
                          <span>URL Líder (Preferente)</span>
                          {cannibalizationSortField === "inlinks" ? (
                            cannibalizationSortOrder === "asc" ? <ChevronUp className="w-3 h-3 text-rose-600" /> : <ChevronDown className="w-3 h-3 text-rose-600" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                          )}
                        </div>
                      </th>

                      <th className="py-3 px-4">URLs Competidoras (Secundarias)</th>
                      <th className="py-3 px-4">Diagnóstico SEO</th>
                      <th className="py-3 px-4 text-right">Comparar / Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedCannibalizations.map((c: any) => {
                      const pagesInConflict = c.competingPages || [];
                      const leader = pagesInConflict[0];
                      const competitors = pagesInConflict.slice(1);
                      const isExpanded = Boolean(expandedCannibalizationTopics[c.entityName]);
                      const isNearDuplicate = pagesInConflict.some((p: any) =>
                        pagesInConflict.some(
                          (other: any) =>
                            other.url !== p.url &&
                            (other.title?.toLowerCase() === p.title?.toLowerCase() ||
                              other.slug?.replace(/-\d+$/, "") === p.slug?.replace(/-\d+$/, ""))
                        )
                      );

                      return (
                        <React.Fragment key={c.entityName}>
                          {/* Fila Maestra del Conflicto */}
                          <tr
                            onClick={() => toggleCannibalizationTopic(c.entityName)}
                            className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                              isExpanded ? "bg-rose-50/30" : ""
                            }`}
                          >
                            {/* Tópico */}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${isNearDuplicate ? "bg-rose-500" : "bg-amber-500"} shrink-0`}></span>
                                <span className="font-bold text-slate-900 text-xs">{c.entityName}</span>
                              </div>
                            </td>

                            {/* Conteo de URLs */}
                            <td className="py-3 px-3 text-center">
                              <span className="font-mono font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-xs">
                                {pagesInConflict.length}
                              </span>
                            </td>

                            {/* URL Líder */}
                            <td className="py-3 px-4 max-w-xs">
                              {leader ? (
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-mono text-[10px] text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded font-semibold border border-emerald-200/60">
                                      {leader.slug || "inicio"}
                                    </span>
                                    <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-100/60 px-1.5 py-0.2 rounded" title="Enlaces internos entrantes">
                                      {leader.inlinks_count} inlinks
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-600 truncate" title={leader.title}>
                                    {leader.title || leader.url}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-slate-400 italic text-[11px]">Sin datos</span>
                              )}
                            </td>

                            {/* URLs Competidoras */}
                            <td className="py-3 px-4 max-w-sm">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {competitors.slice(0, 2).map((comp: any) => (
                                    <span
                                      key={comp.url}
                                      className="font-mono text-[10px] text-rose-800 bg-rose-50 px-1.5 py-0.2 rounded font-medium border border-rose-200/50"
                                      title={comp.url}
                                    >
                                      {comp.slug} ({comp.inlinks_count} inlinks)
                                    </span>
                                  ))}
                                  {competitors.length > 2 && (
                                    <span className="text-[10px] font-semibold text-rose-600 bg-rose-100/60 px-1.5 py-0.2 rounded">
                                      +{competitors.length - 2} más...
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Diagnóstico SEO */}
                            <td className="py-3 px-4 whitespace-nowrap">
                              {isNearDuplicate ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                                  ⚠️ Duplicado severo (301)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                                  Diferenciar Search Intent
                                </span>
                              )}
                            </td>

                            {/* Acciones */}
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => toggleCannibalizationTopic(c.entityName)}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                                    isExpanded
                                      ? "bg-rose-600 text-white"
                                      : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                                  }`}
                                  title="Desplegar comparativa detallada cara a cara"
                                >
                                  <span>{isExpanded ? "Cerrar" : "Comparar"}</span>
                                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedCannibalizationEntity(c.entityName);
                                    setActiveFilter("all");
                                    setActiveView("pages");
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition-colors cursor-pointer"
                                  title="Filtrar estas URLs en la tabla principal de auditoría"
                                >
                                  <span>Filtrar</span>
                                  <ExternalLink className="w-3 h-3" />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Fila Expandida de Comparativa Detallada Cara a Cara */}
                          {isExpanded && (
                            <tr className="bg-slate-50/60 border-b border-rose-100">
                              <td colSpan={6} className="p-4">
                                <div className="bg-white border border-rose-200/80 rounded-xl p-3 shadow-xs space-y-3 animate-fadeIn">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-xs text-slate-900">
                                        Comparativa Cara a Cara de URLs en: <strong className="text-rose-700">{c.entityName}</strong>
                                      </span>
                                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold">
                                        {pagesInConflict.length} URLs involucradas
                                      </span>
                                    </div>
                                    <span className="text-[11px] text-slate-500">
                                      Ordenadas por autoridad interna (Inlinks)
                                    </span>
                                  </div>

                                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                                    <table className="w-full text-left border-collapse text-xs">
                                      <thead>
                                        <tr className="border-b border-slate-200 text-slate-600 font-semibold text-[10px] uppercase tracking-wider bg-slate-50">
                                          <th className="py-2 px-3">Jerarquía</th>
                                          <th className="py-2 px-3">Página &amp; Slug</th>
                                          <th className="py-2 px-3">Título SEO &amp; H1</th>
                                          <th className="py-2 px-3 text-center">Inlinks</th>
                                          <th className="py-2 px-3 text-center">Palabras</th>
                                          <th className="py-2 px-3">Recomendación SEO</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {pagesInConflict.map((p: any, idx: number) => {
                                          const isLeader = idx === 0;
                                          const isDuplicate = pagesInConflict.some(
                                            (other: any) =>
                                              other.url !== p.url &&
                                              (other.title?.toLowerCase() === p.title?.toLowerCase() ||
                                                other.slug?.replace(/-\d+$/, "") === p.slug?.replace(/-\d+$/, ""))
                                          );
                                          return (
                                            <tr key={p.url} className={isLeader ? "bg-emerald-50/20" : "hover:bg-slate-50/60"}>
                                              <td className="py-2.5 px-3 whitespace-nowrap">
                                                {isLeader ? (
                                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                                                    🏆 URL Líder
                                                  </span>
                                                ) : (
                                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-medium text-[10px] border border-rose-200/50">
                                                    ⚠️ Competidora #{idx + 1}
                                                  </span>
                                                )}
                                              </td>
                                              <td className="py-2.5 px-3 max-w-xs">
                                                <span className="font-mono text-[10px] text-indigo-700 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200/40">
                                                  {p.slug || "inicio"}
                                                </span>
                                                <a
                                                  href={p.url}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="text-slate-500 hover:text-blue-600 flex items-center gap-1 text-[11px] mt-0.5 truncate"
                                                >
                                                  <span className="truncate">{p.url}</span>
                                                  <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-50" />
                                                </a>
                                              </td>
                                              <td className="py-2.5 px-3 max-w-sm">
                                                <span className="font-semibold text-slate-800 line-clamp-1" title={p.title}>
                                                  {p.title || <span className="italic text-slate-400">Sin título</span>}
                                                </span>
                                                {p.h1 && <p className="text-[10px] text-slate-400 truncate">H1: {p.h1}</p>}
                                              </td>
                                              <td className="py-2.5 px-3 text-center">
                                                <span
                                                  className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${
                                                    isLeader ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-700"
                                                  }`}
                                                >
                                                  {p.inlinks_count}
                                                </span>
                                              </td>
                                              <td className="py-2.5 px-3 text-center font-mono text-slate-600 text-xs">
                                                {p.word_count || 0}
                                              </td>
                                              <td className="py-2.5 px-3">
                                                {isLeader ? (
                                                  <span className="text-[11px] font-semibold text-emerald-700">
                                                    Mantener como canónica preferente
                                                  </span>
                                                ) : isDuplicate ? (
                                                  <span className="inline-block text-[10px] text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded font-medium">
                                                    ⚠️ Duplicado: Redirigir con 301 a la URL líder
                                                  </span>
                                                ) : (
                                                  <span className="inline-block text-[10px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-medium">
                                                    Diferenciar Search Intent / Cambiar enfoque
                                                  </span>
                                                )}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Barra de Paginación Organizada (Iniciando desde 5 resultados) */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-slate-50/80 border-t border-slate-200 text-xs text-slate-600">
                <div className="flex items-center gap-4">
                  <span>
                    Mostrando <strong className="text-slate-900">{sortedCannibalizations.length === 0 ? 0 : cbStartIndex + 1}</strong> a{" "}
                    <strong className="text-slate-900">{cbEndIndex}</strong> de{" "}
                    <strong className="text-slate-900">{sortedCannibalizations.length}</strong> temas en conflicto
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 font-medium">Por página:</span>
                    <select
                      value={cannibalizationPageSize}
                      onChange={(e) => setCannibalizationPageSize(Number(e.target.value))}
                      className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-rose-500 cursor-pointer"
                    >
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCannibalizationPage(1)}
                    disabled={cannibalizationPage === 1}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="Primera página"
                  >
                    <ChevronsLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setCannibalizationPage((p) => Math.max(1, p - 1))}
                    disabled={cannibalizationPage === 1}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Anterior</span>
                  </button>

                  <div className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800">
                    Página {cannibalizationPage} de {totalCannibalizationPages}
                  </div>

                  <button
                    onClick={() => setCannibalizationPage((p) => Math.min(totalCannibalizationPages, p + 1))}
                    disabled={cannibalizationPage === totalCannibalizationPages}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    <span className="hidden sm:inline">Siguiente</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setCannibalizationPage(totalCannibalizationPages)}
                    disabled={cannibalizationPage === totalCannibalizationPages}
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
      )}

      {/* VISTA 3: CATÁLOGO DE ENTIDADES & KNOWLEDGE GRAPH */}
      {activeView === "entities" && (
        <div className="space-y-4">
          <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-indigo-950 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span>Catálogo de Entidades &amp; Knowledge Graph</span>
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                Entidades temáticas identificadas en el contenido de <strong className="text-slate-800">{namespace}</strong> reconciliadas con Schema.org y Google Knowledge Graph.
              </p>
            </div>
            <div className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white border border-indigo-200 text-indigo-900 shrink-0">
              {filteredEntities.length} entidades detectadas
            </div>
          </div>

          {/* Filtros y Buscador de Entidades */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => setEntityFilter("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  entityFilter === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                }`}
              >
                Todas ({rawEntities.length})
              </button>
              <button
                onClick={() => setEntityFilter("google_kg")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                  entityFilter === "google_kg" ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200/60"
                }`}
              >
                <span>🟢 Con Google KG ({withKgCount})</span>
              </button>
              <button
                onClick={() => setEntityFilter("wikidata")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                  entityFilter === "wikidata" ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200/60"
                }`}
              >
                <span>🔵 Con Wikidata ({withWdCount})</span>
              </button>
              <button
                onClick={() => setEntityFilter("multi_page")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                  entityFilter === "multi_page" ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-800 hover:bg-indigo-100 border border-indigo-200/60"
                }`}
              >
                <span>⚔️ Canibalizadas ({multiPageCount})</span>
              </button>
              <button
                onClick={() => setEntityFilter("single_page")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  entityFilter === "single_page" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                }`}
              >
                Página única ({rawEntities.length - multiPageCount})
              </button>
            </div>

            <div className="relative min-w-[220px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={entitySearchQuery}
                onChange={(e) => setEntitySearchQuery(e.target.value)}
                placeholder="Buscar entidad por nombre o tipo..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider select-none">
                    <th
                      onClick={() => {
                        if (entitySortField === "name") {
                          setEntitySortOrder(entitySortOrder === "asc" ? "desc" : "asc");
                        } else {
                          setEntitySortField("name");
                          setEntitySortOrder("asc");
                        }
                      }}
                      className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        <span>Entidad / Tópico</span>
                        {entitySortField === "name" ? (
                          entitySortOrder === "asc" ? <ChevronUp className="w-3 h-3 text-indigo-600" /> : <ChevronDown className="w-3 h-3 text-indigo-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => {
                        if (entitySortField === "type") {
                          setEntitySortOrder(entitySortOrder === "asc" ? "desc" : "asc");
                        } else {
                          setEntitySortField("type");
                          setEntitySortOrder("asc");
                        }
                      }}
                      className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        <span>Tipo Schema.org</span>
                        {entitySortField === "type" ? (
                          entitySortOrder === "asc" ? <ChevronUp className="w-3 h-3 text-indigo-600" /> : <ChevronDown className="w-3 h-3 text-indigo-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                        )}
                      </div>
                    </th>
                    <th className="py-3 px-4">Reconciliación Externa (Google KG / Wikidata)</th>
                    <th
                      onClick={() => {
                        if (entitySortField === "pages") {
                          setEntitySortOrder(entitySortOrder === "asc" ? "desc" : "asc");
                        } else {
                          setEntitySortField("pages");
                          setEntitySortOrder("desc");
                        }
                      }}
                      className="py-3 px-3 text-center cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Páginas Asociadas</span>
                        {entitySortField === "pages" ? (
                          entitySortOrder === "asc" ? <ChevronUp className="w-3 h-3 text-indigo-600" /> : <ChevronDown className="w-3 h-3 text-indigo-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                        )}
                      </div>
                    </th>
                    <th className="py-3 px-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredEntities.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        No se encontraron entidades con los filtros actuales.
                      </td>
                    </tr>
                  ) : (
                    paginatedEntities.map((ent: any) => (
                      <tr key={ent.id || ent.name} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <span className="font-bold text-slate-900 text-xs">{ent.name}</span>
                          {ent.description && <p className="text-[11px] text-slate-400 line-clamp-1">{ent.description}</p>}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold border border-slate-200">
                            {ent.schema_type || "Thing"}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            {ent.kg_mid ? (
                              <a
                                href={`https://www.google.com/search?kgmid=${ent.kg_mid}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors"
                                title={`Ver en Google Knowledge Graph: ${ent.kg_mid}`}
                              >
                                <span>Google KG: {ent.kg_mid}</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            ) : ent.wikidata_url ? (
                              <a
                                href={ent.wikidata_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors"
                              >
                                <span>Wikidata</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">Identificada en contenido</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200/50">
                            {ent.pages_count || 1}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => {
                              setSelectedCannibalizationEntity(ent.name);
                              setActiveFilter("all");
                              setActiveView("pages");
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs transition-colors cursor-pointer"
                          >
                            <span>Ver páginas ({ent.pages_count || 1})</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Barra de Paginación de Entidades (Iniciando desde 5 resultados) */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-slate-50/80 border-t border-slate-200 text-xs text-slate-600">
              <div className="flex items-center gap-4">
                <span>
                  Mostrando <strong className="text-slate-900">{sortedEntities.length === 0 ? 0 : entStartIndex + 1}</strong> a{" "}
                  <strong className="text-slate-900">{entEndIndex}</strong> de{" "}
                  <strong className="text-slate-900">{sortedEntities.length}</strong> entidades
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-medium">Por página:</span>
                  <select
                    value={entityPageSize}
                    onChange={(e) => setEntityPageSize(Number(e.target.value))}
                    className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setEntityPage(1)}
                  disabled={entityPage === 1}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Primera página"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setEntityPage((p) => Math.max(1, p - 1))}
                  disabled={entityPage === 1}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Anterior</span>
                </button>

                <div className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800">
                  Página {entityPage} de {totalEntityPages}
                </div>

                <button
                  onClick={() => setEntityPage((p) => Math.min(totalEntityPages, p + 1))}
                  disabled={entityPage === totalEntityPages}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  <span className="hidden sm:inline">Siguiente</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setEntityPage(totalEntityPages)}
                  disabled={entityPage === totalEntityPages}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Última página"
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

            {/* Alerta Directa de Canibalización para esta Página */}
            {selectedPage.is_cannibalized && selectedPage.cannibalized_with && selectedPage.cannibalized_with.length > 0 && (
              <div className="mt-3 bg-rose-50 border border-rose-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span className="text-xs font-bold text-rose-950">
                      Canibalización Semántica en &ldquo;{selectedPage.main_entity?.name}&rdquo;
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-rose-800 bg-rose-100 px-2 py-0.5 rounded-full">
                    Compite con {selectedPage.cannibalized_with.length} {selectedPage.cannibalized_with.length === 1 ? "URL" : "URLs"}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600">
                  Esta página compite directamente en Google por la misma entidad temática contra las siguientes URLs del sitio:
                </p>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {selectedPage.cannibalized_with.map((comp: any) => (
                    <div
                      key={comp.url}
                      className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-rose-100 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 rounded">
                            {comp.slug}
                          </span>
                          <span className="font-semibold text-slate-800 truncate" title={comp.title}>
                            {comp.title || comp.url}
                          </span>
                        </div>
                        <a
                          href={comp.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-slate-400 hover:text-blue-600 flex items-center gap-1 truncate mt-0.5"
                        >
                          <span className="truncate">{comp.url}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200" title="Enlaces internos entrantes">
                          {comp.inlinks_count} inlinks
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {comp.word_count} palabras
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
