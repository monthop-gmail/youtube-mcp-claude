#!/usr/bin/env node

/**
 * MCP Server for YouTube to Text Converter - Stdio Transport
 * แปลง YouTube video เป็นข้อความ transcript
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { config } from './config.js';
import { extractVideoID, getTranscript, getVideoInfo } from './youtube.js';

// Create server instance
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

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('YouTube MCP Server v1.0 running on stdio');
}

process.on('SIGINT', () => {
  console.error('Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('Shutting down...');
  process.exit(0);
});

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
