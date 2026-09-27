"use client";

import { useState, useEffect } from "react";
import { UserButton, useUser } from "@clerk/nextjs";
import {
  Send,
  User,
  ExternalLink,
  Sparkles,
  Database,
  ShieldCheck,
  PlusCircle,
  RefreshCw,
  X,
  Loader2,
  Cpu,
  Trash2,
  Code2,
  Copy,
  Check,
  MessageSquare,
  Radio,
  FileText,
  Download,
  Search,
  CheckCircle2,
  Clock,
  Globe,
  Key,
  Users,
  Lock,
  Shield,
  Save,
  AlertCircle,
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  tokens?: number;
  duration?: string;
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
  processedUrls?: number;
  totalUrls?: number;
  remainingUrls?: number;
  currentUrl?: string;
  quotaExhausted?: boolean;
  provider?: string;
}

const inferUrlFromNamespace = (nsName: string) => {
  const clean = nsName.toLowerCase().replace(/^cliente-/, "").replace(/^pb_/, "");
  if (clean.includes("avafin")) return "https://www.avafin.mx";
  if (clean.includes("personalbliss")) return "https://personalbliss.org";
  return `https://www.${clean.replace(/_/g, "-")}.com`;
};

const getClientDisplayName = (ns: string): string => {
  if (!ns) return "Personal Bliss";
  const clean = ns.replace(/^cliente-/, "").replace(/^pb_/, "").replace(/_/g, " ").replace(/-/g, " ");
  return clean
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
};

const getClientDomain = (ns: string): string => {
  if (!ns) return "personalbliss.org";
  const clean = ns.toLowerCase().replace(/^cliente-/, "").replace(/^pb_/, "");
  if (clean.includes("avafin")) return "avafin.mx";
  if (clean.includes("personalbliss")) return "personalbliss.org";
  return `${clean.replace(/_/g, "-")}.com`;
};

const getClientInitials = (ns: string): string => {
  const name = getClientDisplayName(ns);
  const parts = name.split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

const formatUrlDisplay = (url: string): string => {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return url;
  }
};

const extractTitleFromUrl = (url: string): string => {
  try {
    const u = new URL(url);
    const slug = u.pathname.split("/").filter(Boolean).pop();
    if (!slug) return u.hostname;
    return slug
      .replace(/[-_]/g, " ")
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  } catch {
    return "Página Indexada";
  }
};

const getWelcomeMessage = (ns: string): Message => ({
  id: "welcome-" + ns,
  role: "assistant",
  content: `Conectado al conocimiento indexado de **${getClientDisplayName(ns)}** (\`${ns}\`). Las respuestas son sintetizadas exclusivamente desde su base vectorial de Pinecone. ¿Qué deseas consultar sobre este sitio?`,
  sources: [],
  tokens: 0,
  duration: "0,0 s",
});

export default function Home() {
  const [namespace, setNamespace] = useState("cliente-avafin");
  const [aiProvider, setAiProvider] = useState("gemini");
  const [availableNamespaces, setAvailableNamespaces] = useState<NamespaceInfo[]>([]);
  const [inputQuery, setInputQuery] = useState("");

  // Historial de mensajes aislado por cada namespace / cliente
  const [messagesByNamespace, setMessagesByNamespace] = useState<Record<string, Message[]>>({});

  const messages = messagesByNamespace[namespace] || [getWelcomeMessage(namespace)];

  const setMessages = (updater: Message[] | ((prev: Message[]) => Message[])) => {
    setMessagesByNamespace((prev) => {
      const current = prev[namespace] || [getWelcomeMessage(namespace)];
      const nextMessages = typeof updater === "function" ? updater(current) : updater;
      return {
        ...prev,
        [namespace]: nextMessages,
      };
    });
  };

  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingNamespaces, setIsLoadingNamespaces] = useState(false);

  // Modales
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isClientSelectorOpen, setIsClientSelectorOpen] = useState(false);
  const [isDocsModalOpen, setIsDocsModalOpen] = useState(false);
  const [isFragmentsModalOpen, setIsFragmentsModalOpen] = useState(false);
  const [activeFragments, setActiveFragments] = useState<{ title: string; url: string; score: number }[]>([]);

  // Modal de Auditoría de URLs escaneadas vs faltantes
  const [isUrlsAuditModalOpen, setIsUrlsAuditModalOpen] = useState(false);
  const [urlsAuditData, setUrlsAuditData] = useState<{
    namespace: string;
    domain: string;
    totalDiscovered: number;
    totalIndexed: number;
    totalPending: number;
    progressPercent: number;
    indexedUrls: string[];
    pendingUrls: string[];
  } | null>(null);
  const [isLoadingUrlsAudit, setIsLoadingUrlsAudit] = useState(false);
  const [urlsTab, setUrlsTab] = useState<"all" | "indexed" | "pending">("all");
  const [urlsSearchFilter, setUrlsSearchFilter] = useState("");

  const openUrlsAudit = async (targetNs?: string) => {
    const ns = targetNs || namespace;
    setIsUrlsAuditModalOpen(true);
    setIsLoadingUrlsAudit(true);
    setUrlsSearchFilter("");
    try {
      const res = await fetch(`/api/urls?namespace=${encodeURIComponent(ns)}`);
      const data = await res.json();
      if (res.ok) {
        setUrlsAuditData(data);
      }
    } catch (err) {
      console.error("Error al cargar auditoría de URLs:", err);
    } finally {
      setIsLoadingUrlsAudit(false);
    }
  };

  // Estado de Usuario Autenticado y Permisos
  const { user: clerkUser } = useUser();
  const [currentUserInfo, setCurrentUserInfo] = useState<{
    userId?: string;
    email: string;
    name: string;
    isAdmin: boolean;
    allowedNamespaces: string[];
    canUseOpenAI: boolean;
  } | null>(null);

  // Estado BYOK (Bring Your Own Key)
  const [isByokModalOpen, setIsByokModalOpen] = useState(false);
  const [customGeminiKey, setCustomGeminiKey] = useState("");
  const [customOpenaiKey, setCustomOpenaiKey] = useState("");
  const [byokSavedMessage, setByokSavedMessage] = useState(false);

  // Estado Panel Administrador
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [isLoadingAdminUsers, setIsLoadingAdminUsers] = useState(false);
  const [adminSuccessMsg, setAdminSuccessMsg] = useState("");

  // Pestañas del Modal de Conexión LLM
  const [activeDocTab, setActiveDocTab] = useState<"direct" | "chatgpt" | "claude" | "python" | "n8n">("direct");
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  // Estado de Ingesta / Rastreo
  const [scanUrl, setScanUrl] = useState("");
  const [scanNamespace, setScanNamespace] = useState("");
  const [scanMaxPages, setScanMaxPages] = useState("100");
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [ingestStatus, setIngestStatus] = useState<IngestStatus | null>(null);
  const [isPollingStatus, setIsPollingStatus] = useState(false);

  // Consultas del día diferenciadas por proveedor de IA
  const [geminiQueries, setGeminiQueries] = useState(234);
  const [openaiQueries, setOpenaiQueries] = useState(48);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  const copyMessageContent = (id: string, content: string, sources?: string[]) => {
    let full = content;
    if (sources && sources.length > 0) {
      full += "\n\nFuentes consultadas:\n" + sources.map((s, idx) => `[${idx + 1}] ${s}`).join("\n");
    }
    navigator.clipboard.writeText(full);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const exportToMarkdown = (content: string, sources?: string[]) => {
    let md = `# Consulta Scrapio RAG - ${new Date().toLocaleString()}\n\n`;
    md += `**Namespace**: ${namespace}\n\n`;
    md += `## Respuesta\n\n${content}\n\n`;
    if (sources && sources.length > 0) {
      md += `## Fuentes Consultadas\n\n`;
      sources.forEach((s, idx) => {
        md += `${idx + 1}. [${s}](${s})\n`;
      });
    }
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scrapio-${namespace}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fetchUserInfo = async () => {
    try {
      const res = await fetch("/api/me?t=" + Date.now());
      if (res.ok) {
        const data = await res.json();
        setCurrentUserInfo(data.user);
      }
    } catch (err) {
      console.error("Error cargando perfil del usuario:", err);
    }
  };

  const fetchAdminUsers = async () => {
    setIsLoadingAdminUsers(true);
    try {
      const res = await fetch("/api/admin/users?t=" + Date.now());
      if (res.ok) {
        const data = await res.json();
        setAdminUsers(data.users || []);
      }
    } catch (err) {
      console.error("Error cargando usuarios en panel admin:", err);
    } finally {
      setIsLoadingAdminUsers(false);
    }
  };

  const handleSaveByok = (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof window !== "undefined") {
      localStorage.setItem("scrapio_byok_gemini", customGeminiKey.trim());
      localStorage.setItem("scrapio_byok_openai", customOpenaiKey.trim());
    }
    setByokSavedMessage(true);
    setTimeout(() => {
      setByokSavedMessage(false);
      setIsByokModalOpen(false);
    }, 1200);
  };

  const handleUpdateUserPermissions = async (
    userId: string,
    allowedNamespaces: string[],
    canUseOpenAI: boolean
  ) => {
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, allowedNamespaces, canUseOpenAI }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al actualizar");
      }
      setAdminSuccessMsg("Permisos actualizados con éxito.");
      setTimeout(() => setAdminSuccessMsg(""), 3000);
      fetchAdminUsers();
      fetchNamespaces();
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const handleDeleteUser = async (userId: string, userEmail: string) => {
    if (!confirm(`¿Eliminar al usuario ${userEmail}? Esta acción no se puede deshacer.`)) return;
    try {
      const res = await fetch(`/api/admin/users?userId=${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      fetchAdminUsers();
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const fetchNamespaces = async () => {
    setIsLoadingNamespaces(true);
    try {
      const res = await fetch("/api/namespaces?t=" + Date.now());
      const data = await res.json();
      if (res.ok && Array.isArray(data.namespaces)) {
        setAvailableNamespaces(data.namespaces);
        if (data.namespaces.length > 0) {
          const exists = data.namespaces.some((n: NamespaceInfo) => n.name === namespace);
          if (!exists || namespace === "cliente-avafin") {
            setNamespace(data.namespaces[0].name);
          }
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
    fetchUserInfo();
    fetchNamespaces();
    checkIngestStatus();
    if (typeof window !== "undefined") {
      setCustomGeminiKey(localStorage.getItem("scrapio_byok_gemini") || "");
      setCustomOpenaiKey(localStorage.getItem("scrapio_byok_openai") || "");
    }
  }, []);

  useEffect(() => {
    if (!isPollingStatus) return;
    const interval = setInterval(checkIngestStatus, 4000);
    return () => clearInterval(interval);
  }, [isPollingStatus]);

  const handleDeleteNamespace = async (nsToDelete: string) => {
    if (!confirm(`¿Estás seguro de borrar todos los vectores del sitio '${nsToDelete}' de Pinecone?`)) return;
    try {
      const res = await fetch(`/api/namespaces?namespace=${encodeURIComponent(nsToDelete)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Error al borrar namespace");
      fetchNamespaces();
      if (namespace === nsToDelete) {
        setNamespace(availableNamespaces.find((n) => n.name !== nsToDelete)?.name || "");
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const handleSubmit = async (e?: React.FormEvent, customQuery?: string) => {
    if (e) e.preventDefault();
    const queryToSend = customQuery || inputQuery;
    if (!queryToSend.trim() || isLoading) return;

    const startTime = performance.now();
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: queryToSend.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputQuery("");
    setIsLoading(true);

    const activeCustomKey = (aiProvider === "openai" ? customOpenaiKey : customGeminiKey).trim() || undefined;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: userMessage.content,
          namespace: namespace.trim(),
          aiProvider,
          customApiKey: activeCustomKey,
        }),
      });

      const data = await res.json();
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1).replace(".", ",") + " s";
      const tokensEstimated = Math.round(data.answer ? data.answer.length * 0.35 + 850 : 1100);

      if (!res.ok) throw new Error(data.error || "Error al procesar consulta.");

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.answer,
        sources: data.sources || [],
        tokens: tokensEstimated,
        duration: elapsed,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      if (aiProvider === "gemini") {
        setGeminiQueries((prev) => prev + 1);
      } else {
        setOpenaiQueries((prev) => prev + 1);
      }
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
          maxPages: parseInt(scanMaxPages, 10) || 100,
          aiProvider,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al enviar la orden de escaneo.");

      setScanStatus({ type: "success", message: data.message });
      setIsPollingStatus(true);
      setTimeout(checkIngestStatus, 2500);
      setNamespace(scanNamespace.trim());
      setTimeout(() => fetchNamespaces(), 5000);
    } catch (err: any) {
      setScanStatus({ type: "error", message: err.message });
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

  // Helper para renderizar contenido con badges de CTA con tamaño mínimo de 16px
  const renderMessageContent = (content: string) => {
    const ctaRegex = /\*\*\[Banner de Conversión \/ CTA:\s*"(.*?)"\]\((.*?)\)\*\*/g;
    type ContentPart = { type: "text"; val: string } | { type: "cta"; text: string; url: string };
    const parts: ContentPart[] = [];
    let lastIndex = 0;
    let match;

    while ((match = ctaRegex.exec(content)) !== null) {
      const textBefore = content.substring(lastIndex, match.index);
      if (textBefore) parts.push({ type: "text", val: textBefore });
      parts.push({ type: "cta", text: match[1], url: match[2] });
      lastIndex = match.index + match[0].length;
    }
    const remaining = content.substring(lastIndex);
    if (remaining) parts.push({ type: "text", val: remaining });

    return (
      <div className="text-base text-slate-800 leading-relaxed space-y-3 font-normal">
        {parts.map((item, idx) => {
          if (item.type === "cta") {
            return (
              <a
                key={idx}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="my-2.5 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-950 font-semibold text-base hover:bg-amber-500/20 transition-all shadow-xs"
              >
                <span>📢</span>
                <span>Banner de Conversión / CTA: &quot;{item.text}&quot;</span>
                <ExternalLink className="w-4 h-4 text-amber-700" />
              </a>
            );
          }
          return (
            <div key={idx} className="space-y-2.5">
              {item.val.split("\n\n").map((para, pIdx) => {
                if (!para.trim()) return null;
                const boldFormatted = para.split(/(\*\*.*?\*\*)/g).map((chunk, cIdx) => {
                  if (chunk.startsWith("**") && chunk.endsWith("**")) {
                    return (
                      <strong key={cIdx} className="text-slate-900 font-bold">
                        {chunk.slice(2, -2)}
                      </strong>
                    );
                  }
                  return chunk;
                });
                return <p key={pIdx}>{boldFormatted}</p>;
              })}
            </div>
          );
        })}
      </div>
    );
  };

  const activeNamespaceObj = availableNamespaces.find((n) => n.name === namespace);
  const activeVectors = activeNamespaceObj?.vectorCount || 4812;

  return (
    <div className="min-h-screen flex antialiased select-none font-sans text-slate-800 text-base" style={{ backgroundColor: "#CCD6E0", color: "#0F172A" }}>
      {/* BEGIN: Sidebar */}
      <aside
        className="w-80 bg-[#F6F8FB] border-r border-[#DCE4EC] flex flex-col justify-between shrink-0 h-screen sticky top-0 px-5 py-6 select-none"
        style={{ backgroundColor: "rgb(248, 250, 252)", borderRight: "1px solid rgb(203, 213, 225)" }}
      >
        {/* Top Nav Container */}
        <div className="space-y-6">
          {/* App Brand Logo & User Session */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-xl shadow-sm">
                  S
                </div>
                <div>
                  <h1 className="font-bold text-lg leading-tight text-slate-900 tracking-tight">Scrapio</h1>
                  <p className="text-base font-semibold text-slate-500 tracking-wider uppercase">WEB RAG</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <UserButton />
              </div>
            </div>

            {/* User Session Profile Card */}
            <div className="bg-white border border-[#DCE4ED] rounded-xl p-3 flex items-center justify-between shadow-2xs">
              <div className="overflow-hidden pr-2">
                <div className="text-base font-bold text-slate-900 truncate">
                  {currentUserInfo?.name || clerkUser?.fullName || "Usuario"}
                </div>
                <div className="text-sm font-mono text-slate-500 truncate">
                  {currentUserInfo?.email || clerkUser?.primaryEmailAddress?.emailAddress || ""}
                </div>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider shrink-0 border ${
                  currentUserInfo?.isAdmin
                    ? "bg-purple-50 text-purple-700 border-purple-200"
                    : "bg-emerald-50 text-emerald-800 border-emerald-200"
                }`}
              >
                {currentUserInfo?.isAdmin ? "Admin" : "Cliente"}
              </span>
            </div>
          </div>

          {/* Client Context Selector */}
          <div>
            <div className="px-1 pb-2 text-base font-semibold tracking-wider text-slate-500 uppercase">
              Contexto de cliente
            </div>
            <div
              onClick={() => setIsClientSelectorOpen(true)}
              className="mt-1 bg-white border border-[#DCE4ED] rounded-xl p-3.5 shadow-xs hover:border-slate-300 transition-colors cursor-pointer group"
              style={{ backgroundColor: "rgb(255, 255, 255)", border: "1px solid rgb(226, 232, 240)" }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-900 text-white font-bold text-base flex items-center justify-center shrink-0">
                    {getClientInitials(namespace)}
                  </div>
                  <div className="overflow-hidden">
                    <div className="text-base font-bold text-slate-900 truncate">
                      {getClientDisplayName(namespace)}
                    </div>
                    <div className="text-base text-slate-500 truncate">
                      {getClientDomain(namespace)} · {activeVectors.toLocaleString()} vectores
                    </div>
                  </div>
                </div>
                <svg
                  className="w-5 h-5 text-slate-400 shrink-0 group-hover:text-slate-600 transition-colors"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 9l4-4 4 4m0 6l-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                </svg>
              </div>
            </div>

            {currentUserInfo?.isAdmin && (
              <button
                onClick={openNewSiteModal}
                className="mt-3 px-1 text-base font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span className="text-lg font-normal leading-none">+</span>
                <span>Nuevo espacio de cliente</span>
              </button>
            )}
          </div>

          {/* Work Section Menu Links */}
          <nav className="space-y-1.5">
            <div className="px-1 pb-1.5 text-base font-semibold tracking-wider text-slate-500 uppercase">
              Trabajo
            </div>
            {/* Active Link: Consulta */}
            <button className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#E0E7FF] text-[#2563EB] font-semibold text-base shadow-2xs">
              <div className="flex items-center gap-3">
                <MessageSquare className="w-5 h-5 text-[#2563EB]" />
                <span>Consulta</span>
              </div>
            </button>

            {/* Clientes */}
            <button
              onClick={() => setIsClientSelectorOpen(true)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-slate-700 hover:bg-slate-200/50 font-semibold text-base transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-slate-500" />
                <span>Clientes</span>
              </div>
              <span className="text-base font-bold text-slate-500">
                {availableNamespaces.length || 1}
              </span>
            </button>

            {/* Rastreos & Auditoría de URLs */}
            <button
              onClick={() => openUrlsAudit()}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-slate-700 hover:bg-slate-200/50 font-semibold text-base transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <RefreshCw
                  className={`w-5 h-5 ${
                    ingestStatus?.status === "in_progress" ? "text-amber-500 animate-spin" : "text-slate-500"
                  }`}
                />
                <span>Rastreos & URLs</span>
              </div>
              <span className="text-base font-medium text-slate-600">
                {ingestStatus?.status === "in_progress" ? "1 activo" : "Auditar"}
              </span>
            </button>

            {/* Integraciones */}
            <button
              onClick={() => setIsDocsModalOpen(true)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-slate-700 hover:bg-slate-200/50 font-semibold text-base transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <Code2 className="w-5 h-5 text-slate-500" />
                <span>Integraciones</span>
              </div>
              <span className="text-base font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                API
              </span>
            </button>

            {/* Mis API Keys (BYOK) */}
            <button
              onClick={() => setIsByokModalOpen(true)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-slate-700 hover:bg-slate-200/50 font-semibold text-base transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <Key className="w-5 h-5 text-amber-600" />
                <span>Mis API Keys</span>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                {customGeminiKey || customOpenaiKey ? "BYOK Activo" : "BYOK"}
              </span>
            </button>

            {/* Panel de Gestión de Usuarios (Sólo Admin) */}
            {currentUserInfo?.isAdmin && (
              <button
                onClick={() => {
                  setIsAdminModalOpen(true);
                  fetchAdminUsers();
                }}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-purple-700 hover:bg-purple-100/60 font-semibold text-base transition-colors cursor-pointer border border-purple-200 bg-purple-50/50"
              >
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-purple-600" />
                  <span>Gestión Usuarios</span>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-purple-200 text-purple-900">
                  Admin
                </span>
              </button>
            )}
          </nav>
        </div>

        {/* Bottom System Status Card */}
        <div
          className="bg-white border border-[#DCE4ED] rounded-xl p-4 shadow-2xs space-y-3"
          style={{ backgroundColor: "rgb(255, 255, 255)", border: "1px solid rgb(226, 232, 240)" }}
        >
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-slate-500 uppercase tracking-wider">Motor Activo</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-base font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span> OK
            </span>
          </div>

          <div>
            <div className="text-base font-bold text-slate-900">
              {aiProvider === "gemini" ? "Gemini 3.8 Flash" : "OpenAI GPT-4o Mini"}
            </div>
            <div className="text-base text-slate-500 mt-0.5">
              {aiProvider === "gemini" ? "gemini-embedding-001" : "text-embedding-3-small"} · Pinecone
            </div>
          </div>

          {aiProvider === "gemini" ? (
            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold text-slate-500 uppercase tracking-wider">
                  Cuota diaria (Google)
                </span>
                <span className="text-base font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                  Nivel Gratis
                </span>
              </div>
              {/* Progress Bar */}
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-blue-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (geminiQueries / 750) * 100)}%` }}
                ></div>
              </div>
              <div className="flex items-center justify-between mt-1 text-base text-slate-600 font-medium">
                <span>
                  <strong className="text-slate-900 font-bold">{geminiQueries}</strong> / 750 hoy
                </span>
                <span className="text-slate-500 text-base">{750 - geminiQueries} restantes</span>
              </div>
            </div>
          ) : (
            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold text-slate-500 uppercase tracking-wider">
                  Consumo API (OpenAI)
                </span>
                <span className="text-base font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800">
                  Pay-as-you-go
                </span>
              </div>
              {/* Progress Bar */}
              <div className="w-full bg-emerald-100 h-2 rounded-full overflow-hidden">
                <div className="bg-emerald-600 h-full rounded-full" style={{ width: "100%" }}></div>
              </div>
              <div className="flex items-center justify-between mt-1 text-base text-slate-600 font-medium">
                <span>
                  <strong className="text-slate-900 font-bold">{openaiQueries}</strong> consultas hoy
                </span>
                <span className="text-emerald-800 font-bold text-base">Sin tope diario</span>
              </div>
              <div className="text-base text-slate-500 mt-1">
                Tarifa: ~$0.15 USD / 1M tokens
              </div>
            </div>
          )}
        </div>
      </aside>
      {/* END: Sidebar */}

      {/* BEGIN: MainContent */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#CCD6E0] overflow-y-auto">
        {/* Top Header Bar */}
        <header
          className="border-b border-[#D8E1EA] px-8 py-5 flex items-center justify-between sticky top-0 z-10"
          style={{
            backgroundColor: "rgb(255, 255, 255)",
            borderBottom: "1px solid rgb(203, 213, 225)",
            boxShadow: "rgba(0, 0, 0, 0.05) 0px 1px 3px 0px",
          }}
        >
          <div>
            <h2 className="text-2xl font-bold text-slate-900 leading-snug">Consulta</h2>
            <p className="text-base text-slate-600 mt-0.5">
              Respuestas sintetizadas solo desde el conocimiento indexado de{" "}
              <span className="font-bold text-slate-800">{getClientDisplayName(namespace)}</span>.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Live crawling chip indicator */}
            {ingestStatus?.status === "in_progress" ? (
              <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-[#FEF3C7]/90 text-[#92400E] text-base font-semibold border border-[#FDE68A]">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                <span>
                  {ingestStatus.totalUrls && ingestStatus.totalUrls > 0
                    ? `1 rastreo en curso · ${ingestStatus.processedUrls || 0} de ${ingestStatus.totalUrls} URLs (${ingestStatus.progressPercent}%) · Faltan ${ingestStatus.remainingUrls ?? 0}`
                    : `1 rastreo en curso · ${ingestStatus.progressPercent}%`}
                </span>
              </div>
            ) : ingestStatus?.quotaExhausted ? (
              <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-amber-50 text-amber-900 text-base font-semibold border border-amber-300">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-600"></span>
                <span>
                  Límite de tokens alcanzado · {ingestStatus.processedUrls} de {ingestStatus.totalUrls} URLs indexadas · Faltan {ingestStatus.remainingUrls} en cola
                </span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-emerald-50 text-emerald-800 text-base font-semibold border border-emerald-200">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span>Listo · Monitoreo activo</span>
              </div>
            )}

            {/* Engine selector pill */}
            <div
              onClick={() => setAiProvider(aiProvider === "gemini" ? "openai" : "gemini")}
              className="bg-white border border-[#94A3B8] px-4 py-2 rounded-xl text-base font-semibold text-slate-800 shadow-2xs hover:bg-slate-50 cursor-pointer transition-colors"
              title="Haz clic para alternar entre Gemini y OpenAI"
            >
              Motor: {aiProvider === "gemini" ? "Gemini" : "OpenAI"}
            </div>

            {/* Primary crawl trigger button */}
            <button
              onClick={openUpdateModal}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white px-5 py-2 rounded-xl text-base font-semibold shadow-xs flex items-center gap-2 transition-all cursor-pointer"
            >
              <span>Rastrear sitio</span>
            </button>
          </div>
        </header>

        {/* Content Workspace */}
        <div className="max-w-6xl w-full mx-auto px-8 py-6 flex-1 flex flex-col space-y-6">
          {/* Active Namespace Subheader Banner */}
          <section
            className="bg-white border border-[#94A3B8] rounded-xl px-5 py-3 flex items-center justify-between shadow-2xs"
            data-purpose="namespace-bar"
          >
            <div className="flex items-center gap-3 text-base">
              <span className="bg-[#EEF2FF] text-[#4F46E5] font-bold text-base px-3 py-1 rounded-md border border-indigo-200">
                Namespace aislado
              </span>
              <span className="font-mono text-slate-900 font-bold">{namespace}</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-600">
                {Math.round(activeVectors / 15) || 120} páginas · {activeVectors.toLocaleString()} vectores
              </span>
              <span className="text-slate-400">·</span>
              <button
                onClick={() => openUrlsAudit()}
                className="text-base font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer flex items-center gap-1.5"
                title="Ver lista de URLs indexadas vs las que faltan por rastrear"
              >
                <span>🔍 Ver URLs escaneadas vs faltantes</span>
              </button>
            </div>
            <button
              onClick={() => setIsClientSelectorOpen(true)}
              className="text-base font-semibold text-slate-800 hover:text-slate-950 border border-[#DCE4ED] bg-slate-50 hover:bg-white px-4 py-1.5 rounded-xl transition-colors cursor-pointer"
            >
              Cambiar cliente
            </button>
          </section>

          {/* Chat Thread Section */}
          <section className="space-y-6 flex-1" data-purpose="chat-thread">
            {messages.map((msg) => {
              if (msg.role === "user") {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-2xl bg-[#1E293B] text-white text-base px-5 py-3 rounded-2xl rounded-tr-xs shadow-sm font-normal leading-relaxed">
                      {msg.content}
                    </div>
                  </div>
                );
              }

              return (
                <article
                  key={msg.id}
                  className="bg-white border border-[#94A3B8] rounded-2xl p-6 shadow-2xs space-y-5"
                  data-purpose="assistant-response"
                >
                  {/* Card Header info */}
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-bold text-base flex items-center justify-center">
                        S
                      </div>
                      <span className="font-bold text-base text-slate-900">Scrapio</span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-base font-semibold border border-emerald-200">
                        {msg.sources && msg.sources.length > 0 ? `${msg.sources.length} fuentes verificadas` : "Base RAG"}
                      </span>
                    </div>
                    <div className="text-base text-slate-500 font-mono">
                      {msg.tokens || 1284} tokens · {msg.duration || "1,9 s"}
                    </div>
                  </div>

                  {/* Synthesized Answer Text */}
                  {renderMessageContent(msg.content)}

                  {/* Evidence & Indexed Pages Section */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="pt-2">
                      <div className="text-base font-bold text-slate-500 uppercase tracking-wider mb-3">
                        Evidencia · Páginas indexadas consultadas
                      </div>
                      <div className="space-y-2.5">
                        {msg.sources.map((url, idx) => {
                          const score = (0.93 - idx * 0.04).toFixed(2);
                          return (
                            <div
                              key={idx}
                              className="flex items-center justify-between p-3.5 rounded-xl border border-[#cbd5e1] hover:border-slate-400 hover:bg-[#dfe7f1] transition-all bg-[#EEF3F8]"
                            >
                              <div className="flex items-start gap-3">
                                <span className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-800 text-base font-bold flex items-center justify-center shrink-0 border border-emerald-200">
                                  {idx + 1}
                                </span>
                                <div>
                                  <h4 className="text-base font-bold text-slate-900 leading-snug">
                                    {extractTitleFromUrl(url)}
                                  </h4>
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-base font-mono text-slate-600 hover:text-blue-700 hover:underline mt-1 block"
                                  >
                                    {formatUrlDisplay(url)}
                                  </a>
                                </div>
                              </div>
                              <div className="text-base font-mono font-bold text-slate-800 bg-slate-200/80 px-2.5 py-1 rounded-lg">
                                {score}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Action buttons inside response */}
                      <div className="flex items-center gap-2.5 mt-4 pt-2">
                        <button
                          onClick={() => copyMessageContent(msg.id, msg.content, msg.sources)}
                          className="px-3.5 py-1.5 text-slate-700 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 rounded-xl text-base font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          {copiedMsgId === msg.id ? <Check className="w-4 h-4 text-emerald-600" /> : null}
                          <span>{copiedMsgId === msg.id ? "Copiado" : "Copiar con citas"}</span>
                        </button>
                        <button
                          onClick={() => exportToMarkdown(msg.content, msg.sources)}
                          className="px-3.5 py-1.5 text-slate-700 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 rounded-xl text-base font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          <Download className="w-4 h-4" />
                          <span>Exportar a Markdown</span>
                        </button>
                        <button
                          onClick={() => {
                            setActiveFragments(
                              msg.sources!.map((s, i) => ({
                                title: extractTitleFromUrl(s),
                                url: s,
                                score: parseFloat((0.93 - i * 0.04).toFixed(2)),
                              }))
                            );
                            setIsFragmentsModalOpen(true);
                          }}
                          className="px-3.5 py-1.5 text-slate-700 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 rounded-xl text-base font-semibold transition-colors cursor-pointer"
                        >
                          Ver fragmentos recuperados
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}

            {isLoading && (
              <div className="bg-white border border-[#94A3B8] rounded-2xl p-6 shadow-2xs space-y-3 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-bold text-base flex items-center justify-center">
                    S
                  </div>
                  <span className="font-bold text-base text-slate-900">Scrapio RAG</span>
                  <span className="text-base text-slate-600">
                    Consultando vectores en namespace <strong className="font-mono font-bold text-slate-900">{namespace}</strong>...
                  </span>
                </div>
                <div className="h-5 bg-slate-100 rounded w-3/4"></div>
                <div className="h-5 bg-slate-100 rounded w-1/2"></div>
              </div>
            )}
          </section>

          {/* Bottom Interactive Composer Bar Container */}
          <section className="space-y-3 pt-2" data-purpose="prompt-composer-container">
            {/* Prompt Box */}
            <form
              onSubmit={handleSubmit}
              className="bg-white border border-[#94A3B8] rounded-2xl p-4 shadow-sm focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all"
            >
              <textarea
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                className="w-full border-0 p-0 text-base text-slate-900 placeholder-slate-400 focus:ring-0 resize-none font-normal leading-relaxed outline-none"
                placeholder={`Pregunta sobre precios, políticas, servicios o cualquier contenido indexado de ${getClientDisplayName(namespace)}...`}
                rows={2}
                style={{ backgroundColor: "transparent" }}
              />

              <div className="flex items-center justify-between pt-3 mt-1 border-t border-slate-100 flex-wrap gap-3">
                {/* Filter parameter pills: Both models visible and clickable */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base font-semibold text-slate-500 mr-1">Modelo:</span>
                  <button
                    type="button"
                    onClick={() => setAiProvider("gemini")}
                    className={`px-3.5 py-1.5 rounded-xl border text-base font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                      aiProvider === "gemini"
                        ? "bg-[#2563EB] text-white border-[#2563EB] shadow-xs"
                        : "bg-slate-50 text-slate-700 border-[#DCE4ED] hover:bg-white"
                    }`}
                  >
                    <span>Gemini 3.8 Flash</span>
                    {customGeminiKey.trim() && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-400 text-amber-950 font-bold">
                        BYOK
                      </span>
                    )}
                    {aiProvider === "gemini" && <span className="w-2 h-2 rounded-full bg-white"></span>}
                  </button>

                  {(() => {
                    const hasAccess = Boolean(
                      currentUserInfo?.isAdmin ||
                      currentUserInfo?.canUseOpenAI ||
                      customOpenaiKey.trim()
                    );

                    return (
                      <button
                        type="button"
                        onClick={() => {
                          if (hasAccess) {
                            setAiProvider("openai");
                          } else {
                            setIsByokModalOpen(true);
                          }
                        }}
                        title={
                          hasAccess
                            ? "Modelo OpenAI GPT-4o Mini disponible"
                            : "Restringido por el administrador. Haz clic para ingresar tu propia API Key (BYOK) y desbloquearlo."
                        }
                        className={`px-3.5 py-1.5 rounded-xl border text-base font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                          aiProvider === "openai"
                            ? "bg-[#2563EB] text-white border-[#2563EB] shadow-xs"
                            : hasAccess
                            ? "bg-slate-50 text-slate-700 border-[#DCE4ED] hover:bg-white"
                            : "bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200/60"
                        }`}
                      >
                        {!hasAccess && <Lock className="w-3.5 h-3.5 text-slate-400" />}
                        <span>OpenAI GPT-4o Mini</span>
                        {customOpenaiKey.trim() && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-400 text-amber-950 font-bold">
                            BYOK
                          </span>
                        )}
                        {!hasAccess && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-bold">
                            Requiere Key
                          </span>
                        )}
                        {aiProvider === "openai" && <span className="w-2 h-2 rounded-full bg-white"></span>}
                      </button>
                    );
                  })()}

                  <button
                    type="button"
                    title="Top-K: Cantidad de fragmentos más relevantes recuperados de Pinecone para alimentar el contexto de la IA (6 fragmentos)"
                    className="px-3.5 py-1.5 rounded-xl border border-[#DCE4ED] bg-slate-50 text-base font-semibold text-slate-700 hover:bg-white transition-colors cursor-help"
                  >
                    Top-K 6
                  </button>
                  <span className="text-base text-slate-500 hidden xl:inline ml-1 font-normal">
                    Solo responde con evidencia del namespace activo
                  </span>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading || !inputQuery.trim()}
                  className="bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-base font-semibold px-5 py-2 rounded-xl transition-all shadow-xs flex items-center gap-2 cursor-pointer"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  <span>Enviar</span>
                </button>
              </div>
            </form>

            {/* Quick Prompt Chips / Suggestions */}
            <div className="flex items-center gap-2.5 overflow-x-auto pb-2 text-base">
              {[
                "Resume los servicios",
                "Lista de precios publicados",
                "¿Qué cambió desde el último rastreo?",
                "¿Cuáles son los requisitos y políticas?",
              ].map((suggestion, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSubmit(undefined, suggestion)}
                  className="whitespace-nowrap px-4 py-2 rounded-xl border border-[#94A3B8] text-slate-800 hover:bg-slate-50 text-base font-medium shadow-2xs transition-colors cursor-pointer bg-white"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </section>
        </div>
      </main>
      {/* END: MainContent */}

      {/* Modal: Cambiar Cliente / Administrar Namespaces */}
      {isClientSelectorOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-300 w-full max-w-xl p-6 shadow-2xl relative">
            <button
              onClick={() => setIsClientSelectorOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center font-bold">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Seleccionar Espacio de Cliente</h3>
                <p className="text-base text-slate-500">Alterna entre los sitios web aislados en Pinecone.</p>
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-2.5 pr-1">
              {availableNamespaces.map((ns) => {
                const isSelected = ns.name === namespace;
                return (
                  <div
                    key={ns.name}
                    className={`flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-indigo-50/80 border-indigo-300 ring-1 ring-indigo-200"
                        : "bg-slate-50 border-slate-200 hover:bg-slate-100/70"
                    }`}
                    onClick={() => {
                      setNamespace(ns.name);
                      setIsClientSelectorOpen(false);
                    }}
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-slate-900 text-white font-bold text-base flex items-center justify-center shrink-0">
                        {getClientInitials(ns.name)}
                      </div>
                      <div>
                        <div className="text-base font-bold text-slate-900">{getClientDisplayName(ns.name)}</div>
                        <div className="text-base font-mono text-slate-500">
                          {ns.name} · {ns.vectorCount.toLocaleString()} vectores
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isSelected ? (
                        <span className="text-base font-semibold text-indigo-700 bg-white px-2.5 py-1 rounded-md border border-indigo-200">
                          Activo
                        </span>
                      ) : null}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteNamespace(ns.name);
                        }}
                        title="Eliminar namespace de Pinecone"
                        className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-4 mt-3 border-t border-slate-200 flex justify-between items-center">
              <button
                onClick={() => {
                  setIsClientSelectorOpen(false);
                  openNewSiteModal();
                }}
                className="text-base font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <span>+ Agregar nuevo cliente</span>
              </button>
              <button
                onClick={() => setIsClientSelectorOpen(false)}
                className="bg-slate-900 text-white text-base font-semibold px-5 py-2.5 rounded-xl hover:bg-slate-800 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Rastrear / Nuevo Sitio */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-300 w-full max-w-xl p-6 shadow-2xl relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center font-bold">
                <RefreshCw className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Rastrear o Crear Espacio de Cliente</h3>
                <p className="text-base text-slate-500">Envía la orden a GitHub Actions usando {aiProvider === "gemini" ? "Google Gemini" : "OpenAI"}.</p>
              </div>
            </div>

            <form onSubmit={handleStartScan} className="space-y-4">
              <div>
                <label className="block text-base font-semibold text-slate-800 mb-1.5">
                  Namespace / Identificador del Cliente
                </label>
                <input
                  type="text"
                  required
                  disabled={scanStatus?.type === "success"}
                  value={scanNamespace}
                  onChange={(e) => setScanNamespace(e.target.value)}
                  placeholder="ej. cliente-avafin o personalbliss"
                  className="w-full bg-slate-50 text-base text-slate-900 px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-base font-semibold text-slate-800 mb-1.5">
                  URL Base a Escanear
                </label>
                <input
                  type="url"
                  required
                  disabled={scanStatus?.type === "success"}
                  value={scanUrl}
                  onChange={(e) => setScanUrl(e.target.value)}
                  placeholder="https://ejemplo.com"
                  className="w-full bg-slate-50 text-base text-slate-900 px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-base font-semibold text-slate-800 mb-1.5">
                  Máximo de Páginas a Rastrear
                </label>
                <input
                  type="number"
                  min="5"
                  max="1000"
                  disabled={scanStatus?.type === "success"}
                  value={scanMaxPages}
                  onChange={(e) => setScanMaxPages(e.target.value)}
                  className="w-full bg-slate-50 text-base text-slate-900 px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              {scanStatus && (
                <div
                  className={`p-3.5 rounded-xl text-base border ${
                    scanStatus.type === "success"
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : "bg-red-50 text-red-800 border-red-200"
                  }`}
                >
                  {scanStatus.message}
                </div>
              )}

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 text-base font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isScanning}
                  className="px-6 py-2.5 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center gap-2 shadow-sm"
                >
                  {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  <span>{isScanning ? "Enviando..." : "Iniciar Rastreo"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Integraciones & Conectar con LLM */}
      {isDocsModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-300 w-full max-w-2xl p-6 shadow-2xl relative max-h-[85vh] flex flex-col">
            <button
              onClick={() => setIsDocsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center font-bold">
                <Code2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Conecta Scrapio con tu LLM Preferido</h3>
                <p className="text-base text-slate-500">
                  Consulta el conocimiento de {getClientDisplayName(namespace)} desde cualquier agente o IA.
                </p>
              </div>
            </div>

            {/* Selector de Pestañas */}
            <div className="flex border-b border-slate-200 gap-1.5 mb-4 overflow-x-auto pb-1">
              {[
                { id: "direct", label: "💬 Prompt Directo" },
                { id: "chatgpt", label: "🤖 Custom GPTs" },
                { id: "claude", label: "💻 Claude & Cursor (MCP)" },
                { id: "python", label: "🐍 Python & cURL" },
                { id: "n8n", label: "⚡ n8n / Make" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveDocTab(tab.id as any)}
                  className={`text-base px-3.5 py-2 rounded-xl font-semibold transition-all whitespace-nowrap cursor-pointer ${
                    activeDocTab === tab.id
                      ? "bg-blue-600 text-white shadow-2xs"
                      : "text-slate-600 hover:text-slate-950 hover:bg-slate-100"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Contenido Dinámico por Pestaña */}
            <div className="flex-1 overflow-y-auto pr-1 text-base space-y-4 text-slate-700">
              {activeDocTab === "direct" && (
                <div className="space-y-4">
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-slate-800">
                    <p className="font-bold text-indigo-900 flex items-center gap-2 mb-1.5 text-base">
                      <span>✨ Conexión Inmediata Sin Configuración</span>
                    </p>
                    <p className="text-base text-slate-700 leading-relaxed">
                      Pega cualquiera de estos prompts en cualquier chat con navegación web o acceso a internet (
                      <strong>ChatGPT Plus/Team</strong>, <strong>Claude</strong>, <strong>Gemini Advanced</strong>,{" "}
                      <strong>Copilot</strong> o <strong>Perplexity</strong>). La IA consultará tu endpoint de Scrapio en vivo.
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-slate-900 text-base">
                        Opción 1: Listar Sitios / Clientes (Prompt Rápido)
                      </span>
                      <button
                        onClick={() =>
                          copyToClipboard(
                            "Conéctate a mi sistema Scrapio consultando https://scrapio-one.vercel.app/api/namespaces. Muéstrame una lista numerada de los sitios/cliente"
                          )
                        }
                        className="flex items-center gap-1.5 text-base font-semibold text-blue-600 hover:text-blue-700"
                      >
                        {copiedSnippet ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                        <span>Copiar Prompt</span>
                      </button>
                    </div>
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 font-mono text-base text-emerald-900 select-all">
                      Conéctate a mi sistema Scrapio consultando https://scrapio-one.vercel.app/api/namespaces. Muéstrame una lista numerada de los sitios/cliente
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-slate-900 text-base">
                        Opción 2: Prompt Completo de Asistente RAG Autónomo
                      </span>
                      <button
                        onClick={() =>
                          copyToClipboard(
                            `Actúa como mi asistente de investigación SEO conectado a mi plataforma Scrapio.\n1. Consulta https://scrapio-one.vercel.app/api/namespaces y lístame los clientes/sitios web disponibles.\n2. Cuando te haga una pregunta sobre algún cliente (ej. ${namespace}), haz una petición POST a https://scrapio-one.vercel.app/api/v1/query con el JSON {"query": "<pregunta>", "namespace": "<namespace>"}.\n3. Responde basándote en la información obtenida, incluyendo las fuentes citadas y destacando los banners o llamadas a la acción (CTAs) detectados.`
                          )
                        }
                        className="flex items-center gap-1.5 text-base font-semibold text-blue-600 hover:text-blue-700"
                      >
                        {copiedSnippet ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                        <span>Copiar Prompt Completo</span>
                      </button>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 font-mono text-base text-slate-800 whitespace-pre-line leading-relaxed select-all">
                      {`Actúa como mi asistente de investigación SEO conectado a mi plataforma Scrapio.
1. Consulta https://scrapio-one.vercel.app/api/namespaces y lístame los clientes/sitios web disponibles.
2. Cuando te haga una pregunta sobre algún cliente (ej. ${namespace}), haz una petición POST a https://scrapio-one.vercel.app/api/v1/query con el JSON {"query": "<pregunta>", "namespace": "<namespace>"}.
3. Responde basándote en la información obtenida, incluyendo las fuentes citadas y destacando los banners o llamadas a la acción (CTAs) detectados.`}
                    </div>
                  </div>
                </div>
              )}

              {activeDocTab === "chatgpt" && (
                <div className="space-y-3.5">
                  <p className="text-base leading-relaxed">
                    En ChatGPT, ve a <strong>Create a GPT &gt; Configure &gt; Actions &gt; Create new action</strong> y pega en <em>Import from URL</em>:
                  </p>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between font-mono text-base text-blue-700">
                    <span>https://scrapio-one.vercel.app/api/openapi.json</span>
                    <button
                      onClick={() => copyToClipboard("https://scrapio-one.vercel.app/api/openapi.json")}
                      className="p-1 hover:text-blue-900 text-slate-500"
                    >
                      {copiedSnippet ? <Check className="w-5 h-5 text-emerald-600" /> : <Copy className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              )}

              {activeDocTab === "claude" && (
                <div className="space-y-3.5">
                  <p className="text-base">Configuración MCP para <code>claude_desktop_config.json</code>:</p>
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 relative font-mono text-base text-slate-800 overflow-x-auto">
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
                <div className="space-y-3.5">
                  <p className="text-base">Ejemplo cURL para consultar el namespace <strong>{namespace}</strong>:</p>
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 font-mono text-base text-slate-800 overflow-x-auto">
                    <pre>{`curl -X POST https://scrapio-one.vercel.app/api/v1/query \\
  -H "Content-Type: application/json" \\
  -d '{"query": "¿Cuáles son las condiciones?", "namespace": "${namespace}"}'`}</pre>
                  </div>
                </div>
              )}

              {activeDocTab === "n8n" && (
                <div className="space-y-3.5">
                  <p className="text-base">Nodo HTTP Request para n8n o Make:</p>
                  <ul className="list-disc list-inside space-y-2 text-base text-slate-700">
                    <li><strong>Método:</strong> POST</li>
                    <li><strong>URL:</strong> <code>https://scrapio-one.vercel.app/api/v1/query</code></li>
                    <li><strong>Body:</strong> <code>{`{ "query": "{{ $json.prompt }}", "namespace": "${namespace}" }`}</code></li>
                  </ul>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setIsDocsModalOpen(false)}
                className="bg-slate-900 text-white px-6 py-2.5 rounded-xl text-base font-semibold hover:bg-slate-800 transition-colors"
              >
                Cerrar Guía
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Ver Fragmentos Recuperados */}
      {isFragmentsModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-300 w-full max-w-xl p-6 shadow-2xl relative">
            <button
              onClick={() => setIsFragmentsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100"
            >
              <X className="w-6 h-6" />
            </button>
            <h3 className="text-xl font-bold text-slate-900 mb-1">Fragmentos Vectoriales Recuperados</h3>
            <p className="text-base text-slate-500 mb-4">Evidencia semántica coincidente para {namespace}:</p>
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {activeFragments.map((f, i) => (
                <div key={i} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-base">
                  <div className="flex justify-between font-bold text-slate-900 mb-1">
                    <span>{f.title}</span>
                    <span className="font-mono text-blue-600">{f.score}</span>
                  </div>
                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-base text-slate-500 truncate block hover:underline">
                    {f.url}
                  </a>
                </div>
              ))}
            </div>
            <div className="pt-4 mt-2 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setIsFragmentsModalOpen(false)}
                className="bg-slate-900 text-white text-base font-semibold px-5 py-2.5 rounded-xl"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Auditoría de URLs escaneadas vs faltantes */}
      {isUrlsAuditModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-300 w-full max-w-2xl p-6 shadow-2xl relative max-h-[88vh] flex flex-col">
            <button
              onClick={() => setIsUrlsAuditModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center font-bold">
                <Globe className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  Auditoría de URLs · {getClientDisplayName(urlsAuditData?.namespace || namespace)}
                </h3>
                <p className="text-base text-slate-500">
                  URLs vectorizadas en Pinecone vs pendientes por rastrear en {urlsAuditData?.domain || "el dominio"}.
                </p>
              </div>
            </div>

            {isLoadingUrlsAudit ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                <span className="text-base text-slate-600 font-medium">
                  Consultando Pinecone y analizando sitemap...
                </span>
              </div>
            ) : urlsAuditData ? (
              <>
                {/* Métricas y barra de progreso */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-3 space-y-2">
                  <div className="flex items-center justify-between text-base">
                    <span>
                      Progreso del sitio: <strong>{urlsAuditData.progressPercent}%</strong>
                    </span>
                    <span className="text-slate-500">
                      {urlsAuditData.totalIndexed} de {urlsAuditData.totalDiscovered} URLs indexadas
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-600 h-full rounded-full transition-all duration-500"
                      style={{ width: `${urlsAuditData.progressPercent}%` }}
                    ></div>
                  </div>
                  <div className="flex items-center justify-between pt-1 text-base">
                    <span className="text-emerald-700 font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{urlsAuditData.totalIndexed} Escaneadas / Indexadas</span>
                    </span>
                    <span className="text-amber-700 font-semibold flex items-center gap-1.5">
                      <Clock className="w-4 h-4" />
                      <span>{urlsAuditData.totalPending} Pendientes en cola</span>
                    </span>
                  </div>
                </div>

                {/* Filtro y Búsqueda */}
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex gap-1 border-b border-slate-200 pb-1">
                    {[
                      { id: "all", label: `Todas (${urlsAuditData.totalDiscovered})` },
                      { id: "indexed", label: `🟢 Indexadas (${urlsAuditData.totalIndexed})` },
                      { id: "pending", label: `⏳ Faltantes (${urlsAuditData.totalPending})` },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setUrlsTab(tab.id as any)}
                        className={`text-base px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                          urlsTab === tab.id
                            ? "bg-blue-600 text-white shadow-2xs"
                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={urlsSearchFilter}
                      onChange={(e) => setUrlsSearchFilter(e.target.value)}
                      placeholder="Filtrar URL..."
                      className="pl-9 pr-3 py-1.5 text-base border border-slate-300 rounded-xl bg-slate-50 focus:bg-white outline-none w-48 focus:w-60 transition-all font-mono"
                    />
                  </div>
                </div>

                {/* Lista scrolleable de URLs */}
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[220px]">
                  {(() => {
                    const listToDisplay =
                      urlsTab === "indexed"
                        ? urlsAuditData.indexedUrls.map((u) => ({ url: u, isIndexed: true }))
                        : urlsTab === "pending"
                        ? urlsAuditData.pendingUrls.map((u) => ({ url: u, isIndexed: false }))
                        : [
                            ...urlsAuditData.indexedUrls.map((u) => ({ url: u, isIndexed: true })),
                            ...urlsAuditData.pendingUrls.map((u) => ({ url: u, isIndexed: false })),
                          ];

                    const filtered = listToDisplay.filter((item) =>
                      item.url.toLowerCase().includes(urlsSearchFilter.toLowerCase())
                    );

                    if (filtered.length === 0) {
                      return (
                        <div className="py-8 text-center text-slate-500 text-base">
                          No se encontraron URLs con el filtro actual.
                        </div>
                      );
                    }

                    return filtered.map((item, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-base ${
                          item.isIndexed
                            ? "bg-emerald-50/40 border-emerald-200"
                            : "bg-amber-50/40 border-amber-200"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          {item.isIndexed ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                          ) : (
                            <Clock className="w-5 h-5 text-amber-600 shrink-0" />
                          )}
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-slate-800 hover:text-blue-600 hover:underline truncate"
                          >
                            {item.url}
                          </a>
                        </div>

                        <span
                          className={`px-2.5 py-0.5 rounded-md font-semibold text-xs shrink-0 ${
                            item.isIndexed
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {item.isIndexed ? "Indexada" : "En cola"}
                        </span>
                      </div>
                    ));
                  })()}
                </div>

                {/* Acciones inferiores */}
                <div className="pt-4 mt-2 border-t border-slate-200 flex items-center justify-between">
                  {urlsAuditData.totalPending > 0 ? (
                    <button
                      onClick={() => {
                        setIsUrlsAuditModalOpen(false);
                        setScanNamespace(urlsAuditData.namespace);
                        setScanUrl(urlsAuditData.domain);
                        setScanMaxPages(String(urlsAuditData.totalPending + 10));
                        setIsModalOpen(true);
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base px-5 py-2.5 rounded-xl shadow-sm flex items-center gap-2 cursor-pointer transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>Rastrear las {urlsAuditData.totalPending} URLs Faltantes</span>
                    </button>
                  ) : (
                    <span className="text-emerald-700 font-semibold text-base flex items-center gap-1.5">
                      <CheckCircle2 className="w-5 h-5" />
                      <span>100% de las URLs indexadas</span>
                    </span>
                  )}

                  <button
                    onClick={() => setIsUrlsAuditModalOpen(false)}
                    className="bg-slate-900 text-white text-base font-semibold px-5 py-2.5 rounded-xl hover:bg-slate-800 transition-colors"
                  >
                    Cerrar
                  </button>
                </div>
              </>
            ) : (
              <div className="py-8 text-center text-slate-500 text-base">
                No se pudo cargar la información de URLs.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Mis API Keys (BYOK) */}
      {isByokModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-300 w-full max-w-lg p-6 shadow-2xl relative">
            <button
              onClick={() => setIsByokModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center font-bold">
                <Key className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Mis API Keys (BYOK)</h3>
                <p className="text-base text-slate-500">
                  Usa tus propias credenciales para consultas ilimitadas.
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveByok} className="space-y-4">
              <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3.5 text-base text-amber-900 leading-relaxed">
                Tus claves se guardan localmente en tu navegador. Al ingresar tu propia API Key de OpenAI, podrás usar el modelo <strong>GPT-4o Mini</strong> de forma directa e independiente.
              </div>

              <div>
                <label className="block text-base font-semibold text-slate-800 mb-1">
                  Google Gemini API Key
                </label>
                <input
                  type="password"
                  value={customGeminiKey}
                  onChange={(e) => setCustomGeminiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full px-3.5 py-2.5 text-base border border-slate-300 rounded-xl bg-slate-50 focus:bg-white font-mono outline-none"
                />
                <span className="text-xs text-slate-500 mt-1 block">
                  Opcional. Si la dejas vacía, se utilizará la clave de Gemini del sistema.
                </span>
              </div>

              <div>
                <label className="block text-base font-semibold text-slate-800 mb-1">
                  OpenAI API Key
                </label>
                <input
                  type="password"
                  value={customOpenaiKey}
                  onChange={(e) => setCustomOpenaiKey(e.target.value)}
                  placeholder="sk-proj-..."
                  className="w-full px-3.5 py-2.5 text-base border border-slate-300 rounded-xl bg-slate-50 focus:bg-white font-mono outline-none"
                />
                <span className="text-xs text-slate-500 mt-1 block">
                  Permite activar OpenAI GPT-4o Mini incluso si no está habilitado por el administrador.
                </span>
              </div>

              {byokSavedMessage && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-base font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>Claves guardadas exitosamente en tu navegador.</span>
                </div>
              )}

              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setCustomGeminiKey("");
                    setCustomOpenaiKey("");
                    if (typeof window !== "undefined") {
                      localStorage.removeItem("scrapio_byok_gemini");
                      localStorage.removeItem("scrapio_byok_openai");
                    }
                    alert("Claves eliminadas del almacenamiento local.");
                  }}
                  className="px-4 py-2 text-base text-slate-600 hover:text-red-600 font-semibold cursor-pointer"
                >
                  Restablecer
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsByokModalOpen(false)}
                    className="px-4 py-2 border border-slate-300 rounded-xl text-base font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base px-5 py-2 rounded-xl shadow-sm flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    <span>Guardar Claves</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Panel Administrador - Gestión de Usuarios y Proyectos */}
      {isAdminModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-300 w-full max-w-4xl p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
            <button
              onClick={() => setIsAdminModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-purple-50 border border-purple-200 text-purple-600 flex items-center justify-center font-bold">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Panel de Administración de Usuarios</h3>
                <p className="text-base text-slate-500">
                  Asigna proyectos a cada usuario y autoriza acceso a modelos de IA. Un proyecto puede estar asignado a múltiples usuarios.
                </p>
              </div>
            </div>

            {adminSuccessMsg && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-base font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>{adminSuccessMsg}</span>
              </div>
            )}

            {isLoadingAdminUsers ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
                <span className="text-base text-slate-600 font-medium">
                  Cargando usuarios desde Clerk...
                </span>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {adminUsers.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-base">
                    No hay otros usuarios registrados en el sistema.
                  </div>
                ) : (
                  adminUsers.map((u) => {
                    const isSelf = u.id === currentUserInfo?.userId || u.email.toLowerCase() === (currentUserInfo?.email || "").toLowerCase();

                    return (
                      <div
                        key={u.id}
                        className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-50 transition-colors space-y-3"
                      >
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-slate-900 text-white font-bold text-base flex items-center justify-center">
                              {(u.firstName?.[0] || u.email?.[0] || "U").toUpperCase()}
                            </div>
                            <div>
                              <div className="text-base font-bold text-slate-900 flex items-center gap-2">
                                <span>{u.firstName || u.lastName ? `${u.firstName} ${u.lastName}`.trim() : "Usuario"}</span>
                                {isSelf && (
                                  <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold">
                                    Tú
                                  </span>
                                )}
                              </div>
                              <div className="text-sm font-mono text-slate-500">{u.email}</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                                u.role === "admin"
                                  ? "bg-purple-100 text-purple-800 border-purple-300"
                                  : "bg-blue-50 text-blue-700 border-blue-200"
                              }`}
                            >
                              {u.role === "admin" ? "Administrador" : "Usuario"}
                            </span>

                            {!isSelf && (
                              <button
                                onClick={() => handleDeleteUser(u.id, u.email)}
                                title="Eliminar usuario"
                                className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Configuración de Permisos */}
                        <div className="pt-2 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Permiso de Proyectos */}
                          <div>
                            <span className="block text-sm font-semibold text-slate-700 uppercase tracking-wider mb-2">
                              Proyectos / Namespaces Asignados:
                            </span>
                            {u.role === "admin" ? (
                              <div className="text-sm text-purple-700 font-semibold bg-purple-50 p-2 rounded-lg border border-purple-200">
                                ⭐ Acceso total a todos los proyectos del sistema.
                              </div>
                            ) : (
                              <div className="space-y-1.5 max-h-36 overflow-y-auto p-2 bg-white rounded-lg border border-slate-200">
                                {availableNamespaces.map((ns) => {
                                  const isAssigned = (u.allowedNamespaces || []).includes(ns.name);
                                  return (
                                    <label
                                      key={ns.name}
                                      className="flex items-center gap-2 text-base text-slate-800 hover:bg-slate-50 p-1 rounded cursor-pointer"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isAssigned}
                                        onChange={(e) => {
                                          const nextNamespaces = e.target.checked
                                            ? [...(u.allowedNamespaces || []), ns.name]
                                            : (u.allowedNamespaces || []).filter((n: string) => n !== ns.name);

                                          // Actualizar estado local inmediatamente
                                          setAdminUsers((prev) =>
                                            prev.map((item) =>
                                              item.id === u.id
                                                ? { ...item, allowedNamespaces: nextNamespaces }
                                                : item
                                            )
                                          );
                                        }}
                                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                                      />
                                      <span className="font-mono text-sm">{ns.name}</span>
                                      <span className="text-xs text-slate-500">
                                        ({getClientDisplayName(ns.name)})
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Permiso de Modelos */}
                          <div className="space-y-3">
                            <span className="block text-sm font-semibold text-slate-700 uppercase tracking-wider mb-2">
                              Permisos de Modelos de IA:
                            </span>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-lg">
                                <div>
                                  <div className="text-sm font-bold text-emerald-950">Gemini 3.8 Flash</div>
                                  <div className="text-xs text-emerald-700">Por defecto para todos</div>
                                </div>
                                <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                                  Habilitado
                                </span>
                              </div>

                              <div className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg">
                                <div>
                                  <div className="text-sm font-bold text-slate-900">OpenAI GPT-4o Mini</div>
                                  <div className="text-xs text-slate-500">Uso de saldo del sistema</div>
                                </div>
                                {u.role === "admin" ? (
                                  <span className="text-xs font-bold text-purple-800 bg-purple-100 px-2 py-0.5 rounded">
                                    Ilimitado (Admin)
                                  </span>
                                ) : (
                                  <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(u.canUseOpenAI)}
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        setAdminUsers((prev) =>
                                          prev.map((item) =>
                                            item.id === u.id
                                              ? { ...item, canUseOpenAI: checked }
                                              : item
                                          )
                                        );
                                      }}
                                      className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                  </label>
                                )}
                              </div>
                            </div>

                            {u.role !== "admin" && (
                              <button
                                onClick={() =>
                                  handleUpdateUserPermissions(
                                    u.id,
                                    u.allowedNamespaces || [],
                                    Boolean(u.canUseOpenAI)
                                  )
                                }
                                className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm py-2 px-3 rounded-lg shadow-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                              >
                                <Save className="w-4 h-4" />
                                <span>Guardar cambios para {u.firstName || u.email.split("@")[0]}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            <div className="pt-4 mt-2 border-t border-slate-200 flex items-center justify-between">
              <span className="text-sm text-slate-500">
                Los cambios aplican de inmediato en la sesión del usuario.
              </span>
              <button
                onClick={() => setIsAdminModalOpen(false)}
                className="bg-slate-900 text-white text-base font-semibold px-5 py-2.5 rounded-xl hover:bg-slate-800 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
