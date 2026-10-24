/** Prefer shared CI/agent token helpers */
export {
  authenticateCiRequest as authenticateApiToken,
  generateApiToken,
  hashToken,
  type ApiTokenScope,
} from "@/lib/ci-auth";
