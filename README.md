# Telegram Summariser Userbot

[![Typescript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![mtcute](https://img.shields.io/badge/mtcute-DE6FBE?logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNjAiIGhlaWdodD0iMTU2IiB2aWV3Qm94PSI2MyA0NCAxNjAgMTU2IiBmaWxsPSJub25lIj48cGF0aCBkPSJNMTgyLjk4NCA1NC4yMkMxOTQuNDY0IDYwLjg1IDE5OC4zOTcgNzUuNTIgMTkxLjc2OSA4N0wxODQuNjAxIDk5LjQySDE5OUMyMTIuMjU1IDk5LjQyIDIyMyAxMTAuMTYgMjIzIDEyMy40MkMyMjMgMTM2LjY3IDIxMi4yNTUgMTQ3LjQyIDE5OSAxNDcuNDJIMTg0LjUwNkwxOTEuNzY5IDE2MEMxOTguMzk3IDE3MS40OCAxOTQuNDY0IDE4Ni4xNiAxODIuOTg0IDE5Mi43OEMxNzEuNTA2IDE5OS40MSAxNTYuODI3IDE5NS40OCAxNTAuMiAxODRMOTQuMiA4N0M4Ny41NzIgNzUuNTIgOTEuNTA2IDYwLjg1IDEwMi45ODQgNTQuMjJDMTE0LjQ2NCA0Ny41OSAxMjkuMTQyIDUxLjUyIDEzNS43NjkgNjNMMTQyLjk4NCA3NS41TDE1MC4yIDYzQzE1Ni44MjcgNTEuNTIgMTcxLjUwNiA0Ny41OSAxODIuOTg0IDU0LjIyWiIgZmlsbD0id2hpdGUiLz48cGF0aCBkPSJNMTYzLjgzNyAxMzUuMzhDMTcwLjQ2NCAxMjMuOSAxNjYuNTMyIDEwOS4yMyAxNTUuMDUyIDEwMi42QzE1MC44NDcgMTAwLjE3IDE0Ni4yMTEgOTkuMTYgMTQxLjcgOTkuNDJIODdDNzMuNzQ1IDk5LjQyIDYzIDExMC4xNiA2MyAxMjMuNDJDNjMgMTM2LjY3IDczLjc0NSAxNDcuNDIgODcgMTQ3LjQySDEwMS40NjNMOTQuMjY4IDE1OS44OEM4Ny42NCAxNzEuMzYgOTEuNTczIDE4Ni4wNCAxMDMuMDUyIDE5Mi42N0MxMTQuNTMyIDE5OS4yOSAxMjkuMjEgMTk1LjM2IDEzNS44MzcgMTgzLjg4TDE2My44MzcgMTM1LjM4WiIgZmlsbD0id2hpdGUiLz48L3N2Zz4=&logoColor=white)](https://mtcute.dev/) [![Vercel AI SDK](https://img.shields.io/badge/Vercel_AI_SDK-000000?logo=vercel&logoColor=white)](https://ai-sdk.dev/) [![Docker Hub](https://img.shields.io/badge/Docker-0db7ed?logo=docker&logoColor=white)](https://hub.docker.com/r/m4l3vich/telegram-summariser-userbot) [![Docker Image Size](https://img.shields.io/docker/image-size/m4l3vich/telegram-summariser-userbot)](https://hub.docker.com/r/m4l3vich/telegram-summariser-userbot)

A Telegram userbot that summarises chat messages using AI.

## Features

- Summarise the last N messages in any chat
- Summarise messages since a specific time (`since:07:00`, `since:DD-MM-YYYY_HH:MM`)
- Summarise messages from the last N minutes, hours, or days (`last:5m`, `last:2h`, `last:1d`)
- Summarise messages since your last outgoing message (`since:last_out_msg`)
- Ask a specific question about the chat content alongside the summary
- Works with any OpenAI-compatible or Anthropic-compatible AI provider
- Customisable system prompt via a plain text file
- Flood limit handling

## Setup

### Docker (recommended)

Pull the image and run the interactive setup wizard:

```sh
docker run -it -v ./data:/app/data m4l3vich/telegram-summariser-userbot setup
```

The wizard will walk you through:
1. Entering your Telegram API credentials (from https://my.telegram.org/apps)
2. Authenticating your Telegram account
3. Configuring your AI provider and selecting a model
4. Setting optional preferences (language, timezone, prompt file)

Once setup is complete, start the bot:

```sh
docker run -d --env-file ./data/.env -v ./data:/app m4l3vich/telegram-summariser-userbot
```

### From source

Prerequisites: Node.js 18+, pnpm, Telegram API credentials from https://my.telegram.org/apps, an API key from your chosen AI provider.

```sh
git clone <repo-url>
pnpm install
pnpm setup
```

The setup wizard creates a `.env` file with your configuration. Then start the bot:

```sh
pnpm dev     # development with hot-reload
pnpm start   # production (run pnpm build first)
```

<details>
<summary>Manual configuration (without setup wizard)</summary>

```sh
cp .env.example .env
# Edit .env with your credentials
```

On first run, the bot will prompt you to authenticate your Telegram account. The session is saved to a SQLite file (default: `session.sqlite`).

</details>

## AI Provider Configuration

`AI_PROVIDER` selects the protocol: `openai` (OpenAI-compatible) or `anthropic`. Any provider that implements either protocol works — set `AI_BASE_URL` to point at its endpoint.

<details>
<summary>BotHub</summary>

```env
AI_PROVIDER=openai
AI_API_KEY=your-bothub-api-key
AI_MODEL=gpt-5-nano
AI_BASE_URL=https://bothub.chat/api/v2/openai/v1
```

Get an API key at: https://bothub.chat

</details>

<details>
<summary>OpenAI</summary>

```env
AI_PROVIDER=openai
AI_API_KEY=sk-...
AI_MODEL=gpt-4o
```

No `AI_BASE_URL` needed — defaults to OpenAI's API.

Get an API key at: https://platform.openai.com/api-keys

</details>

<details>
<summary>OpenRouter</summary>

```env
AI_PROVIDER=openai
AI_API_KEY=sk-or-...
AI_MODEL=anthropic/claude-sonnet-4-20250514
AI_BASE_URL=https://openrouter.ai/api/v1
```

Model IDs follow OpenRouter format (`provider/model`).

Get an API key at: https://openrouter.ai/keys

</details>

<details>
<summary>Anthropic</summary>

```env
AI_PROVIDER=anthropic
AI_API_KEY=sk-ant-...
AI_MODEL=claude-sonnet-4-20250514
```

No `AI_BASE_URL` needed — defaults to Anthropic's API.

Get an API key at: https://console.anthropic.com/settings/keys

</details>

<details>
<summary>GLM (ZhipuAI)</summary>

```env
AI_PROVIDER=openai
AI_API_KEY=your-glm-api-key
AI_MODEL=glm-4-plus
AI_BASE_URL=https://open.bigmodel.cn/api/paas/v4
```

Get an API key at: https://open.bigmodel.cn

</details>

### Reasoning effort

For reasoning models (e.g. o3, o4-mini, gpt-5):

```env
AI_REASONING_EFFORT=minimal
```

Accepted values: `minimal`, `low`, `medium`, `high`.

## Usage

Commands are sent as outgoing messages in any chat.

| Command                                 | Description                               |
| --------------------------------------- | ----------------------------------------- |
| `/summary 100`                          | Summarise the last 100 messages           |
| `/summary 50 What was decided about X?` | Summarise with a specific question        |
| `/summary since:07:00`                  | Messages since 07:00 today                |
| `/summary since:11-03-2026_07:00`       | Messages since a specific date and time   |
| `/summary since:last_out_msg`           | Messages since your last outgoing message |
| `/summary last:30m`                     | Messages from the last 30 minutes         |
| `/summary last:2h`                      | Messages from the last 2 hours            |
| `/summary last:1d`                      | Messages from the last day                |

The bot edits the command message in place as it works, showing a progress indicator, then replaces it with the finished summary.

## Environment Variables

| Variable              | Description                            | Required | Default                    |
| --------------------- | -------------------------------------- | -------- | -------------------------- |
| `API_ID`              | Telegram API ID                        | Yes      |                            |
| `API_HASH`            | Telegram API Hash                      | Yes      |                            |
| `SESSION_FILE`        | SQLite session file path               | No       | `session.sqlite`           |
| `AI_PROVIDER`         | Protocol type: `openai` or `anthropic` | Yes      |                            |
| `AI_API_KEY`          | AI provider API key                    | Yes      |                            |
| `AI_MODEL`            | Model ID                               | No       | `gpt-4o`                   |
| `AI_BASE_URL`         | Provider API base URL                  | No       | OpenAI / Anthropic default |
| `AI_REASONING_EFFORT` | Reasoning effort level                 | No       | Not set (provider default) |
| `SUMMARY_LANGUAGE`    | Language for the summary output        | No       | `English`                  |
| `SUMMARY_TIMEZONE`    | Timezone used for timestamps           | No       | `Europe/Moscow`            |
| `PROMPT_FILE`         | Path to a custom system prompt file    | No       | `prompt.txt`               |

## Custom Prompts

The system prompt is loaded from the file specified by `PROMPT_FILE` (default: `prompt.txt`). Two template placeholders are available:

- `{{ language }}` - replaced with the value of `SUMMARY_LANGUAGE`
- `{{ timezone }}` - replaced with the value of `SUMMARY_TIMEZONE`

Example:

```
Summarise the following chat messages in {{ language }}. Timestamps are in {{ timezone }}.
```

## Docker

```sh
# Interactive setup
docker run -it -v ./data:/app m4l3vich/telegram-summariser-userbot setup

# Run the bot
docker run -d --env-file .env -v ./data:/app m4l3vich/telegram-summariser-userbot

# Build locally
docker build -t telegram-summariser .
docker run --env-file .env telegram-summariser
```

## Development

```sh
pnpm dev     # Run with hot-reload
pnpm build   # Build for production
pnpm start   # Run production build
pnpm setup   # Run the interactive setup wizard
```

Project structure:

```
src/
  index.ts             — Entry point, command handler, summarisation logic
  ai-provider.ts       — AI provider abstraction (OpenAI-compatible / Anthropic)
  fetch-messages.ts    — Message fetching with timestamp/count parsing
  prepare-messages.ts  — Message formatting for the AI model
  setup.ts             — Interactive setup wizard
  utils.ts             — Telegram message editing utilities
```
