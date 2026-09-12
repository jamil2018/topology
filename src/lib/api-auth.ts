/** Prefer shared CI/agent token helpers */
export {
  authenticateCiRequest as authenticateApiToken,
  generateApiToken,
  hashToken,
} from "@/lib/ci-auth";
