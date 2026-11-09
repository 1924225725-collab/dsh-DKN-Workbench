import * as llm from '@deepseek-ai/dsh-llm'

export const LlmAdapter = llm.LlmAdapter ?? class {}
export const LlmError = llm.LlmError ?? class extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'LlmError'
    this.code = code
  }
}
export const ReasoningEffortId = llm.ReasoningEffortId ?? ((value) => value)
export const resolveRetryPolicy = llm.resolveRetryPolicy ?? ((value) => value ?? { mode: 'normal', maxRetries: 0 })
export const RetryPolicySchema = llm.RetryPolicySchema ?? {}
export const offloadedImageText = llm.offloadedImageText ?? ((ref) => '[image omitted: ' + (typeof ref?.id === 'string' ? ref.id : 'unavailable') + ']')
