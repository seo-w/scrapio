#!/usr/bin/env node
/**
 * Scrapio MCP Server (Model Context Protocol) - Pure JS Runner
 * Compatible con Claude Desktop, Cursor y cualquier cliente MCP.
 */

import readline from "node:readline";

const BASE_URL = process.env.SCRAPIO_API_URL || "https://scrapio-one.vercel.app";
const API_KEY = process.env.SCRAPIO_API_KEY || "sk_scrapio_default_secret_key_2026";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

function send(response) {
  process.stdout.write(JSON.stringify(response) + "\n");
}

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const req = JSON.parse(trimmed);

    if (req.method === "initialize") {
      return send({
        jsonrpc: "2.0",
        id: req.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "scrapio-mcp-server", version: "1.0.0" },
        },
      });
    }

    if (req.method === "notifications/initialized") return;

    if (req.method === "ping") {
      return send({ jsonrpc: "2.0", id: req.id, result: {} });
    }

    if (req.method === "tools/list") {
      return send({
        jsonrpc: "2.0",
        id: req.id,
        result: {
          tools: [
            {
              name: "list_scraped_sites",
              description: "Obtiene la lista de todos los sitios web o clientes scrapeados disponibles en la base de datos de Scrapio con su número de vectores.",
              inputSchema: { type: "object", properties: {} },
            },
            {
              name: "query_site",
              description: "Realiza una consulta RAG semántica personalizada sobre el contenido del sitio web scrapeado.",
              inputSchema: {
                type: "object",
                properties: {
                  namespace: { type: "string", description: "El nombre del cliente o sitio web (ej. 'Internexa', 'Avafin', 'Tivit', etc.)" },
                  query: { type: "string", description: "La pregunta o tema específico a responder" },
                  topK: { type: "number", description: "Cantidad de fragmentos a recuperar (por defecto 6)" },
                },
                required: ["namespace", "query"],
              },
            },
            {
              name: "get_site_entities",
              description: "Extrae de forma exhaustiva todas las entidades SEO del sitio web (marcas, productos, servicios, personas, lugares y Schema.org).",
              inputSchema: {
                type: "object",
                properties: {
                  namespace: { type: "string", description: "El nombre del cliente o sitio web (ej. 'Internexa')" },
                },
                required: ["namespace"],
              },
            },
          ],
        },
      });
    }

    if (req.method === "tools/call") {
      const toolName = req.params?.name;
      const args = req.params?.arguments || {};

      try {
        if (toolName === "list_scraped_sites") {
          const res = await fetch(`${BASE_URL}/api/v1/namespaces?key=${encodeURIComponent(API_KEY)}`);
          const data = await res.json();
          return send({
            jsonrpc: "2.0",
            id: req.id,
            result: { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] },
          });
        }

        if (toolName === "query_site") {
          const res = await fetch(`${BASE_URL}/api/v1/query`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${API_KEY}`,
            },
            body: JSON.stringify({
              namespace: args.namespace,
              query: args.query,
              topK: args.topK || 6,
            }),
          });
          const data = await res.json();
          const answer = data.answer || JSON.stringify(data, null, 2);
          return send({
            jsonrpc: "2.0",
            id: req.id,
            result: { content: [{ type: "text", text: answer }] },
          });
        }

        if (toolName === "get_site_entities") {
          const res = await fetch(`${BASE_URL}/api/v1/entities?namespace=${encodeURIComponent(args.namespace)}`, {
            headers: { Authorization: `Bearer ${API_KEY}` },
          });
          const data = await res.json();
          const text = data.analysis || JSON.stringify(data, null, 2);
          return send({
            jsonrpc: "2.0",
            id: req.id,
            result: { content: [{ type: "text", text }] },
          });
        }

        return send({
          jsonrpc: "2.0",
          id: req.id,
          error: { code: -32601, message: `Herramienta desconocida: ${toolName}` },
        });
      } catch (err) {
        return send({
          jsonrpc: "2.0",
          id: req.id,
          result: { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true },
        });
      }
    }

    return send({
      jsonrpc: "2.0",
      id: req.id,
      error: { code: -32601, message: `Método no soportado: ${req.method}` },
    });
  } catch (err) {
    // ignorar parse errors
  }
});
