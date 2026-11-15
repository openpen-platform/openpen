// Parses the stdout of `gh api users/<login> --jq '[.id, .login, .type] | @json'`.
export function parseOwnerInfo(stdout) {
  let parsed
  try {
    parsed = JSON.parse(stdout.trim())
  } catch {
    parsed = null
  }
  if (!Array.isArray(parsed) || parsed.length !== 3) {
    throw new Error(`Unexpected owner info from gh: ${JSON.stringify(stdout.trim())}`)
  }
  const [ownerId, ownerLogin, ownerType] = parsed
  return { ownerId, ownerLogin, ownerType }
}
