#!/usr/bin/env node
/**
 * Scrapio MCP Server (Model Context Protocol)
 * Permite a Claude Desktop, Cursor y agentes IA consultar sitios y extraer entidades SEO directamente.
 */

import readline from "readline";

// URL base de tu aplicación en Vercel (o localhost para pruebas)
const BASE_URL = process.env.SCRAPIO_API_URL || "http://localhost:3000";

interface JsonRpcRequest {
  jsonrpc: string;
  id?: number | string;
  method: string;
  params?: any;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

function send(response: any) {
  process.stdout.write(JSON.stringify(response) + "\n");
}

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const req: JsonRpcRequest = JSON.parse(trimmed);

    // 1. Handshake inicial MCP
    if (req.method === "initialize") {
      return send({
        jsonrpc: "2.0",
        id: req.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: "scrapio-mcp-server",
            version: "1.0.0",
          },
        },
      });
    }

    if (req.method === "notifications/initialized") {
      return; // Confirmación sin respuesta
    }

    // 2. Listado de Herramientas disponibles para Claude
    if (req.method === "tools/list") {
      return send({
        jsonrpc: "2.0",
        id: req.id,
        result: {
          tools: [
            {
              name: "list_scraped_sites",
              description: "Obtiene la lista de todos los sitios web o clientes scrapeados disponibles en la base de datos de Scrapio con su número de vectores.",
              inputSchema: {
                type: "object",
                properties: {},
              },
            },
            {
              name: "get_site_entities",
              description: "Extrae de forma exhaustiva todas las entidades SEO del sitio web (marcas, productos, servicios, personas, lugares, temáticas y Schema.org sugerido).",
              inputSchema: {
                type: "object",
                properties: {
                  namespace: {
                    type: "string",
                    description: "El nombre del sitio/cliente (ej: cliente-avafin)",
                  },
                },
                required: ["namespace"],
              },
            },
            {
              name: "query_site",
              description: "Realiza una consulta RAG semántica personalizada sobre el contenido del sitio web scrapeado.",
              inputSchema: {
                type: "object",
                properties: {
                  namespace: {
                    type: "string",
                    description: "El nombre del sitio/cliente (ej: cliente-avafin)",
                  },
                  query: {
                    type: "string",
                    description: "La pregunta o tema específico a consultar",
                  },
                },
                required: ["namespace", "query"],
              },
            },
          ],
        },
      });
    }

    // 3. Ejecución de Herramientas
    if (req.method === "tools/call") {
      const toolName = req.params?.name;
      const args = req.params?.arguments || {};

      try {
        if (toolName === "list_scraped_sites") {
          const res = await fetch(`${BASE_URL}/api/namespaces`);
          const data = await res.json();
          return send({
            jsonrpc: "2.0",
            id: req.id,
            result: {
              content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
            },
          });
        }

        if (toolName === "get_site_entities") {
          const res = await fetch(`${BASE_URL}/api/entities?namespace=${encodeURIComponent(args.namespace)}`);
          const data = await res.json();
          const text = data.analysis || JSON.stringify(data, null, 2);
          return send({
            jsonrpc: "2.0",
            id: req.id,
            result: {
              content: [{ type: "text", text }],
            },
          });
        }

        if (toolName === "query_site") {
          const res = await fetch(`${BASE_URL}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              namespace: args.namespace,
              query: args.query,
            }),
          });
          const data = await res.json();
          const answer = data.answer || JSON.stringify(data, null, 2);
          return send({
            jsonrpc: "2.0",
            id: req.id,
            result: {
              content: [{ type: "text", text: answer }],
            },
          });
        }

        return send({
          jsonrpc: "2.0",
          id: req.id,
          error: { code: -32601, message: `Herramienta desconocida: ${toolName}` },
        });
      } catch (err: any) {
        return send({
          jsonrpc: "2.0",
          id: req.id,
          result: {
            content: [{ type: "text", text: `Error al ejecutar ${toolName}: ${err.message}` }],
            isError: true,
          },
        });
      }
    }

    // Ping o métodos no soportados
    if (req.method === "ping") {
      return send({ jsonrpc: "2.0", id: req.id, result: {} });
    }

    return send({
      jsonrpc: "2.0",
      id: req.id,
      error: { code: -32601, message: `Método no encontrado: ${req.method}` },
    });
  } catch (err: any) {
    // Error de parseo JSON
  }
});
