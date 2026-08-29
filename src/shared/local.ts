export function isLocalRoute(provider: string, providerName = ''): boolean {
  const hay = `${provider} ${providerName}`.toLowerCase()
  return /ollama|vllm|lm[- ]?studio|localai|localhost|127\.0\.0\.1|\blocal\b|gguf|llama\.cpp|kobold|openvino/.test(
    hay,
  )
}
