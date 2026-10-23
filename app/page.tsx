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
  Play,
  Eye,
  EyeOff,
  Menu,
  Terminal,
  Activity,
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
  runId?: number;
  runNumber?: number;
  status: "queued" | "in_progress" | "completed" | "idle" | "unknown";
  conclusion?: "success" | "failure" | null;
  progressPercent: number;
  currentStepName: string;
  failedStepName?: string;
  stepsSummary?: { name: string; status: string; conclusion: string | null }[];
  htmlUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  processedUrls?: number;
  totalUrls?: number;
  remainingUrls?: number;
  currentUrl?: string;
  quotaExhausted?: boolean;
  provider?: string;
}

const inferUrlFromNamespace = (nsName: string) => {
  if (!nsName) return "";
  const clean = nsName.toLowerCase().replace(/^cliente-/, "").replace(/^pb_/, "");
  if (!clean) return "";
  if (clean.includes("avafin")) return "https://www.avafin.mx";
  if (clean.includes("personalbliss")) return "https://personalbliss.org";
  return `https://www.${clean.replace(/_/g, "-")}.com`;
};

const getClientDisplayName = (ns: string): string => {
  if (!ns) return "Sin cliente seleccionado";
  const clean = ns.replace(/^cliente-/, "").replace(/^pb_/, "").replace(/_/g, " ").replace(/-/g, " ");
  return clean
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
};

const getClientDomain = (ns: string): string => {
  if (!ns) return "";
  const clean = ns.toLowerCase().replace(/^cliente-/, "").replace(/^pb_/, "");
  if (!clean) return "";
  if (clean.includes("avafin")) return "avafin.mx";
  if (clean.includes("personalbliss")) return "personalbliss.org";
  return `${clean.replace(/_/g, "-")}.com`;
};

const getClientInitials = (ns: string): string => {
  if (!ns) return "SC";
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

const getWelcomeMessage = (ns: string): Message => {
  if (!ns) {
    return {
      id: "welcome-empty",
      role: "assistant",
      content: `¡Bienvenido a Scrapio! Tu cuenta está completamente aislada y limpia (0 proyectos o clientes asignados). Para comenzar, haz clic en **Rastrear sitio** o **+ Agregar nuevo cliente** para indexar tu primer sitio web.`,
      sources: [],
      tokens: 0,
      duration: "0,0 s",
    };
  }

  return {
    id: "welcome-" + ns,
    role: "assistant",
    content: `Conectado al conocimiento indexado de **${getClientDisplayName(ns)}** (\`${ns}\`). Las respuestas son sintetizadas exclusivamente desde su base vectorial de Pinecone. ¿Qué deseas consultar sobre este sitio?`,
    sources: [],
    tokens: 0,
    duration: "0,0 s",
  };
};

export default function Home() {
  const [namespace, setNamespace] = useState("");
  const [aiProvider, setAiProvider] = useState("gemini");
  const [availableNamespaces, setAvailableNamespaces] = useState<NamespaceInfo[]>([]);
  const [inputQuery, setInputQuery] = useState("");

  // Historial de mensajes aislado por cada namespace / cliente con persistencia
  const [messagesByNamespace, setMessagesByNamespace] = useState<Record<string, Message[]>>({});

  useEffect(() => {
    if (typeof window === "undefined" || !namespace) return;
    try {
      const stored = localStorage.getItem(`scrapio_chat_${namespace}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessagesByNamespace((prev) => ({
            ...prev,
            [namespace]: parsed,
          }));
        }
      }
    } catch (e) {
      console.error("Error cargando historial de chat de localStorage:", e);
    }
  }, [namespace]);

  const messages = messagesByNamespace[namespace] || [getWelcomeMessage(namespace)];

  const setMessages = (updater: Message[] | ((prev: Message[]) => Message[])) => {
    setMessagesByNamespace((prev) => {
      const current = prev[namespace] || [getWelcomeMessage(namespace)];
      const nextMessages = typeof updater === "function" ? updater(current) : updater;
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(`scrapio_chat_${namespace}`, JSON.stringify(nextMessages));
        } catch (e) {
          console.error("Error guardando historial de chat en localStorage:", e);
        }
      }
      return {
        ...prev,
        [namespace]: nextMessages,
      };
    });
  };

  const handleClearChat = () => {
    const welcome = [getWelcomeMessage(namespace)];
    setMessagesByNamespace((prev) => ({
      ...prev,
      [namespace]: welcome,
    }));
    if (typeof window !== "undefined") {
      localStorage.removeItem(`scrapio_chat_${namespace}`);
    }
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

  const [indexingSingleUrl, setIndexingSingleUrl] = useState<string | null>(null);
  const [singleIndexStatus, setSingleIndexStatus] = useState<{ url: string; success: boolean; message: string } | null>(null);

  const handleIndexSingleUrl = async (urlToIndex: string) => {
    if (indexingSingleUrl) return;
    setIndexingSingleUrl(urlToIndex);
    setSingleIndexStatus(null);

    const activeCustomKey = (aiProvider === "openai" ? customOpenaiKey : customGeminiKey).trim() || undefined;

    try {
      const res = await fetch("/api/urls/index-single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: urlToIndex,
          namespace,
          aiProvider,
          customApiKey: activeCustomKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al indexar la URL.");

      setSingleIndexStatus({ url: urlToIndex, success: true, message: data.message });

      // Actualizar estado local del modal de auditoría
      setUrlsAuditData((prev) => {
        if (!prev) return null;
        const nextPending = prev.pendingUrls.filter((u) => u !== urlToIndex);
        const nextIndexed = [urlToIndex, ...prev.indexedUrls];
        const totalIndexed = nextIndexed.length;
        const totalDiscovered = prev.totalDiscovered;
        const progressPercent = totalDiscovered > 0 ? Math.round((totalIndexed / totalDiscovered) * 100) : 100;

        return {
          ...prev,
          pendingUrls: nextPending,
          indexedUrls: nextIndexed,
          totalIndexed,
          totalPending: nextPending.length,
          progressPercent,
        };
      });

      // Refrescar lista de namespaces en segundo plano
      fetchNamespaces();
    } catch (err: any) {
      setSingleIndexStatus({ url: urlToIndex, success: false, message: err.message });
    } finally {
      setIndexingSingleUrl(null);
    }
  };

  const [deletingSingleUrl, setDeletingSingleUrl] = useState<string | null>(null);

  const handleDeleteSingleUrl = async (urlToDelete: string) => {
    if (deletingSingleUrl) return;
    if (!confirm(`¿Eliminar los vectores asociados a esta URL de Pinecone?\n\n${urlToDelete}`)) return;

    setDeletingSingleUrl(urlToDelete);
    setSingleIndexStatus(null);

    const activeNs = urlsAuditData?.namespace || namespace;

    try {
      const res = await fetch(
        `/api/urls?namespace=${encodeURIComponent(activeNs)}&url=${encodeURIComponent(urlToDelete)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al eliminar la URL.");

      setSingleIndexStatus({ url: urlToDelete, success: true, message: data.message });

      // Actualizar estado local del modal de auditoría
      setUrlsAuditData((prev) => {
        if (!prev) return null;
        const nextIndexed = prev.indexedUrls.filter((u) => u !== urlToDelete);
        const nextPending = [urlToDelete, ...prev.pendingUrls];
        const totalIndexed = nextIndexed.length;
        const totalDiscovered = prev.totalDiscovered;
        const progressPercent = totalDiscovered > 0 ? Math.round((totalIndexed / totalDiscovered) * 100) : 0;

        return {
          ...prev,
          indexedUrls: nextIndexed,
          pendingUrls: nextPending,
          totalIndexed,
          totalPending: nextPending.length,
          progressPercent,
        };
      });

      fetchNamespaces();
    } catch (err: any) {
      setSingleIndexStatus({ url: urlToDelete, success: false, message: err.message });
    } finally {
      setDeletingSingleUrl(null);
    }
  };

  const openUrlsAudit = async (targetNs?: string) => {
    const ns = targetNs || namespace;
    setIsUrlsAuditModalOpen(true);
    setIsLoadingUrlsAudit(true);
    setUrlsSearchFilter("");
    setSingleIndexStatus(null);
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
  const { user: clerkUser, isLoaded: isClerkLoaded, isSignedIn } = useUser();
  const [currentUserInfo, setCurrentUserInfo] = useState<{
    userId?: string;
    email: string;
    name: string;
    isAdmin: boolean;
    allowedNamespaces: string[];
    canUseOpenAI: boolean;
    canUseGemini: boolean;
    apiKey?: string;
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
  const [scrapioApiKey, setScrapioApiKey] = useState<string>("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [isRegeneratingKey, setIsRegeneratingKey] = useState(false);

  const handleRegenerateKey = async () => {
    if (!confirm("¿Deseas generar una nueva Scrapio API Key? La clave anterior quedará invalidada inmediatamente.")) {
      return;
    }
    setIsRegeneratingKey(true);
    try {
      const res = await fetch("/api/me", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.apiKey) {
        setScrapioApiKey(data.apiKey);
        if (currentUserInfo) {
          setCurrentUserInfo({ ...currentUserInfo, apiKey: data.apiKey });
        }
      } else {
        alert("Error al regenerar clave: " + (data.error || "Error desconocido"));
      }
    } catch (err: any) {
      alert("Error de conexión: " + err.message);
    } finally {
      setIsRegeneratingKey(false);
    }
  };

  // Estado de Ingesta / Rastreo
  const [scanUrl, setScanUrl] = useState("");
  const [scanNamespace, setScanNamespace] = useState("");
  const [scanMaxPages, setScanMaxPages] = useState("100");
  const [scanAiProvider, setScanAiProvider] = useState<string>("gemini");
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [ingestStatus, setIngestStatus] = useState<IngestStatus | null>(null);
  const [isPollingStatus, setIsPollingStatus] = useState(false);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Consultas del día diferenciadas por proveedor de IA (persistidas en localStorage con reset diario)
  const [geminiQueries, setGeminiQueries] = useState(0);
  const [openaiQueries, setOpenaiQueries] = useState(0);
  const [isQuotaExhausted, setIsQuotaExhausted] = useState(false);

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
        if (data.apiKey) {
          setScrapioApiKey(data.apiKey);
        }
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
    canUseOpenAI: boolean,
    canUseGemini: boolean = true
  ) => {
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, allowedNamespaces, canUseOpenAI, canUseGemini }),
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
          if (!exists || !namespace) {
            setNamespace(data.namespaces[0].name);
          }
        } else {
          setNamespace("");
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

      // Control de fecha para reinicio automático diario (medianoche)
      const today = new Date().toISOString().slice(0, 10);
      const storedDate = localStorage.getItem("scrapio_queries_date");
      if (storedDate !== today) {
        localStorage.setItem("scrapio_queries_date", today);
        localStorage.setItem("scrapio_queries_gemini", "0");
        localStorage.setItem("scrapio_queries_openai", "0");
        setGeminiQueries(0);
        setOpenaiQueries(0);
      } else {
        const storedGemini = localStorage.getItem("scrapio_queries_gemini");
        const storedOpenai = localStorage.getItem("scrapio_queries_openai");
        if (storedGemini !== null) setGeminiQueries(parseInt(storedGemini, 10) || 0);
        if (storedOpenai !== null) setOpenaiQueries(parseInt(storedOpenai, 10) || 0);
      }
    }
  }, []);

  // Sincronizar namespaces y perfil en cuanto Clerk termina de cargar la sesión activa
  useEffect(() => {
    if (isClerkLoaded && isSignedIn) {
      fetchUserInfo();
      fetchNamespaces();
    }
  }, [isClerkLoaded, isSignedIn]);

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
    if (!namespace) {
      alert("Primero debes indexar o seleccionar un cliente para realizar consultas.");
      openNewSiteModal();
      return;
    }
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

      if (!res.ok) {
        if (res.status === 429 || data.quotaExhausted) {
          setIsQuotaExhausted(true);
        }
        throw new Error(data.error || "Error al procesar consulta.");
      }

      setIsQuotaExhausted(false);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.answer,
        sources: data.sources || [],
        tokens: tokensEstimated,
        duration: elapsed,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      const today = new Date().toISOString().slice(0, 10);
      if (typeof window !== "undefined") localStorage.setItem("scrapio_queries_date", today);

      if (aiProvider === "gemini") {
        setGeminiQueries((prev) => {
          const next = prev + 1;
          if (typeof window !== "undefined") localStorage.setItem("scrapio_queries_gemini", next.toString());
          return next;
        });
      } else {
        setOpenaiQueries((prev) => {
          const next = prev + 1;
          if (typeof window !== "undefined") localStorage.setItem("scrapio_queries_openai", next.toString());
          return next;
        });
      }
    } catch (err: any) {
      const is429 = err.message?.includes("429") || err.message?.includes("RESOURCE_EXHAUSTED") || err.message?.includes("cuota");
      if (is429) setIsQuotaExhausted(true);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: is429
            ? `⚠️ Límite de cuota alcanzado (${aiProvider === "gemini" ? "Google Gemini" : "OpenAI"} HTTP 429). Si usas tu propia API Key, ten en cuenta que las consultas realizadas en otras aplicaciones externas también descuentan de tu cuota. Puedes ingresar otra clave en Ajustes de API.`
            : `❌ Ocurrió un error: ${err.message}`,
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
      const selectedEngine = scanAiProvider || aiProvider;
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: scanUrl.trim(),
          clientNamespace: scanNamespace.trim(),
          maxPages: parseInt(scanMaxPages, 10) || 100,
          aiProvider: selectedEngine,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al enviar la orden de escaneo.");

      setScanStatus({ type: "success", message: data.message });
      setIsPollingStatus(true);
      setTimeout(checkIngestStatus, 2500);
      setNamespace(scanNamespace.trim());
      setAiProvider(selectedEngine);
      setTimeout(() => fetchNamespaces(), 5000);
    } catch (err: any) {
      setScanStatus({ type: "error", message: err.message });
    } finally {
      setIsScanning(false);
    }
  };

  const openUpdateModal = () => {
    const targetNs = namespace || (availableNamespaces.length > 0 ? availableNamespaces[0].name : "");
    setScanNamespace(targetNs);
    setScanUrl(inferUrlFromNamespace(targetNs));
    setScanStatus(null);
    setScanAiProvider(aiProvider);
    setIsModalOpen(true);
  };

  const openNewSiteModal = () => {
    setScanNamespace("");
    setScanUrl("");
    setScanStatus(null);
    setScanAiProvider(aiProvider);
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
  const activeVectors = activeNamespaceObj?.vectorCount || 0;

  return (
    <div className="min-h-screen flex antialiased select-none font-sans text-slate-800 text-base" style={{ backgroundColor: "#CCD6E0", color: "#0F172A" }}>
      {/* Backdrop overlay for mobile drawer */}
      {isMobileSidebarOpen && (
        <div
          onClick={() => setIsMobileSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs lg:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* BEGIN: Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 z-50 lg:z-auto h-screen w-80 bg-[#F6F8FB] border-r border-[#DCE4EC] flex flex-col justify-between shrink-0 px-5 py-6 select-none transition-transform duration-300 ease-in-out shadow-2xl lg:shadow-none overflow-y-auto ${
          isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
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
                <button
                  type="button"
                  onClick={() => setIsMobileSidebarOpen(false)}
                  className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors cursor-pointer"
                  title="Cerrar menú"
                  aria-label="Cerrar menú"
                >
                  <X className="w-5 h-5" />
                </button>
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
              onClick={() => {
                setIsMobileSidebarOpen(false);
                setIsClientSelectorOpen(true);
              }}
              className="mt-1 bg-white border border-[#DCE4ED] rounded-xl p-3.5 shadow-xs hover:border-slate-300 transition-colors cursor-pointer group"
              style={{ backgroundColor: "rgb(255, 255, 255)", border: "1px solid rgb(226, 232, 240)" }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl font-bold text-base flex items-center justify-center shrink-0 ${
                    namespace ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 border border-slate-200"
                  }`}>
                    {namespace ? getClientInitials(namespace) : "--"}
                  </div>
                  <div className="overflow-hidden">
                    <div className="text-base font-bold text-slate-900 truncate">
                      {namespace ? getClientDisplayName(namespace) : "Sin cliente asignado"}
                    </div>
                    <div className="text-sm text-slate-500 truncate">
                      {namespace
                        ? `${getClientDomain(namespace)} · ${activeVectors.toLocaleString()} vectores`
                        : "0 proyectos · 0 vectores"}
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

            <button
              onClick={() => {
                setIsMobileSidebarOpen(false);
                openNewSiteModal();
              }}
              className="mt-3 px-1 text-base font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span className="text-lg font-normal leading-none">+</span>
              <span>Nuevo espacio de cliente</span>
            </button>
          </div>

          {/* Work Section Menu Links */}
          <nav className="space-y-1.5">
            <div className="px-1 pb-1.5 text-base font-semibold tracking-wider text-slate-500 uppercase">
              Trabajo
            </div>
            {/* Active Link: Consulta */}
            <button
              onClick={() => setIsMobileSidebarOpen(false)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#E0E7FF] text-[#2563EB] font-semibold text-base shadow-2xs cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <MessageSquare className="w-5 h-5 text-[#2563EB]" />
                <span>Consulta</span>
              </div>
            </button>

            {/* Clientes */}
            <button
              onClick={() => {
                setIsMobileSidebarOpen(false);
                setIsClientSelectorOpen(true);
              }}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-slate-700 hover:bg-slate-200/50 font-semibold text-base transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-slate-500" />
                <span>Clientes</span>
              </div>
              <span className="text-base font-bold text-slate-500">
                {availableNamespaces.length}
              </span>
            </button>

            {/* Rastreos & Auditoría de URLs */}
            <button
              onClick={() => {
                setIsMobileSidebarOpen(false);
                openUrlsAudit();
              }}
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
              onClick={() => {
                setIsMobileSidebarOpen(false);
                if (!scrapioApiKey) {
                  fetchUserInfo();
                }
                setIsDocsModalOpen(true);
              }}
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
              onClick={() => {
                setIsMobileSidebarOpen(false);
                setIsByokModalOpen(true);
              }}
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
                  setIsMobileSidebarOpen(false);
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

        {/* Bottom System Status Card - Versión Compacta y Minimalista */}
        {(() => {
          const isUsingBYOK = Boolean((aiProvider === "openai" ? customOpenaiKey : customGeminiKey).trim());
          const currentQueries = aiProvider === "gemini" ? geminiQueries : openaiQueries;

          return (
            <div
              className={`rounded-xl p-3 shadow-2xs space-y-2 border transition-all duration-200 ${
                isQuotaExhausted
                  ? "bg-amber-50/70 border-amber-300"
                  : "bg-white border-slate-200/90"
              }`}
            >
              {/* Fila 1: Modelo y Tag de Clave */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${aiProvider === "gemini" ? "bg-blue-600" : "bg-emerald-600"}`}></span>
                  <span className="text-xs font-bold text-slate-900">
                    {aiProvider === "gemini" ? "Gemini 3.8 Flash" : "GPT-4o Mini"}
                  </span>
                </div>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                    isUsingBYOK
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : "bg-slate-100 text-slate-600 border-slate-200"
                  }`}
                >
                  {isUsingBYOK ? "BYOK" : "Sistema"}
                </span>
              </div>

              {/* Fila 2: Contador y Estado */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                <span className="text-slate-500 text-[11px]">
                  Consultas hoy: <strong className="text-slate-800 font-bold">{currentQueries}</strong>
                </span>
                {isQuotaExhausted ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                    Cuota 429
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Activo
                  </span>
                )}
              </div>

              {/* Fila 3: Aviso discreto solo si la cuota está agotada */}
              {isQuotaExhausted && (
                <div className="pt-1.5 border-t border-amber-200/70 text-[11px] text-amber-800 leading-tight">
                  Límite de cuota alcanzado (por uso en Scrapio o consumo externo).
                </div>
              )}
            </div>
          );
        })()}
      </aside>
      {/* END: Sidebar */}

      {/* BEGIN: MainContent */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#CCD6E0] overflow-y-auto">
        {/* Top Header Bar */}
        <header
          className="border-b border-[#D8E1EA] px-4 sm:px-6 lg:px-8 py-3.5 sm:py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sticky top-0 z-30 shadow-2xs"
          style={{
            backgroundColor: "rgb(255, 255, 255)",
            borderBottom: "1px solid rgb(203, 213, 225)",
            boxShadow: "rgba(0, 0, 0, 0.05) 0px 1px 3px 0px",
          }}
        >
          <div className="flex items-center gap-3">
            {/* Mobile hamburger menu toggle */}
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl text-slate-700 hover:bg-slate-100 border border-slate-200 cursor-pointer shrink-0 transition-colors"
              title="Abrir menú"
              aria-label="Abrir menú"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 leading-snug">Consulta</h2>
              <p className="text-xs sm:text-base text-slate-600 mt-0.5 line-clamp-1 sm:line-clamp-none">
                {namespace ? (
                  <>
                    Respuestas sintetizadas solo desde el conocimiento indexado de{" "}
                    <span className="font-bold text-slate-800">{getClientDisplayName(namespace)}</span>.
                  </>
                ) : (
                  "Tu espacio está limpio y aislado (0 clientes). Indexa o agrega tu primer sitio para comenzar."
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {/* Live crawling chip indicator (clickable for logs modal) */}
            {ingestStatus?.status === "in_progress" ? (
              <button
                type="button"
                onClick={() => setIsLogsModalOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-full bg-[#FEF3C7]/90 text-[#92400E] text-xs sm:text-base font-semibold border border-[#FDE68A] hover:bg-amber-100 transition-colors cursor-pointer"
                title="Rastreo en curso. Haz clic para ver detalles y logs"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                <span>
                  {ingestStatus.totalUrls && ingestStatus.totalUrls > 0
                    ? `1 en curso · ${ingestStatus.processedUrls || 0}/${ingestStatus.totalUrls} (${ingestStatus.progressPercent}%)`
                    : `1 en curso · ${ingestStatus.progressPercent}%`}
                </span>
                <Terminal className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-75" />
              </button>
            ) : ingestStatus?.conclusion === "failure" ? (
              <button
                type="button"
                onClick={() => setIsLogsModalOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-full bg-red-50 text-red-900 text-xs sm:text-base font-semibold border border-red-300 hover:bg-red-100 transition-colors cursor-pointer"
                title="El último escaneo falló. Haz clic para ver qué ocurrió y abrir logs"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span>
                <span>Falló · Ver logs</span>
                <Terminal className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-75" />
              </button>
            ) : ingestStatus?.quotaExhausted ? (
              <button
                type="button"
                onClick={() => setIsLogsModalOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-full bg-amber-50 text-amber-900 text-xs sm:text-base font-semibold border border-amber-300 hover:bg-amber-100 transition-colors cursor-pointer"
                title="Límite de tokens alcanzado. Haz clic para ver detalles"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-amber-600"></span>
                <span>
                  Límite alcanzado · {ingestStatus.processedUrls}/{ingestStatus.totalUrls} URLs
                </span>
                <Terminal className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-75" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsLogsModalOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-full bg-emerald-50 text-emerald-800 text-xs sm:text-base font-semibold border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer"
                title="Listo. Haz clic para ver el registro del último escaneo y logs"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span>Listo · Ver logs</span>
                <Terminal className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-75" />
              </button>
            )}

            {/* Engine selector pill */}
            <div
              onClick={() => setAiProvider(aiProvider === "gemini" ? "openai" : "gemini")}
              className="bg-white border border-[#94A3B8] px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-base font-semibold text-slate-800 shadow-2xs hover:bg-slate-50 cursor-pointer transition-colors"
              title="Haz clic para alternar entre Gemini y OpenAI"
            >
              Motor: {aiProvider === "gemini" ? "Gemini" : "OpenAI"}
            </div>

            {/* Primary crawl trigger button */}
            <button
              onClick={openUpdateModal}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white px-3.5 sm:px-5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-base font-semibold shadow-xs flex items-center gap-2 transition-all cursor-pointer"
            >
              <span>Rastrear sitio</span>
            </button>
          </div>
        </header>

        {/* Content Workspace */}
        <div className="max-w-6xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 flex-1 flex flex-col space-y-4 sm:space-y-6">
          {/* Active Namespace Subheader Banner */}
          <section
            className="bg-white border border-[#94A3B8] rounded-xl px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs"
            data-purpose="namespace-bar"
          >
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-sm sm:text-base">
              <span className="bg-[#EEF2FF] text-[#4F46E5] font-bold text-xs sm:text-base px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-md border border-indigo-200">
                {namespace ? "Namespace aislado" : "Sin proyecto"}
              </span>
              <span className="font-mono text-slate-900 font-bold truncate max-w-[130px] sm:max-w-none">
                {namespace || "Ninguno seleccionado"}
              </span>
              {namespace ? (
                <>
                  <span className="text-slate-400 hidden sm:inline">·</span>
                  <span className="text-slate-600 text-xs sm:text-base">
                    {Math.round(activeVectors / 15) || 0} páginas · {activeVectors.toLocaleString()} vectores
                  </span>
                  <span className="text-slate-400 hidden sm:inline">·</span>
                  <button
                    onClick={() => openUrlsAudit()}
                    className="text-xs sm:text-base font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer flex items-center gap-1.5"
                    title="Ver lista de URLs indexadas vs las que faltan por rastrear"
                  >
                    <span>🔍 Ver URLs</span>
                  </button>
                </>
              ) : (
                <>
                  <span className="text-slate-400 hidden sm:inline">·</span>
                  <span className="text-slate-500 text-xs sm:text-base">0 páginas · 0 vectores</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {messages.length > 1 && namespace && (
                <button
                  onClick={handleClearChat}
                  title="Limpiar conversación actual"
                  className="text-xs sm:text-base text-slate-500 hover:text-red-600 border border-[#DCE4ED] bg-white px-2.5 sm:px-3 py-1.5 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>Limpiar</span>
                </button>
              )}
              <button
                onClick={() => setIsClientSelectorOpen(true)}
                className="text-xs sm:text-base font-semibold text-slate-800 hover:text-slate-950 border border-[#DCE4ED] bg-slate-50 hover:bg-white px-3 sm:px-4 py-1.5 rounded-xl transition-colors cursor-pointer"
              >
                {availableNamespaces.length > 0 ? "Cambiar cliente" : "Clientes (0)"}
              </button>
            </div>
          </section>

          {/* Chat Thread Section */}
          <section className="space-y-4 sm:space-y-6 flex-1 flex flex-col justify-center" data-purpose="chat-thread">
            {availableNamespaces.length === 0 ? (
              <div className="bg-white border border-[#94A3B8] rounded-2xl p-6 sm:p-10 shadow-2xs text-center space-y-4 max-w-xl mx-auto my-6">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center mx-auto shadow-2xs">
                  <Database className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900">
                    Tu cuenta está completamente limpia (0 namespaces)
                  </h3>
                  <p className="text-sm text-slate-600 max-w-md mx-auto mt-1 leading-relaxed">
                    No tienes ningún cliente ni datos compartidos de otras cuentas. Agrega e indexa tu primer sitio web para comenzar a realizar consultas RAG semánticas.
                  </p>
                </div>
                <div className="pt-2">
                  <button
                    onClick={openNewSiteModal}
                    className="inline-flex items-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-xs transition-all cursor-pointer"
                  >
                    <span>+ Agregar y rastrear mi primer cliente</span>
                  </button>
                </div>
              </div>
            ) : (
              messages.map((msg) => {
                if (msg.role === "user") {
                  return (
                    <div key={msg.id} className="flex justify-end">
                      <div className="max-w-[90%] sm:max-w-2xl bg-[#1E293B] text-white text-sm sm:text-base px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl rounded-tr-xs shadow-sm font-normal leading-relaxed break-words">
                        {msg.content}
                      </div>
                    </div>
                  );
                }

                return (
                  <article
                    key={msg.id}
                    className="bg-white border border-[#94A3B8] rounded-2xl p-4 sm:p-6 shadow-2xs space-y-4 sm:space-y-5 overflow-hidden"
                    data-purpose="assistant-response"
                  >
                    {/* Card Header info */}
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100 flex-wrap gap-2">
                      <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
                        <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-bold text-sm sm:text-base flex items-center justify-center shrink-0">
                          S
                        </div>
                        <span className="font-bold text-sm sm:text-base text-slate-900">Scrapio</span>
                        <span className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg bg-emerald-50 text-emerald-800 text-xs sm:text-base font-semibold border border-emerald-200">
                          {msg.sources && msg.sources.length > 0 ? `${msg.sources.length} fuentes` : "Base RAG"}
                        </span>
                      </div>
                      <div className="text-xs sm:text-base text-slate-500 font-mono">
                        {msg.tokens || 1284} tokens · {msg.duration || "1,9 s"}
                      </div>
                    </div>

                    {/* Synthesized Answer Text */}
                    <div className="overflow-x-auto">
                      {renderMessageContent(msg.content)}
                    </div>

                    {/* Evidence & Indexed Pages Section */}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="pt-2">
                        <div className="text-xs sm:text-base font-bold text-slate-500 uppercase tracking-wider mb-2.5">
                          Evidencia · Páginas indexadas consultadas
                        </div>
                        <div className="space-y-2 sm:space-y-2.5">
                          {msg.sources.map((url, idx) => {
                            const score = (0.93 - idx * 0.04).toFixed(2);
                            return (
                              <div
                                key={idx}
                                className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-3.5 rounded-xl border border-[#cbd5e1] hover:border-slate-400 hover:bg-[#dfe7f1] transition-all bg-[#EEF3F8] gap-2"
                              >
                                <div className="flex items-start gap-2.5 sm:gap-3 overflow-hidden">
                                  <span className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-800 text-xs sm:text-base font-bold flex items-center justify-center shrink-0 border border-emerald-200 mt-0.5 sm:mt-0">
                                    {idx + 1}
                                  </span>
                                  <div className="overflow-hidden">
                                    <h4 className="text-sm sm:text-base font-bold text-slate-900 leading-snug truncate">
                                      {extractTitleFromUrl(url)}
                                    </h4>
                                    <a
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs sm:text-base font-mono text-slate-600 hover:text-blue-700 hover:underline mt-0.5 block truncate"
                                    >
                                      {formatUrlDisplay(url)}
                                    </a>
                                  </div>
                                </div>
                                <div className="text-xs sm:text-base font-mono font-bold text-slate-800 bg-slate-200/80 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg self-end sm:self-auto shrink-0">
                                  {score}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Action buttons inside response */}
                        <div className="flex flex-wrap items-center gap-2 mt-3 pt-2">
                          <button
                            onClick={() => copyMessageContent(msg.id, msg.content, msg.sources)}
                            className="px-3 py-1.5 text-slate-700 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs sm:text-base font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
                          >
                            {copiedMsgId === msg.id ? <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600" /> : null}
                            <span>{copiedMsgId === msg.id ? "Copiado" : "Copiar con citas"}</span>
                          </button>
                          <button
                            onClick={() => exportToMarkdown(msg.content, msg.sources)}
                            className="px-3 py-1.5 text-slate-700 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs sm:text-base font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
                          >
                            <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
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
                            className="px-3 py-1.5 text-slate-700 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs sm:text-base font-semibold transition-colors cursor-pointer"
                          >
                            Ver fragmentos
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })
            )}

            {isLoading && (
              <div className="bg-white border border-[#94A3B8] rounded-2xl p-4 sm:p-6 shadow-2xs space-y-3 animate-pulse">
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-bold text-sm sm:text-base flex items-center justify-center">
                    S
                  </div>
                  <span className="font-bold text-sm sm:text-base text-slate-900">Scrapio RAG</span>
                  <span className="text-xs sm:text-base text-slate-600">
                    Consultando vectores en namespace <strong className="font-mono font-bold text-slate-900">{namespace}</strong>...
                  </span>
                </div>
                <div className="h-4 sm:h-5 bg-slate-100 rounded w-3/4"></div>
                <div className="h-4 sm:h-5 bg-slate-100 rounded w-1/2"></div>
              </div>
            )}
          </section>

          {/* Bottom Interactive Composer Bar Container */}
          <section className="space-y-3 pt-2" data-purpose="prompt-composer-container">
            {/* Prompt Box */}
            <form
              onSubmit={handleSubmit}
              className="bg-white border border-[#94A3B8] rounded-2xl p-3 sm:p-4 shadow-sm focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all"
            >
              <textarea
                value={inputQuery}
                disabled={!namespace || isLoading}
                onChange={(e) => setInputQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!namespace) {
                      openNewSiteModal();
                      return;
                    }
                    handleSubmit();
                  }
                }}
                className="w-full border-0 p-0 text-sm sm:text-base text-slate-900 placeholder-slate-400 focus:ring-0 resize-none font-normal leading-relaxed outline-none disabled:opacity-60"
                placeholder={
                  !namespace
                    ? "Agrega o selecciona un cliente para comenzar a consultar..."
                    : `Pregunta sobre precios, políticas, servicios o cualquier contenido indexado de ${getClientDisplayName(namespace)}...`
                }
                rows={2}
                style={{ backgroundColor: "transparent" }}
              />

              <div className="flex items-center justify-between pt-2.5 sm:pt-3 mt-1 border-t border-slate-100 flex-wrap gap-2 sm:gap-3">
                {/* Filter parameter pills: Both models visible and clickable */}
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  <span className="text-xs sm:text-base font-semibold text-slate-500 mr-1 hidden sm:inline">Modelo:</span>
                  {(() => {
                    const hasGeminiAccess = Boolean(
                      currentUserInfo?.isAdmin ||
                      currentUserInfo?.canUseGemini !== false ||
                      customGeminiKey.trim()
                    );

                    return (
                      <button
                        type="button"
                        onClick={() => {
                          if (hasGeminiAccess) {
                            setAiProvider("gemini");
                          } else {
                            setIsByokModalOpen(true);
                          }
                        }}
                        title={
                          hasGeminiAccess
                            ? "Modelo Google Gemini Flash disponible"
                            : "Restringido por el administrador. Haz clic para ingresar tu propia API Key (BYOK) y desbloquearlo."
                        }
                        className={`px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-xl border text-xs sm:text-base font-semibold transition-all cursor-pointer flex items-center gap-1.5 sm:gap-2 ${
                          aiProvider === "gemini"
                            ? "bg-[#2563EB] text-white border-[#2563EB] shadow-xs"
                            : hasGeminiAccess
                            ? "bg-slate-50 text-slate-700 border-[#DCE4ED] hover:bg-white"
                            : "bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200/60"
                        }`}
                      >
                        {!hasGeminiAccess && <Lock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400" />}
                        <span>Gemini Flash</span>
                        {customGeminiKey.trim() && (
                          <span className="text-[10px] sm:text-xs px-1.5 py-0.5 rounded bg-amber-400 text-amber-950 font-bold">
                            BYOK
                          </span>
                        )}
                        {aiProvider === "gemini" && <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-white"></span>}
                      </button>
                    );
                  })()}

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
                        className={`px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-xl border text-xs sm:text-base font-semibold transition-all cursor-pointer flex items-center gap-1.5 sm:gap-2 ${
                          aiProvider === "openai"
                            ? "bg-[#2563EB] text-white border-[#2563EB] shadow-xs"
                            : hasAccess
                            ? "bg-slate-50 text-slate-700 border-[#DCE4ED] hover:bg-white"
                            : "bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200/60"
                        }`}
                      >
                        {!hasAccess && <Lock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400" />}
                        <span>OpenAI GPT-4o Mini</span>
                        {customOpenaiKey.trim() && (
                          <span className="text-[10px] sm:text-xs px-1.5 py-0.5 rounded bg-amber-400 text-amber-950 font-bold">
                            BYOK
                          </span>
                        )}
                        {!hasAccess && (
                          <span className="text-[10px] sm:text-xs px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-bold">
                            Key
                          </span>
                        )}
                        {aiProvider === "openai" && <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-white"></span>}
                      </button>
                    );
                  })()}

                  <button
                    type="button"
                    title="Top-K: Cantidad de fragmentos más relevantes recuperados de Pinecone para alimentar el contexto de la IA (6 fragmentos)"
                    className="px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-xl border border-[#DCE4ED] bg-slate-50 text-xs sm:text-base font-semibold text-slate-700 hover:bg-white transition-colors cursor-help"
                  >
                    Top-K 6
                  </button>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading || !inputQuery.trim()}
                  className="bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-xs sm:text-base font-semibold px-4 sm:px-5 py-1.5 sm:py-2 rounded-xl transition-all shadow-xs flex items-center gap-2 cursor-pointer ml-auto"
                >
                  {isLoading ? <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" /> : null}
                  <span>Enviar</span>
                </button>
              </div>
            </form>

            {/* Quick Prompt Chips / Suggestions */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs sm:text-base scrollbar-none">
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
                  className="whitespace-nowrap px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl border border-[#94A3B8] text-slate-800 hover:bg-slate-50 text-xs sm:text-base font-medium shadow-2xs transition-colors cursor-pointer bg-white shrink-0"
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl border border-slate-300 w-full max-w-xl p-4 sm:p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
            <button
              onClick={() => setIsClientSelectorOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            <div className="flex items-center gap-3 mb-4 shrink-0 pr-8">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center font-bold shrink-0">
                <Database className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-slate-900">Seleccionar Espacio de Cliente</h3>
                <p className="text-xs sm:text-base text-slate-500">Alterna entre los sitios web aislados en Pinecone.</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {availableNamespaces.length === 0 ? (
                <div className="py-8 px-4 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center mx-auto mb-3">
                    <Database className="w-6 h-6" />
                  </div>
                  <p className="font-bold text-slate-900 text-base">0 Clientes Asignados</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                    Tu cuenta está completamente limpia y no contiene datos compartidos de otros usuarios.
                  </p>
                </div>
              ) : (
                availableNamespaces.map((ns) => {
                const isSelected = ns.name === namespace;
                return (
                  <div
                    key={ns.name}
                    className={`flex items-center justify-between p-3 sm:p-4 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-indigo-50/80 border-indigo-300 ring-1 ring-indigo-200"
                        : "bg-slate-50 border-slate-200 hover:bg-slate-100/70"
                    }`}
                    onClick={() => {
                      setNamespace(ns.name);
                      setIsClientSelectorOpen(false);
                    }}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-900 text-white font-bold text-sm sm:text-base flex items-center justify-center shrink-0">
                        {getClientInitials(ns.name)}
                      </div>
                      <div className="overflow-hidden">
                        <div className="text-sm sm:text-base font-bold text-slate-900 truncate">{getClientDisplayName(ns.name)}</div>
                        <div className="text-xs sm:text-base font-mono text-slate-500 truncate">
                          {ns.name} · {ns.vectorCount.toLocaleString()} vectores
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                      {isSelected ? (
                        <span className="text-xs sm:text-base font-semibold text-indigo-700 bg-white px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md border border-indigo-200">
                          Activo
                        </span>
                      ) : null}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteNamespace(ns.name);
                        }}
                        title="Eliminar namespace de Pinecone"
                        className="p-1.5 sm:p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                    </div>
                  </div>
                );
              }))}
            </div>

            <div className="pt-3 sm:pt-4 mt-2 sm:mt-3 border-t border-slate-200 flex justify-between items-center shrink-0">
              <button
                onClick={() => {
                  setIsClientSelectorOpen(false);
                  openNewSiteModal();
                }}
                className="text-xs sm:text-base font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <span>+ Agregar nuevo cliente</span>
              </button>
              <button
                onClick={() => setIsClientSelectorOpen(false)}
                className="bg-slate-900 text-white text-xs sm:text-base font-semibold px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Rastrear / Nuevo Sitio */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl border border-slate-300 w-full max-w-xl p-4 sm:p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            <div className="flex items-center gap-3 mb-4 pr-8">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center font-bold shrink-0">
                <RefreshCw className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-slate-900">Rastrear o Crear Espacio de Cliente</h3>
                <p className="text-xs sm:text-base text-slate-500">Envía la orden a GitHub Actions usando {scanAiProvider === "gemini" ? "Google Gemini" : "OpenAI"}.</p>
              </div>
            </div>

            <form onSubmit={handleStartScan} className="space-y-3.5 sm:space-y-4">
              {/* Selector de Motor de IA */}
              <div>
                <label className="block text-sm sm:text-base font-semibold text-slate-800 mb-1.5">
                  Motor de IA para Vectorización y RAG
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Opción Gemini */}
                  {(() => {
                    const hasGeminiAccess = Boolean(
                      currentUserInfo?.isAdmin ||
                      currentUserInfo?.canUseGemini !== false ||
                      customGeminiKey.trim()
                    );

                    return (
                      <button
                        type="button"
                        disabled={scanStatus?.type === "success"}
                        onClick={() => {
                          if (hasGeminiAccess) {
                            setScanAiProvider("gemini");
                          } else {
                            setIsByokModalOpen(true);
                          }
                        }}
                        title={
                          hasGeminiAccess
                            ? "Modelo Google Gemini disponible"
                            : "Restringido por el administrador. Haz clic para ingresar tu propia clave API (BYOK) y desbloquearlo."
                        }
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          scanAiProvider === "gemini"
                            ? "bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 shadow-xs"
                            : hasGeminiAccess
                            ? "bg-slate-50 border-slate-200 hover:bg-slate-100/70"
                            : "bg-slate-50/60 border-slate-200 hover:bg-amber-50/50 hover:border-amber-300"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-sm text-slate-900">Google Gemini</span>
                            {customGeminiKey.trim() ? (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-400 text-amber-950 font-bold">
                                BYOK
                              </span>
                            ) : !hasGeminiAccess ? (
                              <Lock className="w-3.5 h-3.5 text-slate-400" />
                            ) : null}
                          </div>
                          {scanAiProvider === "gemini" && <span className="w-2 h-2 rounded-full bg-blue-600"></span>}
                        </div>
                        <span className="text-xs text-slate-500">
                          {hasGeminiAccess
                            ? "gemini-embedding-001 (768d) · Gratuito"
                            : "Haz clic para ingresar tu API Key y desbloquearlo"}
                        </span>
                      </button>
                    );
                  })()}

                  {/* Opción OpenAI */}
                  {(() => {
                    const hasAccess = Boolean(
                      currentUserInfo?.isAdmin ||
                      currentUserInfo?.canUseOpenAI ||
                      customOpenaiKey.trim()
                    );

                    return (
                      <button
                        type="button"
                        disabled={scanStatus?.type === "success"}
                        onClick={() => {
                          if (hasAccess) {
                            setScanAiProvider("openai");
                          } else {
                            setIsByokModalOpen(true);
                          }
                        }}
                        title={
                          hasAccess
                            ? "Modelo OpenAI disponible para vectorización"
                            : "Restringido por el administrador. Haz clic para ingresar tu propia clave API (BYOK) y desbloquearlo."
                        }
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          scanAiProvider === "openai"
                            ? "bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 shadow-xs"
                            : hasAccess
                            ? "bg-slate-50 border-slate-200 hover:bg-slate-100/70"
                            : "bg-slate-50/60 border-slate-200 hover:bg-amber-50/50 hover:border-amber-300"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-sm text-slate-900">OpenAI GPT-4o Mini</span>
                            {customOpenaiKey.trim() ? (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-400 text-amber-950 font-bold">
                                BYOK
                              </span>
                            ) : !hasAccess ? (
                              <Lock className="w-3.5 h-3.5 text-slate-400" />
                            ) : null}
                          </div>
                          {scanAiProvider === "openai" && <span className="w-2 h-2 rounded-full bg-blue-600"></span>}
                        </div>
                        <span className="text-xs text-slate-500">
                          {hasAccess
                            ? "text-embedding-3-small (768d)"
                            : "Haz clic para ingresar tu API Key y desbloquearlo"}
                        </span>
                      </button>
                    );
                  })()}
                </div>
              </div>
              <div>
                <label className="block text-sm sm:text-base font-semibold text-slate-800 mb-1">
                  Namespace / Identificador del Cliente
                </label>
                <input
                  type="text"
                  required
                  disabled={scanStatus?.type === "success"}
                  value={scanNamespace}
                  onChange={(e) => setScanNamespace(e.target.value)}
                  placeholder="ej. cliente-empresa o mi-sitio"
                  className="w-full bg-slate-50 text-sm sm:text-base text-slate-900 px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-xl border border-slate-300 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-sm sm:text-base font-semibold text-slate-800 mb-1">
                  URL Base a Escanear
                </label>
                <input
                  type="url"
                  required
                  disabled={scanStatus?.type === "success"}
                  value={scanUrl}
                  onChange={(e) => setScanUrl(e.target.value)}
                  placeholder="https://ejemplo.com"
                  className="w-full bg-slate-50 text-sm sm:text-base text-slate-900 px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-xl border border-slate-300 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-sm sm:text-base font-semibold text-slate-800 mb-1">
                  Máximo de Páginas a Rastrear
                </label>
                <input
                  type="number"
                  min="5"
                  max="1000"
                  disabled={scanStatus?.type === "success"}
                  value={scanMaxPages}
                  onChange={(e) => setScanMaxPages(e.target.value)}
                  className="w-full bg-slate-50 text-sm sm:text-base text-slate-900 px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-xl border border-slate-300 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              {scanStatus && (
                <div
                  className={`p-3 sm:p-3.5 rounded-xl text-xs sm:text-base border ${
                    scanStatus.type === "success"
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : "bg-red-50 text-red-800 border-red-200"
                  }`}
                >
                  {scanStatus.message}
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2.5 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-base font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isScanning}
                  className="px-5 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center gap-2 shadow-sm cursor-pointer"
                >
                  {isScanning ? <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" /> : null}
                  <span>{isScanning ? "Enviando..." : "Iniciar Rastreo"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Integraciones & Conectar con LLM */}
      {isDocsModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-300 w-full max-w-4xl p-4 sm:p-7 shadow-2xl relative max-h-[90vh] flex flex-col">
            <button
              onClick={() => setIsDocsModalOpen(false)}
              className="absolute top-4 sm:top-5 right-4 sm:right-5 text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 cursor-pointer transition-colors"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            {/* Cabecera del Modal */}
            <div className="flex items-center gap-3 sm:gap-3.5 mb-4 sm:mb-5 pr-8 shrink-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center shrink-0">
                <Code2 className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Conecta Scrapio con tu LLM Preferido</h3>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Consulta el conocimiento de <span className="font-semibold text-slate-700">{getClientDisplayName(namespace)}</span> desde cualquier agente, chat o IA.
                </p>
              </div>
            </div>

            {/* Tarjeta de Tu API Key */}
            {(() => {
              const activeApiKey = scrapioApiKey || currentUserInfo?.apiKey || "sk_scrapio_TU_CLAVE";
              const activeNamespacePrompt = namespace || "<tu_cliente_o_namespace>";
              const encodedNamespacePrompt = encodeURIComponent(namespace || "Tivit");
              const clientDisplayName = getClientDisplayName(namespace || "tu cliente");

              return (
                <>
                  <div className="bg-gradient-to-r from-slate-50 to-slate-100/80 border border-slate-200 rounded-2xl p-4 mb-5 shadow-2xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                          <Key className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Tu Scrapio API Key (Única)</span>
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">Personal</span>
                          </div>
                          <p className="font-mono text-sm font-semibold text-slate-900 mt-0.5 truncate">
                            {showApiKey ? (scrapioApiKey || "sk_scrapio_...") : (scrapioApiKey ? "sk_scrapio_" + "•".repeat(24) : "Cargando clave...")}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center flex-wrap">
                        <button
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                        >
                          {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          <span>{showApiKey ? "Ocultar" : "Mostrar"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            copyToClipboard(activeApiKey);
                            setCopiedKey(true);
                            setTimeout(() => setCopiedKey(false), 2000);
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
                        >
                          {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedKey ? "Copiada" : "Copiar clave"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleRegenerateKey}
                          disabled={isRegeneratingKey}
                          title="Regenerar tu Scrapio API Key personal"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isRegeneratingKey ? "animate-spin" : ""}`} />
                          <span>{isRegeneratingKey ? "Regenerando..." : "Regenerar"}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Selector de Pestañas con estilo amplio tipo Segmented Control */}
                  <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-2xl mb-5 overflow-x-auto border border-slate-200/80">
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
                        className={`flex-1 min-w-fit px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap cursor-pointer text-center ${
                          activeDocTab === tab.id
                            ? "bg-white text-blue-600 shadow-sm border border-slate-200/60"
                            : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Contenido Dinámico por Pestaña */}
                  <div className="flex-1 overflow-y-auto pr-2 text-slate-700 space-y-4">
                    {activeDocTab === "direct" && (
                      <div className="space-y-4">
                        <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-4 text-slate-800">
                          <p className="font-bold text-blue-950 flex items-center gap-2 mb-1 text-sm">
                            <span>✨ Conexión Universal MCP & REST para Cualquier LLM</span>
                          </p>
                          <p className="text-sm text-slate-700 leading-relaxed">
                            Copia cualquiera de estos prompts y pégalo directamente en <strong>ChatGPT Plus/Team</strong>,{" "}
                            <strong>Claude (Web / Pro)</strong>, <strong>Gemini Advanced</strong>,{" "}
                            <strong>Cursor</strong>, <strong>Perplexity</strong> o <strong>Copilot</strong>.
                          </p>
                        </div>

                        {/* Opción 1: Consulta Directa al Cliente Activo */}
                        <div className="bg-gradient-to-r from-emerald-50/70 via-emerald-50/30 to-white border border-emerald-200 rounded-2xl p-4 shadow-2xs space-y-2.5">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 text-sm">
                                  Opción 1: Consulta Directa sobre {clientDisplayName} (1 Clic)
                                </span>
                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                                  Recomendado
                                </span>
                              </div>
                              <p className="text-xs text-slate-500">Pega esto en Claude, ChatGPT o Perplexity para obtener un reporte completo de {clientDisplayName} en 1 solo paso sin tener que armar URLs.</p>
                            </div>
                            <button
                              onClick={() =>
                                copyToClipboard(
                                  `Accede a https://scrapio-one.vercel.app/api/v1/query?key=${activeApiKey}&namespace=${encodedNamespacePrompt}&query=servicios+productos+y+soluciones y lee el JSON en tiempo real.\n1. Analiza minuciosamente el conocimiento indexado de ${clientDisplayName}.\n2. Presenta un informe estructurado y clasificado con todos sus servicios, productos, soluciones y propuestas de valor.\n3. Cita textualmente las URLs de las fuentes originales devueltas en el campo "sources".`
                                )
                              }
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer self-start sm:self-auto shrink-0"
                            >
                              {copiedSnippet ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>Copiar Prompt Directo</span>
                            </button>
                          </div>

                          <div className="bg-slate-900 text-emerald-400 p-3.5 rounded-xl font-mono text-xs sm:text-sm leading-relaxed overflow-x-auto select-all border border-slate-800">
                            {`Accede a https://scrapio-one.vercel.app/api/v1/query?key=${activeApiKey}&namespace=${encodedNamespacePrompt}&query=servicios+productos+y+soluciones y lee el JSON en tiempo real.
1. Analiza minuciosamente el conocimiento indexado de ${clientDisplayName}.
2. Presenta un informe estructurado y clasificado con todos sus servicios, productos, soluciones y propuestas de valor.
3. Cita textualmente las URLs de las fuentes originales devueltas en el campo "sources".`}
                          </div>
                          <p className="text-xs text-emerald-700 font-medium flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>URL 100% armada y codificada con la clave de tu cuenta y el cliente activo {clientDisplayName}.</span>
                          </p>
                        </div>

                        {/* Opción 2: Discovery */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-2.5">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <span className="font-bold text-slate-900 text-sm">
                                Opción 2: Discovery & Listado de Todos los Clientes (MCP)
                              </span>
                              <p className="text-xs text-slate-500">Pídele al modelo que descubra todos los clientes y herramientas autorizadas en tu cuenta.</p>
                            </div>
                            <button
                              onClick={() =>
                                copyToClipboard(
                                  `Accede a https://scrapio-one.vercel.app/api/v1/namespaces?key=${activeApiKey} y lee el JSON en tiempo real.\n1. Muéstrame la lista numerada de todos los clientes web disponibles en el arreglo "namespaces" con su nombre y cantidad exacta de vectores.\n2. Lee la definición de herramientas en "tools" (protocolo MCP) y utiliza el endpoint de consulta GET agregando el parámetro &query=<palabras_clave_separadas_por_+> para responder preguntas sobre cualquier cliente.`
                                )
                              }
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold shadow-2xs transition-all cursor-pointer self-start sm:self-auto shrink-0"
                            >
                              {copiedSnippet ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>Copiar Prompt Discovery</span>
                            </button>
                          </div>

                          <div className="bg-slate-900 text-emerald-400 p-3.5 rounded-xl font-mono text-xs sm:text-sm leading-relaxed overflow-x-auto select-all border border-slate-800">
                            {`Accede a https://scrapio-one.vercel.app/api/v1/namespaces?key=${activeApiKey} y lee el JSON en tiempo real.
1. Muéstrame la lista numerada de todos los clientes web disponibles en el arreglo "namespaces" con su nombre y cantidad exacta de vectores.
2. Lee la definición de herramientas en "tools" (protocolo MCP) y utiliza el endpoint de consulta GET agregando el parámetro &query=<palabras_clave_separadas_por_+> para responder preguntas sobre cualquier cliente.`}
                          </div>
                          <p className="text-xs text-emerald-700 font-medium flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Tu clave personal única ya está integrada en el parámetro de consulta.</span>
                          </p>
                        </div>

                        {/* Opción 3: Asistente Autónomo */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-2.5">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <span className="font-bold text-slate-900 text-sm">
                                Opción 3: Prompt Completo de Asistente RAG Autónomo
                              </span>
                              <p className="text-xs text-slate-500">Configura a cualquier IA como un analista experto con RAG semántico y citas web.</p>
                            </div>
                            <button
                              onClick={() =>
                                copyToClipboard(
                                  `Actúa como mi analista SEO y asistente de investigación conectado a mi plataforma Scrapio.\n1. Consulta https://scrapio-one.vercel.app/api/v1/namespaces?key=${activeApiKey} para identificar los clientes web y herramientas MCP disponibles en mi cuenta.\n2. Cuando te haga una pregunta sobre algún cliente (ej. ${activeNamespacePrompt}), consulta mediante GET a https://scrapio-one.vercel.app/api/v1/query?key=${activeApiKey}&namespace=${encodedNamespacePrompt}&query=<palabras_clave_con_+> (o haz un POST a ese mismo endpoint con el JSON {"query": "<pregunta>", "namespace": "${activeNamespacePrompt}"}). Reemplaza siempre los espacios en la URL con '+' (ej: query=requisitos+prestamo).\n3. Responde basándote estrictamente en los fragmentos obtenidos, citando las fuentes originales y destacando llamadas a la acción (CTAs).`
                                )
                              }
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold shadow-2xs transition-all cursor-pointer self-start sm:self-auto shrink-0"
                            >
                              {copiedSnippet ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>Copiar Prompt Completo</span>
                            </button>
                          </div>

                          <div className="bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-xs sm:text-sm leading-relaxed overflow-x-auto whitespace-pre-line select-all border border-slate-800">
                            {`Actúa como mi analista SEO y asistente de investigación conectado a mi plataforma Scrapio.
1. Consulta https://scrapio-one.vercel.app/api/v1/namespaces?key=${activeApiKey} para identificar los clientes web y herramientas MCP disponibles en mi cuenta.
2. Cuando te haga una pregunta sobre algún cliente (ej. ${activeNamespacePrompt}), consulta mediante GET a https://scrapio-one.vercel.app/api/v1/query?key=${activeApiKey}&namespace=${encodedNamespacePrompt}&query=<palabras_clave_con_+> (o haz un POST a ese mismo endpoint con el JSON {"query": "<pregunta>", "namespace": "${activeNamespacePrompt}"}). Reemplaza siempre los espacios en la URL con '+' (ej: query=requisitos+prestamo).
3. Responde basándote estrictamente en los fragmentos obtenidos, citando las fuentes originales y destacando llamadas a la acción (CTAs).`}
                          </div>
                          <p className="text-xs text-emerald-700 font-medium flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Compatible con Claude, ChatGPT, Gemini, Cursor y DeepSeek sin errores de codificación.</span>
                          </p>
                        </div>
                      </div>
                    )}

                    {activeDocTab === "chatgpt" && (
                      <div className="space-y-4">
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-3">
                          <h4 className="text-sm font-bold text-slate-900">Configuración para Custom GPTs de OpenAI</h4>
                          <p className="text-sm text-slate-600 leading-relaxed">
                            En la configuración de tu GPT, ve a <strong>Configure &gt; Actions &gt; Create new action</strong> y pega la URL en la casilla <em>Import from URL</em>:
                          </p>
                          <div className="bg-slate-900 text-blue-300 p-3.5 rounded-xl flex items-center justify-between font-mono text-xs sm:text-sm border border-slate-800">
                            <span className="truncate pr-2">https://scrapio-one.vercel.app/api/openapi.json</span>
                            <button
                              onClick={() => copyToClipboard("https://scrapio-one.vercel.app/api/openapi.json")}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors cursor-pointer shrink-0"
                            >
                              {copiedSnippet ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>Copiar URL</span>
                            </button>
                          </div>
                          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
                            <p className="font-semibold text-slate-900">Autenticación en el GPT:</p>
                            <p>En el campo <em>Authentication</em> del Custom GPT, selecciona <strong>API Key</strong>, Tipo <strong>Bearer</strong> y pega tu Scrapio API Key única:</p>
                            <code className="text-emerald-700 font-mono font-bold block pt-1">{activeApiKey}</code>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeDocTab === "claude" && (
                      <div className="space-y-4">
                        {/* Opción 1: Consulta Directa en Claude Web */}
                        <div className="bg-gradient-to-r from-emerald-50/70 via-emerald-50/30 to-white border border-emerald-200 rounded-2xl p-5 shadow-2xs space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-bold text-slate-900">Opción 1: Consulta Directa en Claude Web (1 Clic, Recomendado)</h4>
                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                                  100% Compatible
                                </span>
                              </div>
                              <p className="text-xs text-slate-500">Pega esto en claude.ai. Al incluir la URL completa ya formada, Claude la abre al instante sin errores de sandbox ni URLs dinámicas.</p>
                            </div>
                            <button
                              onClick={() =>
                                copyToClipboard(
                                  `Accede a https://scrapio-one.vercel.app/api/v1/query?key=${activeApiKey}&namespace=${encodedNamespacePrompt}&query=servicios+productos+y+soluciones y lee el JSON devuelto.\nPreséntame un informe clasificado y detallado con los servicios, productos y soluciones de ${clientDisplayName}, citando las fuentes originales provistas en "sources".`
                                )
                              }
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer shrink-0 self-start sm:self-auto"
                            >
                              {copiedSnippet ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>Copiar Prompt Directo Claude</span>
                            </button>
                          </div>

                          <div className="bg-slate-900 text-emerald-400 p-3.5 rounded-xl font-mono text-xs sm:text-sm overflow-x-auto select-all border border-slate-800">
                            {`Accede a https://scrapio-one.vercel.app/api/v1/query?key=${activeApiKey}&namespace=${encodedNamespacePrompt}&query=servicios+productos+y+soluciones y lee el JSON devuelto.
Preséntame un informe clasificado y detallado con los servicios, productos y soluciones de ${clientDisplayName}, citando las fuentes originales provistas en "sources".`}
                          </div>
                          <p className="text-xs text-slate-500">
                            La URL ya incluye los parámetros exactos (<code>&namespace={encodedNamespacePrompt}</code>) para evitar que Claude Web intente armar URLs en su sandbox.
                          </p>
                        </div>

                        {/* Opción 2: Asistente Multi-Cliente en Claude */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <h4 className="text-sm font-bold text-slate-900">Opción 2: Asistente Autónomo Multi-Cliente (Claude Web)</h4>
                              <p className="text-xs text-slate-500">Pega este prompt en claude.ai si deseas que primero descubra todos los clientes de tu cuenta.</p>
                            </div>
                            <button
                              onClick={() =>
                                copyToClipboard(
                                  `Accede a https://scrapio-one.vercel.app/api/v1/namespaces?key=${activeApiKey} y lee los clientes y herramientas MCP disponibles en mi cuenta.\nCuando te haga una pregunta sobre algún cliente (ej. ${activeNamespacePrompt}), consulta mediante GET a https://scrapio-one.vercel.app/api/v1/query?key=${activeApiKey}&namespace=${encodedNamespacePrompt}&query=<palabras_clave_con_+> reemplazando siempre los espacios con '+' en la URL.\nResponde con rigor basándote en los fragmentos obtenidos y citando las fuentes.`
                                )
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold shadow-2xs transition-all cursor-pointer shrink-0 self-start sm:self-auto"
                            >
                              {copiedSnippet ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>Copiar Prompt Multi-Cliente</span>
                            </button>
                          </div>

                          <div className="bg-slate-900 text-emerald-400 p-3.5 rounded-xl font-mono text-xs sm:text-sm overflow-x-auto select-all border border-slate-800">
                            {`Accede a https://scrapio-one.vercel.app/api/v1/namespaces?key=${activeApiKey} y lee los clientes y herramientas MCP disponibles en mi cuenta.
Cuando te haga una pregunta sobre algún cliente (ej. ${activeNamespacePrompt}), consulta mediante GET a https://scrapio-one.vercel.app/api/v1/query?key=${activeApiKey}&namespace=${encodedNamespacePrompt}&query=<palabras_clave_con_+> reemplazando siempre los espacios con '+' en la URL.
Responde con rigor basándote en los fragmentos obtenidos y citando las fuentes.`}
                          </div>
                          <p className="text-xs text-slate-500">
                            Si Claude te pide la URL de una pregunta específica, solo cambia <code>&query=tus+palabras</code>.
                          </p>
                        </div>

                        {/* Opción 3: Conexión Remota HTTP/SSE */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <h4 className="text-sm font-bold text-slate-900">Opción 3: Servidor MCP Remoto por URL (Cursor & Claude Web)</h4>
                              <p className="text-xs text-slate-500">Conéctate directamente sin necesidad de instalar NodeJS ni scripts locales.</p>
                            </div>
                            <button
                              onClick={() =>
                                copyToClipboard(`https://scrapio-one.vercel.app/api/v1/mcp?key=${activeApiKey}`)
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold shadow-2xs transition-all cursor-pointer shrink-0 self-start sm:self-auto"
                            >
                              {copiedSnippet ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>Copiar URL MCP</span>
                            </button>
                          </div>

                          <div className="bg-slate-900 text-emerald-400 p-3.5 rounded-xl font-mono text-xs sm:text-sm overflow-x-auto select-all border border-slate-800">
                            https://scrapio-one.vercel.app/api/v1/mcp?key={activeApiKey}
                          </div>
                          <p className="text-xs text-slate-500">
                            En Cursor o clientes MCP modernos, agrega un servidor de tipo <strong>SSE / HTTP</strong> con esta URL.
                          </p>
                        </div>

                        {/* Opción 4: claude_desktop_config.json */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <h4 className="text-sm font-bold text-slate-900">Opción 4: Configuración para Claude Desktop (`claude_desktop_config.json`)</h4>
                              <p className="text-xs text-slate-500">Para clientes que ejecutan MCP local vía stdin/stdout.</p>
                            </div>
                            <button
                              onClick={() =>
                                copyToClipboard(`{\n  "mcpServers": {\n    "scrapio": {\n      "command": "node",\n      "args": ["scripts/mcp-server.mjs"],\n      "env": {\n        "SCRAPIO_API_URL": "https://scrapio-one.vercel.app",\n        "SCRAPIO_API_KEY": "${activeApiKey}"\n      }\n    }\n  }\n}`)
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold shadow-2xs transition-all cursor-pointer shrink-0 self-start sm:self-auto"
                            >
                              {copiedSnippet ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>Copiar JSON</span>
                            </button>
                          </div>

                          <div className="bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-xs sm:text-sm overflow-x-auto border border-slate-800">
                            <pre>{`{
  "mcpServers": {
    "scrapio": {
      "command": "node",
      "args": ["scripts/mcp-server.mjs"],
      "env": {
        "SCRAPIO_API_URL": "https://scrapio-one.vercel.app",
        "SCRAPIO_API_KEY": "${activeApiKey}"
      }
    }
  }
}`}</pre>
                          </div>
                          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
                            <p className="font-semibold text-slate-900">Herramientas MCP habilitadas automáticamente:</p>
                            <p>• <code>list_scraped_sites</code>: Obtiene todos los clientes y sitios indexados autorizados para ti.</p>
                            <p>• <code>query_site</code>: Consulta preguntas y respuestas con RAG semántico citando fuentes.</p>
                            <p>• <code>get_site_entities</code>: Extrae entidades SEO, marcas, productos, personas y Schema.org.</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeDocTab === "python" && (
                      <div className="space-y-4">
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-slate-900">Ejemplo cURL / API REST (Bash & macOS)</h4>
                            <button
                              onClick={() =>
                                copyToClipboard(`curl -X POST https://scrapio-one.vercel.app/api/v1/query \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer ${activeApiKey}" \\\n  -d '{"query": "¿Cuáles son las condiciones?", "namespace": "${activeNamespacePrompt}"}'`)
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                            >
                              {copiedSnippet ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>Copiar cURL</span>
                            </button>
                          </div>
                          <div className="bg-slate-900 text-emerald-300 p-4 rounded-xl font-mono text-xs sm:text-sm overflow-x-auto border border-slate-800">
                            <pre>{`curl -X POST https://scrapio-one.vercel.app/api/v1/query \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${activeApiKey}" \\
  -d '{"query": "¿Cuáles son las condiciones?", "namespace": "${activeNamespacePrompt}"}'`}</pre>
                          </div>
                        </div>

                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-slate-900">Ejemplo Python (requests)</h4>
                            <button
                              onClick={() =>
                                copyToClipboard(`import requests\n\nres = requests.post(\n    "https://scrapio-one.vercel.app/api/v1/query",\n    headers={\n        "Authorization": "Bearer ${activeApiKey}",\n        "Content-Type": "application/json"\n    },\n    json={\n        "query": "¿Cuáles son las condiciones?",\n        "namespace": "${activeNamespacePrompt}"\n    }\n)\nprint(res.json()["answer"])`)
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                            >
                              {copiedSnippet ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>Copiar Python</span>
                            </button>
                          </div>
                          <div className="bg-slate-900 text-blue-300 p-4 rounded-xl font-mono text-xs sm:text-sm overflow-x-auto border border-slate-800">
                            <pre>{`import requests

res = requests.post(
    "https://scrapio-one.vercel.app/api/v1/query",
    headers={
        "Authorization": "Bearer ${activeApiKey}",
        "Content-Type": "application/json"
    },
    json={
        "query": "¿Cuáles son las condiciones?",
        "namespace": "${activeNamespacePrompt}"
    }
)
print(res.json()["answer"])`}</pre>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeDocTab === "n8n" && (
                      <div className="space-y-4">
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-3">
                          <h4 className="text-sm font-bold text-slate-900">Configuración Nodo HTTP Request para n8n o Make</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Método</span>
                              <span className="font-mono font-bold text-slate-800">POST</span>
                            </div>
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Endpoint</span>
                              <span className="font-mono text-xs text-blue-600 truncate block">https://scrapio-one.vercel.app/api/v1/query</span>
                            </div>
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 sm:col-span-2">
                              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Header Authorization</span>
                              <span className="font-mono text-xs text-slate-800">Authorization: Bearer {activeApiKey}</span>
                            </div>
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 sm:col-span-2">
                              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Body (JSON)</span>
                              <div className="bg-slate-900 text-slate-200 p-2.5 rounded-lg font-mono text-xs">
                                <code>{`{ "query": "{{ $json.prompt }}", "namespace": "${activeNamespacePrompt}" }`}</code>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}

            {/* Pie del Modal */}
            <div className="pt-4 mt-2 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-400">Scrapio RAG API v1 · Documentación Headless</span>
              <button
                onClick={() => setIsDocsModalOpen(false)}
                className="bg-slate-900 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-800 transition-colors cursor-pointer shadow-xs"
              >
                Cerrar Guía
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Ver Fragmentos Recuperados */}
      {isFragmentsModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl border border-slate-300 w-full max-w-xl p-4 sm:p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
            <button
              onClick={() => setIsFragmentsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-1 pr-8">Fragmentos Vectoriales Recuperados</h3>
            <p className="text-xs sm:text-base text-slate-500 mb-4">Evidencia semántica coincidente para {namespace}:</p>
            <div className="space-y-2.5 sm:space-y-3 flex-1 overflow-y-auto pr-1">
              {activeFragments.map((f, i) => (
                <div key={i} className="p-3 sm:p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs sm:text-base">
                  <div className="flex justify-between font-bold text-slate-900 mb-1">
                    <span className="truncate pr-2">{f.title}</span>
                    <span className="font-mono text-blue-600 shrink-0">{f.score}</span>
                  </div>
                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-xs sm:text-base text-slate-500 truncate block hover:underline">
                    {f.url}
                  </a>
                </div>
              ))}
            </div>
            <div className="pt-3 sm:pt-4 mt-2 border-t border-slate-200 flex justify-end shrink-0">
              <button
                onClick={() => setIsFragmentsModalOpen(false)}
                className="bg-slate-900 text-white text-xs sm:text-base font-semibold px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Auditoría de URLs escaneadas vs faltantes */}
      {isUrlsAuditModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl border border-slate-300 w-full max-w-2xl p-4 sm:p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
            <button
              onClick={() => setIsUrlsAuditModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            <div className="flex items-center gap-3 mb-3 shrink-0 pr-8">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center font-bold shrink-0">
                <Globe className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-slate-900">
                  Auditoría de URLs · {getClientDisplayName(urlsAuditData?.namespace || namespace)}
                </h3>
                <p className="text-xs sm:text-base text-slate-500">
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
                      style={{ width: `${Math.min(100, Math.max(0, urlsAuditData.progressPercent))}%` }}
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

                {/* Banner de estado de indexación individual */}
                {singleIndexStatus && (
                  <div
                    className={`p-3 rounded-xl border text-sm flex items-center justify-between gap-2 mb-1 ${
                      singleIndexStatus.success
                        ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                        : "bg-red-50 border-red-200 text-red-900"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {singleIndexStatus.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                      )}
                      <span className="truncate">{singleIndexStatus.message}</span>
                    </div>
                    <button
                      onClick={() => setSingleIndexStatus(null)}
                      className="p-1 hover:bg-black/5 rounded cursor-pointer shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

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

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`px-2.5 py-0.5 rounded-md font-semibold text-xs shrink-0 ${
                              item.isIndexed
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {item.isIndexed ? "Indexada" : "En cola"}
                          </span>

                          {item.isIndexed ? (
                            <button
                              onClick={() => handleDeleteSingleUrl(item.url)}
                              disabled={deletingSingleUrl === item.url}
                              title="Eliminar vectores de esta URL de Pinecone"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 disabled:opacity-50 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                            >
                              {deletingSingleUrl === item.url ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3 h-3" />
                              )}
                              <span>{deletingSingleUrl === item.url ? "Borrando..." : "Eliminar"}</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleIndexSingleUrl(item.url)}
                              disabled={indexingSingleUrl === item.url}
                              title="Indexar esta URL individual ahora mismo bajo demanda"
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                            >
                              {indexingSingleUrl === item.url ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Play className="w-3 h-3 fill-current" />
                              )}
                              <span>{indexingSingleUrl === item.url ? "Indexando..." : "Indexar"}</span>
                            </button>
                          )}
                        </div>
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

      {/* Modal: Diagnóstico y Logs del Escáner */}
      {isLogsModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl border border-slate-300 w-full max-w-2xl p-4 sm:p-6 shadow-2xl relative max-h-[88vh] flex flex-col">
            <button
              onClick={() => setIsLogsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            <div className="flex items-center gap-3 mb-4 shrink-0 pr-8">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold shrink-0">
                <Terminal className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-slate-900">Diagnóstico y Logs del Escáner</h3>
                <p className="text-xs sm:text-base text-slate-500">
                  Estado de ejecución en GitHub Actions e ingesta de vectores en Pinecone.
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-4 text-base text-slate-700">
              {/* Tarjeta de Estado Principal */}
              <div
                className={`p-4 rounded-xl border ${
                  ingestStatus?.status === "in_progress"
                    ? "bg-amber-50 border-amber-200 text-amber-900"
                    : ingestStatus?.conclusion === "failure"
                    ? "bg-red-50 border-red-200 text-red-900"
                    : ingestStatus?.quotaExhausted
                    ? "bg-amber-50 border-amber-200 text-amber-900"
                    : "bg-emerald-50 border-emerald-200 text-emerald-900"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-base flex items-center gap-2">
                    {ingestStatus?.status === "in_progress" ? (
                      <>
                        <span className="w-3 h-3 rounded-full bg-amber-500 animate-pulse"></span>
                        <span>Escaneo en curso (Ejecución #{ingestStatus?.runNumber || ""})</span>
                      </>
                    ) : ingestStatus?.conclusion === "failure" ? (
                      <>
                        <span className="w-3 h-3 rounded-full bg-red-600"></span>
                        <span>El escaneo falló (Ejecución #{ingestStatus?.runNumber || ""})</span>
                      </>
                    ) : ingestStatus?.quotaExhausted ? (
                      <>
                        <span className="w-3 h-3 rounded-full bg-amber-600"></span>
                        <span>Ingesta pausada por límite de cuota (Ejecución #{ingestStatus?.runNumber || ""})</span>
                      </>
                    ) : (
                      <>
                        <span className="w-3 h-3 rounded-full bg-emerald-600"></span>
                        <span>Último escaneo completado con éxito (#{ingestStatus?.runNumber || ""})</span>
                      </>
                    )}
                  </span>
                  <span className="text-xs font-mono opacity-75">
                    {ingestStatus?.updatedAt
                      ? new Date(ingestStatus.updatedAt).toLocaleTimeString()
                      : ""}
                  </span>
                </div>

                <p className="text-sm font-medium">
                  {ingestStatus?.currentStepName || "Sin ejecuciones recientes registradas."}
                </p>

                {/* Si hubo fallo específico */}
                {ingestStatus?.failedStepName && (
                  <div className="mt-2 text-xs font-mono bg-red-100/80 text-red-800 p-2 rounded-lg border border-red-200">
                    ⚠️ Error detectado en el paso: <strong>{ingestStatus.failedStepName}</strong>
                  </div>
                )}

                {/* Si se agotó cuota */}
                {ingestStatus?.quotaExhausted && (
                  <div className="mt-2 text-xs bg-amber-100/90 text-amber-900 p-2.5 rounded-lg border border-amber-300 leading-relaxed">
                    💡 <strong>Límite de Google Gemini alcanzado:</strong> La capa gratuita permite hasta 15 peticiones por minuto. El script guardó exitosamente todos los vectores generados hasta el momento. Las URLs pendientes se procesarán automáticamente cuando reanudes el escaneo.
                  </div>
                )}

                {/* Barra de Progreso */}
                <div className="mt-3">
                  <div className="flex justify-between text-xs font-semibold mb-1">
                    <span>Progreso</span>
                    <span>{ingestStatus?.progressPercent || 0}%</span>
                  </div>
                  <div className="w-full bg-black/10 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-500 ${
                        ingestStatus?.conclusion === "failure"
                          ? "bg-red-500"
                          : ingestStatus?.status === "in_progress"
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                      }`}
                      style={{ width: `${ingestStatus?.progressPercent || 0}%` }}
                    ></div>
                  </div>
                </div>

                {/* Métricas de URLs */}
                {typeof ingestStatus?.totalUrls === "number" && ingestStatus.totalUrls > 0 && (
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-black/10 text-center text-xs">
                    <div>
                      <span className="block font-bold text-sm">{ingestStatus.processedUrls || 0}</span>
                      <span className="opacity-75">Procesadas</span>
                    </div>
                    <div>
                      <span className="block font-bold text-sm">{ingestStatus.remainingUrls ?? 0}</span>
                      <span className="opacity-75">Faltantes</span>
                    </div>
                    <div>
                      <span className="block font-bold text-sm">{ingestStatus.totalUrls}</span>
                      <span className="opacity-75">Total URLs</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Pasos de GitHub Actions */}
              {ingestStatus?.stepsSummary && ingestStatus.stepsSummary.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-slate-500" />
                    <span>Pasos del flujo en GitHub Actions</span>
                  </h4>
                  <div className="bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-200/80 overflow-hidden text-sm">
                    {ingestStatus.stepsSummary.map((step, idx) => (
                      <div key={idx} className="p-2.5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {step.conclusion === "success" ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : step.conclusion === "failure" ? (
                            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                          ) : step.status === "in_progress" ? (
                            <Loader2 className="w-4 h-4 text-amber-500 animate-spin shrink-0" />
                          ) : (
                            <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                          <span className={`font-medium ${step.conclusion === "failure" ? "text-red-700 font-bold" : "text-slate-700"}`}>
                            {step.name}
                          </span>
                        </div>
                        <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                          {step.conclusion || step.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Enlace y Explicación de GitHub Actions */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3.5 flex items-center justify-between gap-3">
                <div className="text-xs text-slate-600">
                  <p className="font-semibold text-slate-800 mb-0.5">Logs completos y salida de consola en vivo</p>
                  <p>Accede directamente a la consola de ejecución de GitHub Actions para ver los logs detallados de cada URL procesada.</p>
                </div>
                {ingestStatus?.htmlUrl && (
                  <a
                    href={ingestStatus.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors shadow-2xs"
                  >
                    <span>Ver en GitHub</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  checkIngestStatus();
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-300 px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Actualizar estado</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsLogsModalOpen(false);
                    openUpdateModal();
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                >
                  Reanudar / Iniciar Escaneo
                </button>
                <button
                  type="button"
                  onClick={() => setIsLogsModalOpen(false)}
                  className="bg-slate-200 text-slate-800 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-300 transition-colors cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Mis API Keys (BYOK) */}
      {isByokModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl border border-slate-300 w-full max-w-lg p-4 sm:p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsByokModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            <div className="flex items-center gap-3 mb-4 shrink-0 pr-8">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center font-bold shrink-0">
                <Key className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-slate-900">Mis API Keys (BYOK)</h3>
                <p className="text-xs sm:text-base text-slate-500">
                  Usa tus propias credenciales para consultas ilimitadas.
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveByok} className="space-y-4">
              <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3 text-xs sm:text-sm text-amber-900 leading-relaxed">
                Tus claves se guardan localmente en tu navegador. Al ingresar tu propia API Key de OpenAI, podrás usar <strong>GPT-4o Mini</strong> de forma directa.
                <span className="block mt-1 text-amber-800/90 text-[11px] sm:text-xs">
                  * Nota: Tu API Key comparte cuota con cualquier otra aplicación o script externo donde la utilices.
                </span>
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl border border-slate-300 w-full max-w-4xl p-4 sm:p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
            <button
              onClick={() => setIsAdminModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            <div className="flex items-center gap-3 mb-4 shrink-0 pr-8">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-purple-50 border border-purple-200 text-purple-600 flex items-center justify-center font-bold shrink-0">
                <Users className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-slate-900">Panel de Administración de Usuarios</h3>
                <p className="text-xs sm:text-base text-slate-500">
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
                              {/* Gemini Toggle */}
                              <div className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg">
                                <div>
                                  <div className="text-sm font-bold text-slate-900">Google Gemini Flash</div>
                                  <div className="text-xs text-slate-500">Motor por defecto (768d)</div>
                                </div>
                                {u.role === "admin" ? (
                                  <span className="text-xs font-bold text-purple-800 bg-purple-100 px-2 py-0.5 rounded">
                                    Ilimitado (Admin)
                                  </span>
                                ) : (
                                  <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={u.canUseGemini !== false}
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        setAdminUsers((prev) =>
                                          prev.map((item) =>
                                            item.id === u.id
                                              ? { ...item, canUseGemini: checked }
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

                              {/* OpenAI Toggle */}
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
                                    Boolean(u.canUseOpenAI),
                                    u.canUseGemini !== false
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
