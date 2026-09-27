"use client";

import { useState, useEffect } from "react";
import { Send, Bot, User, Globe, ExternalLink, Sparkles, Database, ShieldCheck, PlusCircle, RefreshCw, X, Loader2, CheckCircle2, Cpu, Info, AlertTriangle, AlertCircle, Trash2, Code2, Copy, Check } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: string[];
}

interface NamespaceInfo {
  name: string;
  vectorCount: number;
}

interface IngestStatus {
  isAvailable: boolean;
  status: "queued" | "in_progress" | "completed" | "idle" | "unknown";
  conclusion?: "success" | "failure" | null;
  progressPercent: number;
  currentStepName: string;
  htmlUrl?: string;
  updatedAt?: string;
}

export default function Home() {
  const [namespace, setNamespace] = useState("cliente-avafin");
  const [aiProvider, setAiProvider] = useState("gemini");
  const [availableNamespaces, setAvailableNamespaces] = useState<NamespaceInfo[]>([]);
  const [isManualInput, setIsManualInput] = useState(false);
  const [inputQuery, setInputQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "¡Hola, Wilman! Soy Scrapio RAG. Puedes elegir qué modelo usar (Gemini u OpenAI), seleccionar un sitio escaneado, actualizar sus datos o agregar un nuevo cliente.",
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingNamespaces, setIsLoadingNamespaces] = useState(false);

  // Estado para alertas del sistema (/api/health)
  const [systemIssues, setSystemIssues] = useState<string[]>([]);
  const [activeAlert, setActiveAlert] = useState<{ type: "error" | "warning" | "info"; title: string; message: string } | null>(null);

  // Estado para el modal y la barra de progreso de Ingesta / Escaneo
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [scanUrl, setScanUrl] = useState("");
  const [scanNamespace, setScanNamespace] = useState("");
  const [scanMaxPages, setScanMaxPages] = useState("100");
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [ingestStatus, setIngestStatus] = useState<IngestStatus | null>(null);
  const [isPollingStatus, setIsPollingStatus] = useState(false);

  // Estado para el modal de Conectar con LLMs
  const [isDocsModalOpen, setIsDocsModalOpen] = useState(false);
  const [activeDocTab, setActiveDocTab] = useState<"chatgpt" | "claude" | "python" | "n8n">("chatgpt");
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  const checkSystemHealth = async () => {
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      if (data.issues && data.issues.length > 0) {
        setSystemIssues(data.issues);
      } else {
        setSystemIssues([]);
      }
    } catch (err) {
      console.error("Error al consultar salud del sistema:", err);
    }
  };

  const fetchNamespaces = async () => {
    setIsLoadingNamespaces(true);
    try {
      const res = await fetch("/api/namespaces?t=" + Date.now());
      const data = await res.json();
      if (res.ok && Array.isArray(data.namespaces)) {
        setAvailableNamespaces(data.namespaces);
        if (data.namespaces.length > 0 && (!namespace || namespace === "cliente-avafin")) {
          setNamespace(data.namespaces[0].name);
        }
      }
    } catch (err) {
      console.error("Error cargando namespaces desde Pinecone:", err);
    } finally {
      setIsLoadingNamespaces(false);
    }
  };

  const checkIngestStatus = async () => {
    try {
      const res = await fetch("/api/ingest/status?t=" + Date.now());
      if (res.ok) {
        const data: IngestStatus = await res.json();
        if (data.isAvailable) {
          setIngestStatus(data);
          if (data.status === "completed") {
            setIsPollingStatus(false);
            fetchNamespaces();
          } else if (data.status === "in_progress" || data.status === "queued") {
            setIsPollingStatus(true);
          }
        }
      }
    } catch (err) {
      console.error("Error consultando estado de ingesta:", err);
    }
  };

  useEffect(() => {
    checkSystemHealth();
    fetchNamespaces();
    checkIngestStatus();
  }, []);

  useEffect(() => {
    if (!isPollingStatus) return;
    const interval = setInterval(checkIngestStatus, 4000);
    return () => clearInterval(interval);
  }, [isPollingStatus]);

  const inferUrlFromNamespace = (nsName: string) => {
    if (!nsName) return "";
    const clean = nsName.toLowerCase().replace(/^cliente-/, "");
    if (clean.includes("avafin")) {
      return "https://www.avafin.mx";
    }
    return `https://www.${clean}.com`;
  };

  const handleDeleteNamespace = async (nsToDelete: string) => {
    if (!nsToDelete || nsToDelete === "__manual__") return;
    if (!confirm(`¿Estás seguro de borrar todos los vectores del sitio '${nsToDelete}' de Pinecone?`)) return;

    try {
      const res = await fetch(`/api/namespaces?namespace=${encodeURIComponent(nsToDelete)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al borrar namespace");

      setActiveAlert({
        type: "info",
        title: "Sitio Borrado Exitosamente",
        message: `El namespace '${nsToDelete}' ha sido eliminado de Pinecone.`,
      });
      fetchNamespaces();
    } catch (err: any) {
      setActiveAlert({
        type: "error",
        title: "Error al Borrar Sitio",
        message: err.message,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuery.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputQuery.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputQuery("");
    setIsLoading(true);
    setActiveAlert(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: userMessage.content,
          namespace: namespace.trim(),
          aiProvider,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setActiveAlert({
          type: "error",
          title: "Error en la Consulta RAG",
          message: data.error || "Ocurrió un problema al comunicarse con el proveedor de IA.",
        });
        throw new Error(data.error || "Error al procesar la consulta.");
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.answer,
        sources: data.sources || [],
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: `❌ Ocurrió un error: ${err.message}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanUrl.trim() || !scanNamespace.trim() || isScanning) return;

    setIsScanning(true);
    setScanStatus(null);
    setActiveAlert(null);

    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: scanUrl.trim(),
          clientNamespace: scanNamespace.trim(),
          maxPages: parseInt(scanMaxPages, 10) || 100,
          aiProvider,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setScanStatus({
          type: "error",
          message: data.error || "Error al enviar la orden de escaneo.",
        });
        setActiveAlert({
          type: "error",
          title: "Error al Iniciar Escaneo",
          message: data.error || "Revisa las variables de entorno o cuotas configuradas.",
        });
        throw new Error(data.error || "Error al enviar la orden de escaneo.");
      }

      setScanStatus({
        type: "success",
        message: data.message,
      });

      setIsPollingStatus(true);
      setTimeout(checkIngestStatus, 2500);

      setActiveAlert({
        type: "info",
        title: "Escaneo Iniciado en Segundo Plano",
        message: `El sitio '${scanUrl}' se está procesando bajo el namespace '${scanNamespace}'. Los datos aparecerán al actualizar.`,
      });

      setNamespace(scanNamespace.trim());
      setIsManualInput(false);

      setTimeout(() => {
        fetchNamespaces();
      }, 5000);
    } catch (err: any) {
      console.error("Error en handleStartScan:", err);
    } finally {
      setIsScanning(false);
    }
  };

  const openUpdateModal = () => {
    const targetNs = namespace || (availableNamespaces.length > 0 ? availableNamespaces[0].name : "cliente-avafin");
    setScanNamespace(targetNs);
    setScanUrl(inferUrlFromNamespace(targetNs));
    setScanStatus(null);
    setIsModalOpen(true);
  };

  const openNewSiteModal = () => {
    setScanNamespace("");
    setScanUrl("");
    setScanStatus(null);
    setIsModalOpen(true);
  };

  return (
    <div className="flex flex-col h-screen max-w-6xl mx-auto w-full p-4 md:p-6 gap-4">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between bg-slate-900 border border-slate-800 rounded-2xl p-4 md:px-6 shadow-xl gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
            <Bot className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Scrapio <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 font-mono"><ShieldCheck className="w-3.5 h-3.5" /> Multi-Tenant RAG</span>
            </h1>
            <p className="text-xs text-slate-400">Sistema Serverless de Scraping e Inteligencia Artificial Aislado por Cliente</p>
          </div>
        </div>

        {/* Action Controls Bar */}
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          {/* Selector de Modelo de IA */}
          <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
            <div className="flex items-center gap-1.5 px-2 text-xs text-slate-400 font-medium">
              <Cpu className="w-4 h-4 text-emerald-400" />
              <span>Modelo IA:</span>
            </div>
            <select
              value={aiProvider}
              onChange={(e) => setAiProvider(e.target.value)}
              className="bg-slate-900 text-xs text-white px-3 py-1.5 rounded-lg border border-slate-700/80 focus:outline-none focus:border-emerald-500 font-mono"
            >
              <option value="gemini">Google Gemini 3.8 Flash (~350-500 URLs/día gratis)</option>
              <option value="openai">OpenAI GPT-4o Mini (URLs ilimitadas / Créditos API)</option>
            </select>
          </div>

          {/* Botón 1: Nuevo Sitio */}
          <button
            onClick={openNewSiteModal}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3.5 py-2.5 rounded-xl font-semibold transition-all shadow-md shadow-indigo-600/20"
          >
            <PlusCircle className="w-4 h-4" />
            <span>➕ Nuevo Sitio</span>
          </button>

          {/* Botón 2: Actualizar / Re-escanear Sitio */}
          <button
            onClick={openUpdateModal}
            title="Re-escanear o actualizar un proyecto existente"
            className="flex items-center gap-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-xs px-3.5 py-2.5 rounded-xl font-semibold transition-all"
          >
            <RefreshCw className="w-4 h-4 text-amber-400" />
            <span>🔄 Actualizar Sitio</span>
          </button>

          {/* Botón 3: Conectar con tu LLM (ChatGPT, Claude, Cursor, Python) */}
          <button
            onClick={() => setIsDocsModalOpen(true)}
            title="Cómo usar Scrapio con ChatGPT, Claude, Cursor, Python o Agentes IA"
            className="flex items-center gap-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs px-3.5 py-2.5 rounded-xl font-semibold transition-all"
          >
            <Code2 className="w-4 h-4 text-emerald-400" />
            <span>🔌 Conectar LLM</span>
          </button>

          {/* Desplegable de Sitios Escaneados */}
          <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
            <div className="flex items-center gap-1.5 px-2 text-xs text-slate-400 font-medium">
              <Database className="w-4 h-4 text-indigo-400" />
              <span>Sitio:</span>
            </div>

            {!isManualInput ? (
              <select
                value={namespace}
                onChange={(e) => {
                  if (e.target.value === "__manual__") {
                    setIsManualInput(true);
                  } else {
                    setNamespace(e.target.value);
                  }
                }}
                className="bg-slate-900 text-xs text-white px-3 py-1.5 rounded-lg border border-slate-700/80 focus:outline-none focus:border-indigo-500 font-mono"
              >
                {availableNamespaces.length > 0 ? (
                  availableNamespaces.map((ns) => (
                    <option key={ns.name} value={ns.name}>
                      {ns.name} ({ns.vectorCount} vectores)
                    </option>
                  ))
                ) : (
                  <option value="cliente-avafin">cliente-avafin (27 vectores)</option>
                )}
                <option value="__manual__">✏️ Escribir otro namespace...</option>
              </select>
            ) : (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  autoFocus
                  value={namespace}
                  onChange={(e) => setNamespace(e.target.value)}
                  placeholder="ej. cliente-demo"
                  className="bg-slate-900 text-xs text-white px-2.5 py-1 rounded-lg border border-indigo-500 font-mono w-32"
                />
                <button
                  onClick={() => setIsManualInput(false)}
                  className="text-xs text-slate-400 hover:text-white px-1.5"
                >
                  ✕
                </button>
              </div>
            )}

            <button
              onClick={fetchNamespaces}
              title="Refrescar lista de sitios desde Pinecone"
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingNamespaces ? "animate-spin" : ""}`} />
            </button>

            {namespace && namespace !== "__manual__" && (
              <button
                onClick={() => handleDeleteNamespace(namespace)}
                title={`Borrar el sitio '${namespace}' de Pinecone`}
                className="p-1 text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Alerta Preventiva del Sistema si falta alguna Variable de Entorno */}
      {systemIssues.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 text-xs text-amber-300 flex flex-col md:flex-row md:items-center justify-between gap-2 shadow-lg">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-200 mb-0.5">⚠️ Alerta de Configuración del Sistema detectada:</p>
              <ul className="list-disc list-inside space-y-0.5 text-slate-300">
                {systemIssues.map((issue, idx) => (
                  <li key={idx}>{issue}</li>
                ))}
              </ul>
            </div>
          </div>
          <button
            onClick={checkSystemHealth}
            className="self-end md:self-center bg-amber-600/30 hover:bg-amber-600/40 text-amber-200 border border-amber-500/40 px-3 py-1.5 rounded-lg font-medium transition-all"
          >
            Re-comprobar
          </button>
        </div>
      )}

      {/* Barra de Progreso en Vivo para Escaneo e Ingesta en Segundo Plano */}
      {ingestStatus && (ingestStatus.status === "in_progress" || ingestStatus.status === "queued" || isPollingStatus) && (
        <div className="bg-slate-900/90 border border-indigo-500/40 rounded-2xl p-4 shadow-2xl backdrop-blur-md transition-all">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Procesando Escaneo e Ingesta</span>
                  <span className="text-xs font-mono font-semibold text-indigo-300 bg-indigo-500/20 border border-indigo-500/30 px-2 py-0.5 rounded-full">
                    {ingestStatus.progressPercent}%
                  </span>
                </h4>
                <p className="text-xs text-slate-300 font-mono mt-0.5">
                  {ingestStatus.currentStepName}
                </p>
              </div>
            </div>
            {ingestStatus.htmlUrl && (
              <a
                href={ingestStatus.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs text-indigo-300 hover:text-white bg-indigo-600/30 hover:bg-indigo-600/50 px-3 py-1.5 rounded-xl border border-indigo-500/30 font-medium transition-all"
              >
                <span>Ver GitHub Log</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
          <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
            <div
              className="bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 h-full transition-all duration-500 rounded-full"
              style={{ width: `${Math.max(6, ingestStatus.progressPercent)}%` }}
            />
          </div>
        </div>
      )}

      {/* Notificación de Éxito al Finalizar Escaneo */}
      {ingestStatus && ingestStatus.status === "completed" && ingestStatus.conclusion === "success" && (
        <div className="bg-emerald-950/70 border border-emerald-500/40 rounded-2xl p-4 shadow-xl backdrop-blur-md flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">¡Escaneo e Ingesta Completada!</h4>
              <p className="text-xs text-emerald-200 mt-0.5">
                Los datos fueron vectorizados y cargados exitosamente en Pinecone. La lista de sitios se ha actualizado.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setIngestStatus(null);
              fetchNamespaces();
            }}
            className="text-xs bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 border border-emerald-500/40 px-3 py-1.5 rounded-xl font-semibold transition-all flex-shrink-0"
          >
            Cerrar Notificación
          </button>
        </div>
      )}

      {/* Banner de Alerta Dinámica / Toast Interactivo de Errores o Notificaciones */}
      {activeAlert && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-start justify-between gap-3 shadow-xl transition-all border ${
            activeAlert.type === "error"
              ? "bg-rose-500/10 text-rose-200 border-rose-500/30"
              : activeAlert.type === "warning"
              ? "bg-amber-500/10 text-amber-200 border-amber-500/30"
              : "bg-indigo-500/10 text-indigo-200 border-indigo-500/30"
          }`}
        >
          <div className="flex items-start gap-2.5">
            {activeAlert.type === "error" ? (
              <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
            ) : activeAlert.type === "warning" ? (
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            ) : (
              <Info className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <h4 className="font-bold mb-0.5 text-white">{activeAlert.title}</h4>
              <p className="leading-relaxed">{activeAlert.message}</p>
            </div>
          </div>
          <button
            onClick={() => setActiveAlert(null)}
            className="text-slate-400 hover:text-white p-1 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Alerta Informativa de Límites y Cuotas expresada en URLs Diarias */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-4 py-2.5 text-xs flex flex-col md:flex-row md:items-center justify-between gap-2 shadow-md">
        <div className="flex items-center gap-2 text-slate-300">
          <Info className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>
            Modelo Activo: <strong className="text-white font-semibold font-mono">{aiProvider === "gemini" ? "Google Gemini 3.8 Flash + embedding-001" : "OpenAI GPT-4o Mini + text-embedding-3-small"}</strong>
          </span>
        </div>
        <div className="flex items-center gap-2">
          {aiProvider === "gemini" ? (
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[11px]">
              🎁 Capacidad Gratuita: ~350 a 500 URLs/páginas web por día (~750 consultas de chat/día)
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono text-[11px]">
              💳 Capacidad Pagada: URLs ilimitadas según tu saldo de créditos en OpenAI
            </span>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <main className="flex-1 bg-slate-900/70 border border-slate-800 rounded-2xl p-4 md:p-6 flex flex-col justify-between overflow-hidden shadow-2xl backdrop-blur-sm">
        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3.5 ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {msg.role === "assistant" && (
                <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="w-5 h-5" />
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 rounded-tr-xs"
                    : "bg-slate-800/90 border border-slate-700/60 text-slate-200 rounded-tl-xs"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>

                {/* Fuentes Citadas */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3.5 pt-3 border-t border-slate-700/50 text-xs">
                    <p className="font-semibold text-slate-400 mb-1.5 flex items-center gap-1">
                      <Globe className="w-3.5 h-3.5 text-indigo-400" /> Fuentes consultadas ({msg.sources.length}):
                    </p>
                    <ul className="space-y-1">
                      {msg.sources.map((url, idx) => (
                        <li key={idx}>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-400 hover:text-indigo-300 underline flex items-center gap-1 truncate max-w-full"
                          >
                            <ExternalLink className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{url}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {msg.role === "user" && (
                <div className="w-9 h-9 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User className="w-5 h-5" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3.5 justify-start">
              <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
                <Bot className="w-5 h-5 animate-pulse" />
              </div>
              <div className="bg-slate-800/90 border border-slate-700/60 rounded-2xl rounded-tl-xs p-4 text-xs text-slate-400 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400 animate-spin" />
                <span>Buscando vectores en Pinecone con modelo <strong className="text-white font-mono">{aiProvider}</strong> (namespace: <strong className="text-white font-mono">{namespace}</strong>) y generando respuesta...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="mt-4 pt-4 border-t border-slate-800 flex gap-2">
          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            placeholder={`Haz una pregunta a ${aiProvider === "gemini" ? "Gemini 3.8 Flash" : "GPT-4o Mini"} sobre ${namespace}...`}
            className="flex-1 bg-slate-950 text-sm text-white px-4 py-3 rounded-xl border border-slate-800 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <button
            type="submit"
            disabled={isLoading || !inputQuery.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-5 py-3 rounded-xl font-medium text-sm flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/25"
          >
            <span>Enviar</span>
            <Send className="w-4 h-4" />
          </button>
        </form>
      </main>

      {/* Modal para Disparar Escaneo o Actualización de Sitio hacia GitHub Actions */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
                <Globe className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Escanear / Actualizar Sitio Web</h3>
                <p className="text-xs text-slate-400">Envia la orden a GitHub Actions usando {aiProvider === "gemini" ? "Google Gemini" : "OpenAI"}</p>
              </div>
            </div>

            <form onSubmit={handleStartScan} className="space-y-4">
              {/* Selección del Namespace/Proyecto en el Modal */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Proyecto / Namespace a Procesar
                </label>
                {availableNamespaces.length > 0 ? (
                  <select
                    disabled={scanStatus?.type === "success"}
                    value={scanNamespace}
                    onChange={(e) => {
                      const selectedNs = e.target.value;
                      setScanNamespace(selectedNs);
                      setScanUrl(inferUrlFromNamespace(selectedNs));
                    }}
                    className="w-full bg-slate-950 text-xs text-white px-3.5 py-2.5 rounded-xl border border-slate-800 focus:outline-none focus:border-indigo-500 font-mono disabled:opacity-60 mb-2"
                  >
                    <option value="">-- Selecciona un proyecto existente --</option>
                    {availableNamespaces.map((ns) => (
                      <option key={ns.name} value={ns.name}>
                        {ns.name} ({ns.vectorCount} vectores activos)
                      </option>
                    ))}
                  </select>
                ) : null}

                <input
                  type="text"
                  required
                  disabled={scanStatus?.type === "success"}
                  value={scanNamespace}
                  onChange={(e) => setScanNamespace(e.target.value)}
                  placeholder="o escribe un nuevo namespace (ej. cliente-libranza)"
                  className="w-full bg-slate-950 text-xs text-white px-3.5 py-2.5 rounded-xl border border-slate-800 focus:outline-none focus:border-indigo-500 font-mono disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  URL Base a Escanear
                </label>
                <input
                  type="url"
                  required
                  disabled={scanStatus?.type === "success"}
                  value={scanUrl}
                  onChange={(e) => setScanUrl(e.target.value)}
                  placeholder="https://ejemplo.com"
                  className="w-full bg-slate-950 text-xs text-white px-3.5 py-2.5 rounded-xl border border-slate-800 focus:outline-none focus:border-indigo-500 font-mono disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Máximo de Páginas a Rastrear (Sin Límite Superior)
                </label>
                <input
                  type="number"
                  min="1"
                  disabled={scanStatus?.type === "success"}
                  value={scanMaxPages}
                  onChange={(e) => setScanMaxPages(e.target.value)}
                  placeholder="ej. 500, 1000, 5000..."
                  className="w-full bg-slate-950 text-xs text-white px-3.5 py-2.5 rounded-xl border border-slate-800 focus:outline-none focus:border-indigo-500 font-mono disabled:opacity-60"
                />
              </div>

              {scanStatus && (
                <div
                  className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 ${
                    scanStatus.type === "success"
                      ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                      : "bg-rose-500/10 text-rose-300 border border-rose-500/20"
                  }`}
                >
                  {scanStatus.type === "success" ? (
                    <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-400" />
                  ) : (
                    <X className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-400" />
                  )}
                  <span className="leading-relaxed font-medium">{scanStatus.message}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                {scanStatus?.type === "success" ? (
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shadow-md shadow-emerald-600/20"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Entendido / Cerrar</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isScanning}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2 transition-all shadow-md shadow-indigo-600/20"
                    >
                      {isScanning ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Enviando Orden...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>Iniciar / Actualizar Escaneo</span>
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal para Guiar la Conexión con LLMs Externos */}
      {isDocsModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
            <button
              onClick={() => setIsDocsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-emerald-600/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                <Code2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Conecta Scrapio con tu LLM Preferido</h3>
                <p className="text-xs text-slate-400">Consulta los datos indexados de {namespace || "tus sitios"} desde cualquier IA o plataforma.</p>
              </div>
            </div>

            {/* Selector de Pestañas */}
            <div className="flex border-b border-slate-800 gap-1 mb-4 overflow-x-auto pb-1">
              {[
                { id: "chatgpt", label: "🤖 Custom GPTs (OpenAI)" },
                { id: "claude", label: "💻 Claude & Cursor (MCP)" },
                { id: "python", label: "🐍 Python & cURL" },
                { id: "n8n", label: "⚡ n8n / Make" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveDocTab(tab.id as any)}
                  className={`text-xs px-3 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${
                    activeDocTab === tab.id
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Contenido Dinámico por Pestaña */}
            <div className="flex-1 overflow-y-auto pr-1 text-xs space-y-3 text-slate-300">
              {activeDocTab === "chatgpt" && (
                <div className="space-y-3">
                  <p className="text-slate-200">
                    Puedes conectar tu <strong>Custom GPT</strong> en ChatGPT para que consulte en tiempo real la información de tus sitios indexados:
                  </p>
                  <ol className="list-decimal list-inside space-y-1.5 text-slate-300">
                    <li>En ChatGPT, ve a <strong>Explore GPTs &gt; Create a GPT</strong> &gt; pestaña <strong>Configure</strong>.</li>
                    <li>Desplázate a <strong>Actions</strong> y haz clic en <strong>Create new action</strong>.</li>
                    <li>En el campo <em>Schema</em>, haz clic en <strong>Import from URL</strong> y pega:</li>
                  </ol>
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between font-mono text-indigo-300">
                    <span>https://scrapio-one.vercel.app/api/openapi.json</span>
                    <button
                      onClick={() => copyToClipboard("https://scrapio-one.vercel.app/api/openapi.json")}
                      className="p-1 hover:text-white text-slate-400 transition-colors"
                      title="Copiar URL OpenAPI"
                    >
                      {copiedSnippet ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-slate-400">
                    4. En <strong>Authentication</strong>, selecciona <strong>API Key</strong> (Bearer) e ingresa tu clave <code>SCRAPIO_API_KEY</code>.
                  </p>
                </div>
              )}

              {activeDocTab === "claude" && (
                <div className="space-y-3">
                  <p className="text-slate-200">
                    Scrapio incluye un servidor <strong>Model Context Protocol (MCP)</strong> nativo para <strong>Claude Desktop</strong> y <strong>Cursor</strong>:
                  </p>
                  <p>Agrega esta configuración en tu archivo <code>claude_desktop_config.json</code>:</p>
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 relative font-mono text-[11px] text-slate-200 overflow-x-auto">
                    <button
                      onClick={() =>
                        copyToClipboard(
                          JSON.stringify(
                            {
                              mcpServers: {
                                scrapio: {
                                  command: "npx",
                                  args: ["-y", "tsx", "scripts/mcp-server.ts"],
                                  env: {
                                    SCRAPIO_API_URL: "https://scrapio-one.vercel.app",
                                    SCRAPIO_API_KEY: "tu_token_secreto",
                                  },
                                },
                              },
                            },
                            null,
                            2
                          )
                        )
                      }
                      className="absolute top-2.5 right-2.5 p-1 text-slate-400 hover:text-white"
                      title="Copiar configuración MCP"
                    >
                      {copiedSnippet ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <pre>{`{
  "mcpServers": {
    "scrapio": {
      "command": "npx",
      "args": ["-y", "tsx", "scripts/mcp-server.ts"],
      "env": {
        "SCRAPIO_API_URL": "https://scrapio-one.vercel.app",
        "SCRAPIO_API_KEY": "tu_token_secreto"
      }
    }
  }
}`}</pre>
                  </div>
                </div>
              )}

              {activeDocTab === "python" && (
                <div className="space-y-3">
                  <p className="text-slate-200">
                    Consulta el RAG de forma headless desde la terminal o scripts de Python apuntando al namespace <strong>{namespace || "cliente-avafin"}</strong>:
                  </p>
                  <p className="font-semibold text-slate-300">cURL (Terminal):</p>
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 relative font-mono text-[11px] text-slate-200 overflow-x-auto">
                    <button
                      onClick={() =>
                        copyToClipboard(
                          `curl -X POST https://scrapio-one.vercel.app/api/v1/query \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer tu_secret_token" \\\n  -d '{"query": "¿Cuáles son los requisitos?", "namespace": "${namespace || "cliente-avafin"}"}'`
                        )
                      }
                      className="absolute top-2 right-2 p-1 text-slate-400 hover:text-white"
                    >
                      {copiedSnippet ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <pre>{`curl -X POST https://scrapio-one.vercel.app/api/v1/query \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer tu_secret_token" \\
  -d '{"query": "¿Cuáles son los requisitos?", "namespace": "${namespace || "cliente-avafin"}"}'`}</pre>
                  </div>

                  <p className="font-semibold text-slate-300">Python (requests):</p>
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 relative font-mono text-[11px] text-slate-200 overflow-x-auto">
                    <button
                      onClick={() =>
                        copyToClipboard(
                          `import requests\n\nres = requests.post(\n    "https://scrapio-one.vercel.app/api/v1/query",\n    headers={"Authorization": "Bearer tu_secret_token"},\n    json={"query": "¿Cuáles son los requisitos?", "namespace": "${namespace || "cliente-avafin"}"}\n)\nprint(res.json()["answer"])`
                        )
                      }
                      className="absolute top-2 right-2 p-1 text-slate-400 hover:text-white"
                    >
                      {copiedSnippet ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <pre>{`import requests

res = requests.post(
    "https://scrapio-one.vercel.app/api/v1/query",
    headers={"Authorization": "Bearer tu_secret_token"},
    json={"query": "¿Cuáles son los requisitos?", "namespace": "${namespace || "cliente-avafin"}"}
)
print(res.json()["answer"])`}</pre>
                  </div>
                </div>
              )}

              {activeDocTab === "n8n" && (
                <div className="space-y-3">
                  <p className="text-slate-200">
                    Integra Scrapio en flujos automatizados de <strong>n8n</strong>, <strong>Make</strong> o <strong>Zapier</strong>:
                  </p>
                  <ul className="list-disc list-inside space-y-1.5 text-slate-300">
                    <li><strong>Nodo:</strong> HTTP Request</li>
                    <li><strong>Método:</strong> POST</li>
                    <li><strong>URL:</strong> <code>https://scrapio-one.vercel.app/api/v1/query</code></li>
                    <li><strong>Authentication:</strong> Header Auth &gt; <code>Authorization: Bearer &lt;SCRAPIO_API_KEY&gt;</code></li>
                    <li><strong>JSON Body:</strong> <code>{`{ "query": "{{ $json.mensajeUsuario }}", "namespace": "${namespace || "cliente-avafin"}" }`}</code></li>
                  </ul>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setIsDocsModalOpen(false)}
                className="bg-slate-800 hover:bg-slate-700 text-white px-5 py-2 rounded-xl text-xs font-semibold transition-colors"
              >
                Cerrar Guía
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
