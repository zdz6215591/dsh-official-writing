# 公文写作助手 · DeepSeek Harness 在线安装
# 用法（PowerShell）:
#   irm https://raw.githubusercontent.com/zdz6215591/dsh-official-writing/main/install.ps1 | iex

$ErrorActionPreference = 'Stop'
$Repo = 'github:zdz6215591/dsh-official-writing'

function Require-Cmd([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "未找到命令 $Name。请先安装 DeepSeek Harness CLI（npm i -g @deepseek-ai/dsh）。"
  }
}

Require-Cmd dsh
Write-Host "正在把公文写作助手装到 web profile…"
& dsh plugin --profile web add $Repo
if ($LASTEXITCODE -ne 0) { throw "dsh plugin 安装失败（exit $LASTEXITCODE）" }
Write-Host "安装完成。请重启 dsh web，左侧活动栏「添加工作区」右侧会出现「公文写作助手」。"
