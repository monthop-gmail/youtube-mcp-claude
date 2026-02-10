# YouTube MCP Claude

MCP (Model Context Protocol) Server สำหรับดึง transcript และข้อมูลจากวิดีโอ YouTube เพื่อใช้กับ Claude AI

## Features

- **youtube_to_text** - แปลง YouTube video เป็นข้อความ transcript
- **youtube_video_info** - ดึงข้อมูลวิดีโอ (ชื่อ, Channel, ความยาว, subtitle ที่มี)

## Architecture

```
YouTube Video URL
       │
       ▼
┌─────────────────────┐
│  Innertube Android   │  ← Method 1: ไม่ต้อง auth, ใช้ Android client
│  API (Primary)       │     เพื่อหลีกเลี่ยง ip=0.0.0.0 ใน caption URL
└──────────┬──────────┘
           │ ถ้า fail
           ▼
┌─────────────────────┐
│  yt-dlp + cookies    │  ← Method 2: Fallback สำหรับ bot-detected servers
│  (Fallback)          │     รองรับ Deno runtime สำหรับ JS challenges
└──────────┬──────────┘
           │ ถ้า fail
           ▼
┌─────────────────────┐
│  oEmbed API          │  ← ดึงข้อมูลพื้นฐาน (ไม่โดน block)
│  (Video Info Only)   │
└─────────────────────┘
```

## Tech Stack

- **Runtime**: Node.js 22 (ESM modules)
- **MCP SDK**: @modelcontextprotocol/sdk v1.0.0
- **Transport**: SSE (primary, port 3010) + Stdio
- **Dependencies**: Zero npm dependencies สำหรับ YouTube logic (ใช้ native `fetch` + `child_process`)
- **Fallback tools**: yt-dlp, Deno, Python3 (ใน Docker)

## Project Structure

```
youtube-mcp-claude/
├── src/
│   ├── server-sse.js    # SSE transport server (HTTP + SSE endpoints)
│   ├── index.js         # Stdio transport server
│   ├── youtube.js       # YouTube API logic (Innertube, yt-dlp, oEmbed)
│   └── config.js        # Configuration (port, host, default language)
├── data/                # ตัวอย่าง transcript ที่ดึงได้ (Markdown format)
│   ├── 5KBJ_8FbtWQ.md  # เผือก สีขาว - เรื่องการเมืองสมัยพุทธกาล
│   ├── SF6Tskjx6Qw.md  # The Mind Architect - Journey Within
│   └── mM2n76-IeSg.md  # NewVeerachai - AI YouTube Podcast Masterclass
├── Dockerfile
├── docker-compose.yml
├── package.json
└── cookies.txt          # (ไม่รวมใน repo) Netscape format cookies
```

## Quick Start

### Docker (แนะนำ)

```bash
# Clone repo
git clone https://github.com/monthop-gmail/youtube-mcp-claude.git
cd youtube-mcp-claude

# สร้าง cookies.txt (optional - สำหรับ fallback กรณีโดน bot detection)
# Export cookies จาก browser ที่ login YouTube เป็น Netscape format

# Run
docker compose up -d
```

### ไม่ใช้ Docker

```bash
npm install
npm start          # SSE mode (port 3010)
# หรือ
npm run start:stdio  # Stdio mode
```

## MCP Client Configuration

เพิ่มใน `.mcp.json` หรือ Claude Desktop config:

```json
{
  "mcpServers": {
    "youtube": {
      "url": "http://localhost:3010/sse"
    }
  }
}
```

## API Endpoints

| Endpoint     | Method | Description                    |
|-------------|--------|--------------------------------|
| `/sse`      | GET    | SSE connection endpoint        |
| `/messages` | POST   | MCP message endpoint           |
| `/health`   | GET    | Health check                   |

## MCP Tools

### youtube_to_text

แปลง YouTube video เป็นข้อความ transcript

| Parameter | Type   | Required | Default | Description                          |
|-----------|--------|----------|---------|--------------------------------------|
| `url`     | string | Yes      | -       | YouTube URL หรือ Video ID            |
| `lang`    | string | No       | `th`    | ภาษา subtitle เช่น `th`, `en`       |

**Response:**
```json
{
  "videoID": "5KBJ_8FbtWQ",
  "title": "ฟังเรื่องการเมือง เลยนึกถึงเรื่องราวในสมัยพุทธกาล",
  "lang": "th",
  "segmentCount": 155,
  "text": "สวัสดีค่ะ...",
  "method": "innertube"
}
```

### youtube_video_info

ดึงข้อมูลวิดีโอ YouTube

| Parameter | Type   | Required | Description              |
|-----------|--------|----------|--------------------------|
| `url`     | string | Yes      | YouTube URL หรือ Video ID |

**Response:**
```json
{
  "videoID": "5KBJ_8FbtWQ",
  "title": "...",
  "author": "เผือก สีขาว",
  "lengthSeconds": 420,
  "viewCount": 12345,
  "description": "...",
  "availableLanguages": [
    { "code": "th", "name": "Thai", "kind": "asr" }
  ],
  "method": "innertube"
}
```

## Data Directory

โฟลเดอร์ `data/` มีตัวอย่าง transcript ที่ดึงได้จริง ในรูปแบบ Markdown สามารถนำไปใช้เป็น:

- **RAG (Retrieval-Augmented Generation)** - นำ transcript ไปทำ embedding สำหรับ knowledge base
- **Content analysis** - วิเคราะห์เนื้อหาวิดีโอ
- **Training data** - ใช้เป็นข้อมูลสำหรับฝึก model

แต่ละไฟล์มี metadata: Video ID, URL, Channel, Language, จำนวน Segments

## Environment Variables

| Variable       | Default   | Description                     |
|---------------|-----------|---------------------------------|
| `PORT`        | `3010`    | Server port                     |
| `HOST`        | `0.0.0.0` | Server host                    |
| `DEFAULT_LANG`| `th`      | Default subtitle language       |

## cookies.txt (Optional)

สำหรับกรณีที่ server IP โดน YouTube bot detection:

1. ติดตั้ง browser extension สำหรับ export cookies (เช่น "Get cookies.txt LOCALLY")
2. เข้า YouTube แล้ว login
3. Export cookies เป็น Netscape format
4. วางไฟล์ `cookies.txt` ที่ root ของโปรเจค
5. yt-dlp จะใช้ cookies นี้และ rotate อัตโนมัติ

> **หมายเหตุ**: cookies.txt มีข้อมูล session ที่ sensitive จึงไม่รวมใน repo

## Docker Details

- **Base image**: node:22-slim
- **Includes**: yt-dlp, Deno (สำหรับ JS challenges), Python3
- **Network**: `host` mode (ลดโอกาสโดน bot detection)
- **cookies.txt**: mount แบบ writable (yt-dlp ต้องเขียน cookies กลับ)

## Related Projects

โปรเจคนี้เป็นส่วนหนึ่งของระบบ MCP Servers:

| Server              | Port | Description                    |
|--------------------|------|--------------------------------|
| esxi-mcp-claude    | 3000 | ESXi management                |
| chat-mcp-claude    | 3001 | Chat history search            |
| thudong-mcp-claude | 3002 | Thudong data                   |
| **youtube-mcp-claude** | **3010** | **YouTube transcript**    |
| audio-mcp-claude   | 3011 | Audio Speech-to-Text           |
