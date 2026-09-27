"use client";

import { useState, useEffect } from "react";
import { Send, Bot, User, Globe, ExternalLink, Sparkles, Database, ShieldCheck, PlusCircle, RefreshCw, X, Loader2, CheckCircle2 } from "lucide-react";

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

export default function Home() {
  const [namespace, setNamespace] = useState("cliente-avafin");
  const [availableNamespaces, setAvailableNamespaces] = useState<NamespaceInfo[]>([]);
  const [isManualInput, setIsManualInput] = useState(false);
  const [inputQuery, setInputQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "¡Hola, Wilman! Soy Scrapio RAG. Puedes seleccionar un sitio web de la lista de escaneados, actualizar sus datos o presionar 'Nuevo Sitio' para agregar un nuevo cliente.",
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingNamespaces, setIsLoadingNamespaces] = useState(false);

  // Estado para el modal de Ingesta / Escaneo
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [scanUrl, setScanUrl] = useState("");
  const [scanNamespace, setScanNamespace] = useState("");
  const [scanMaxPages, setScanMaxPages] = useState("50");
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Cargar la lista de namespaces / sitios escaneados desde Pinecone
  const fetchNamespaces = async () => {
    setIsLoadingNamespaces(true);
    try {
      const res = await fetch("/api/namespaces");
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

  useEffect(() => {
    fetchNamespaces();
  }, []);

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

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: userMessage.content,
          namespace: namespace.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
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

    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: scanUrl.trim(),
          clientNamespace: scanNamespace.trim(),
          maxPages: parseInt(scanMaxPages, 10) || 50,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error al enviar la orden de escaneo.");
      }

      setScanStatus({
        type: "success",
        message: data.message,
      });

      setNamespace(scanNamespace.trim());
      setIsManualInput(false);

      setTimeout(() => {
        fetchNamespaces();
      }, 5000);
    } catch (err: any) {
      setScanStatus({
        type: "error",
        message: err.message || "Error al conectar con la API de Ingesta.",
      });
    } finally {
      setIsScanning(false);
    }
  };

  // Abrir modal preparado para re-escanear/actualizar el sitio actual con auto-relleno inteligente de URL
  const openUpdateModal = () => {
    setScanNamespace(namespace);
    // Infección/Auto-relleno inteligente de la URL
    if (namespace.toLowerCase().includes("avafin")) {
      setScanUrl("https://www.avafin.mx");
    } else {
      setScanUrl(`https://www.${namespace.replace(/^cliente-/, "")}.com`);
    }
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

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <button
            onClick={openNewSiteModal}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3.5 py-2 rounded-xl font-medium transition-all shadow-md shadow-indigo-600/20"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Nuevo Sitio</span>
          </button>

          <button
            onClick={openUpdateModal}
            title="Re-escanear o actualizar datos del sitio activo"
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs px-3 py-2 rounded-xl font-medium transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
            <span>Actualizar</span>
          </button>

          {/* Selector de Sitio / Namespace con fallback interactivo */}
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
          </div>
        </div>
      </header>

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
                <span>Buscando vectores en Pinecone (namespace: <strong className="text-white font-mono">{namespace}</strong>) y generando respuesta...</span>
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
            placeholder={`Haz una pregunta sobre los datos de ${namespace}...`}
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
                <p className="text-xs text-slate-400">Envia la orden a GitHub Actions para procesar la información en Pinecone</p>
              </div>
            </div>

            <form onSubmit={handleStartScan} className="space-y-4">
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
                  Namespace del Cliente (Aislamiento Multi-Tenant)
                </label>
                <input
                  type="text"
                  required
                  disabled={scanStatus?.type === "success"}
                  value={scanNamespace}
                  onChange={(e) => setScanNamespace(e.target.value)}
                  placeholder="ej. cliente-libranza"
                  className="w-full bg-slate-950 text-xs text-white px-3.5 py-2.5 rounded-xl border border-slate-800 focus:outline-none focus:border-indigo-500 font-mono disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Máximo de Páginas a Rastrear
                </label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  disabled={scanStatus?.type === "success"}
                  value={scanMaxPages}
                  onChange={(e) => setScanMaxPages(e.target.value)}
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
    </div>
  );
}
