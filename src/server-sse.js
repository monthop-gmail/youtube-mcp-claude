#!/usr/bin/env node

/**
 * MCP Server for YouTube to Text Converter - SSE Transport
 * แปลง YouTube video เป็นข้อความ transcript
 */

import http from 'http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { config } from './config.js';
import { extractVideoID, getTranscript, getVideoInfo } from './youtube.js';

// Define available tools
const TOOLS = [
  {
    name: 'youtube_to_text',
    description: 'แปลง YouTube video เป็นข้อความ transcript / Convert YouTube video to text transcript',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'YouTube URL หรือ Video ID เช่น https://youtube.com/watch?v=xxx หรือ xxx',
        },
        lang: {
          type: 'string',
          description: 'ภาษา subtitle เช่น "th", "en" (default: "th")',
          default: 'th',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'youtube_video_info',
    description: 'ดึงข้อมูลวิดีโอ YouTube เช่น ชื่อ, รายละเอียด, ภาษา subtitle ที่มี / Get YouTube video details',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'YouTube URL หรือ Video ID',
        },
      },
      required: ['url'],
    },
  },
];

// Helper: Format response
function formatResponse(data) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

// Helper: Format error response
function formatError(message) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ error: true, message }),
      },
    ],
    isError: true,
  };
}

/**
 * Create MCP server instance with tool handlers
 */
function createMCPServer() {
  const server = new Server(
    {
      name: 'youtube-mcp-claude',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Handle list tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Handle tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'youtube_to_text': {
          const url = args?.url;
          if (!url) {
            return formatError('URL หรือ Video ID จำเป็นต้องระบุ');
          }
          const videoID = extractVideoID(url);
          const lang = args?.lang || config.DEFAULT_LANG;
          const result = await getTranscript(videoID, lang);
          return formatResponse(result);
        }

        case 'youtube_video_info': {
          const url = args?.url;
          if (!url) {
            return formatError('URL หรือ Video ID จำเป็นต้องระบุ');
          }
          const videoID = extractVideoID(url);
          const result = await getVideoInfo(videoID);
          return formatResponse(result);
        }

        default:
          return formatError(`Unknown tool: ${name}`);
      }
    } catch (error) {
      console.error(`Error in ${name}:`, error);
      return formatError(error.message);
    }
  });

  return server;
}

// Store active transports for cleanup
const activeTransports = new Map();

// Create HTTP server
const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check endpoint
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      server: 'youtube-mcp-claude',
      version: '1.0.0',
      transport: 'sse',
      tools: TOOLS.map(t => t.name),
    }));
    return;
  }

  // SSE endpoint
  if (url.pathname === '/sse') {
    console.log('New SSE connection');

    const server = createMCPServer();
    const transport = new SSEServerTransport('/messages', res);

    const connectionId = Date.now().toString();
    activeTransports.set(connectionId, { server, transport });

    res.on('close', () => {
      console.log('SSE connection closed');
      activeTransports.delete(connectionId);
    });

    await server.connect(transport);
    return;
  }

  // Message endpoint for SSE
  if (url.pathname === '/messages' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        for (const [, { transport }] of activeTransports) {
          if (transport.handlePostMessage) {
            await transport.handlePostMessage(req, res, body);
            return;
          }
        }
        res.writeHead(404);
        res.end('No active session');
      } catch (error) {
        console.error('Error handling message:', error);
        res.writeHead(500);
        res.end('Internal error');
      }
    });
    return;
  }

  // 404 for other routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    error: 'Not found',
    endpoints: {
      '/sse': 'SSE connection endpoint',
      '/messages': 'Message endpoint (POST)',
      '/health': 'Health check',
    },
  }));
});

// Start server
async function main() {
  httpServer.listen(config.PORT, config.HOST, () => {
    console.log(`YouTube MCP Server v1.0 (SSE)`);
    console.log(`Listening on http://${config.HOST}:${config.PORT}`);
    console.log(`SSE endpoint: http://${config.HOST}:${config.PORT}/sse`);
    console.log(`Health check: http://${config.HOST}:${config.PORT}/health`);
  });
}

process.on('SIGINT', () => {
  console.log('Shutting down...');
  httpServer.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down...');
  httpServer.close();
  process.exit(0);
});

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
