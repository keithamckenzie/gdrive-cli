#!/usr/bin/env bash
# shellcheck disable=SC2034
# Single source of truth for hook policy.
# Sourced by scripts/git-hooks/*; never executed directly.

if [[ -n "${HOOK_POLICY_LOADED:-}" ]]; then
  return 0
fi
readonly HOOK_POLICY_LOADED=1

readonly -a HOOK_AI_ATTRIBUTION_LITERAL_PATTERNS=(
  "claude code"
  "github copilot"
  "cursor ai"
  "cursor ide"
  "gemini-cli"
  "gemini cli"
  "geminicommit"
  "codex"
  "aicommit"
  "windsurf"
  "aider"
  "[ai-assisted]"
  "[ai-generated]"
  "(ai-assisted)"
  "(ai-generated)"
  "generated with"
  "ai-assisted"
  "ai-generated"
  "with ai help"
  "ai helped"
)

readonly -a HOOK_AI_ATTRIBUTION_REGEX_PATTERNS=(
  "co-authored-by:.*noreply@anthropic"
  "co-authored-by: claude"
)

readonly -a HOOK_PROCESS_JARGON_LITERAL_PATTERNS=(
  "clean pass"
  "gate-status"
  "needs_work"
  "acceptance criteria"
)

readonly -a HOOK_PROCESS_JARGON_REGEX_PATTERNS=(
  "(^|[^[:alnum:]])slice [a-z0-9]"
  "(^|[^[:alnum:]])phase [0-9]"
  "(^|[^[:alnum:]])tier [0-2]"
  "(^|[^[:alnum:]])round [0-9]"
  "codex[ -](review|implement|fix|plan)"
  "gemini[ -](review|ui)"
)

MATCHED_PATTERN=""

has_ai_attribution() {
  local input="${1:-}"
  MATCHED_PATTERN=""

  if [[ -z "$input" ]]; then
    return 1
  fi

  local lowered_input
  lowered_input=$(printf '%s' "$input" | tr '[:upper:]' '[:lower:]')

  local pattern
  for pattern in "${HOOK_AI_ATTRIBUTION_LITERAL_PATTERNS[@]}"; do
    if [[ "$lowered_input" == *"$pattern"* ]]; then
      MATCHED_PATTERN="$pattern"
      return 0
    fi
  done

  for pattern in "${HOOK_AI_ATTRIBUTION_REGEX_PATTERNS[@]}"; do
    if [[ "$lowered_input" =~ $pattern ]]; then
      MATCHED_PATTERN="$pattern"
      return 0
    fi
  done

  return 1
}

has_process_jargon() {
  local input="${1:-}"
  MATCHED_PATTERN=""

  if [[ -z "$input" ]]; then
    return 1
  fi

  local lowered_input
  lowered_input=$(printf '%s' "$input" | tr '[:upper:]' '[:lower:]')

  local pattern
  for pattern in "${HOOK_PROCESS_JARGON_LITERAL_PATTERNS[@]}"; do
    if [[ "$lowered_input" == *"$pattern"* ]]; then
      MATCHED_PATTERN="$pattern"
      return 0
    fi
  done

  for pattern in "${HOOK_PROCESS_JARGON_REGEX_PATTERNS[@]}"; do
    if [[ "$lowered_input" =~ $pattern ]]; then
      MATCHED_PATTERN="$pattern"
      return 0
    fi
  done

  return 1
}
