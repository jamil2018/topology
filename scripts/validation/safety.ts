/** Database names are generated in-process, never accepted from DATABASE_URL. */
export function assertOwnedDatabase(name: string, created: ReadonlySet<string>) {
  if (!/^topology_validation_[a-f0-9]{16}_(seeded|onboarding|migration|performance|restore|visual|lighthouse|container|browser_template|case_[a-f0-9]{16})$/.test(name) || !created.has(name)) {
    throw new Error("Refusing destructive operation on a database not created by this harness");
  }
}

export function redact(value: string, secrets: string[]) {
  let safe = value.replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[database URL redacted]");
  for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) {
    safe = safe.split(secret).join("[redacted]");
  }
  safe = safe.replace(/(\b(?:set-cookie|cookie):\s*)[^\r\n]+/gi, "$1[redacted]");
  safe = safe.replace(/authjs\.[a-z.-]+=[^;\s"']+/gi, "authjs.[redacted]");
  safe = safe.replace(/\btopo_[A-Za-z0-9_-]{16,}/g, "[API token redacted]");
  return safe.replace(/(Bearer\s+)[^\s"']+/gi, "$1[redacted]");
}
