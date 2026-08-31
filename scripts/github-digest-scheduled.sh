#!/bin/zsh
# scheduler-hub 定时任务的入口：只做两件事——把已经在环境里的 OPENROUTER_API_KEY
# 映射成 github-digest.mjs 认的变量名，然后跑脚本。不读、不存任何凭证的值，
# 这个文件里没有一个真实的 key——login shell 会自动带着它（见 CLAUDE.md 的
# agent-secrets 约定：渲染进 runtime.sh 后，每个 shell 都能拿到）。
set -euo pipefail
cd "$(dirname "$0")/.."

export GRAPH_LLM_API_KEY="$OPENROUTER_API_KEY"
export GRAPH_LLM_BASE_URL="https://openrouter.ai/api/v1"
export GRAPH_LLM_MODEL="deepseek/deepseek-chat"
export NODE_USE_ENV_PROXY=1

node scripts/github-digest.mjs
