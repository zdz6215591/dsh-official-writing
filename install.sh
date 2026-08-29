#!/usr/bin/env bash
# 公文写作助手 · DeepSeek Harness 在线安装
# 用法:
#   curl -fsSL https://raw.githubusercontent.com/zdz6215591/dsh-official-writing/main/install.sh | bash

set -euo pipefail
REPO='github:zdz6215591/dsh-official-writing'

if ! command -v dsh >/dev/null 2>&1; then
  echo "未找到 dsh。请先安装 DeepSeek Harness CLI：npm i -g @deepseek-ai/dsh" >&2
  exit 1
fi

echo "正在把公文写作助手装到 web profile…"
dsh plugin --profile web add "$REPO"
echo "安装完成。请重启 dsh web，左侧活动栏「添加工作区」右侧会出现「公文写作助手」。"
