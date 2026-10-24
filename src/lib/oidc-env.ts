export function oidcProviderConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(
    env.AUTH_OIDC_ISSUER?.trim() &&
      env.AUTH_OIDC_ID?.trim() &&
      env.AUTH_OIDC_SECRET?.trim(),
  );
}

export function oidcProviderName(env: NodeJS.ProcessEnv = process.env): string {
  return env.AUTH_OIDC_NAME?.trim() || "OIDC";
}
