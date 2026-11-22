#!/usr/bin/env node
import { startTopologyMcpServer } from "../dist/server.js";

startTopologyMcpServer().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
