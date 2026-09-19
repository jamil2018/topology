import type { PluginDescriptor, PluginKind, PluginRegistry } from "./types";

const globalRegistry: PluginRegistry = new Map();

export function registerPlugin<TConfig>(
  descriptor: PluginDescriptor<TConfig>,
): PluginDescriptor<TConfig> {
  if (globalRegistry.has(descriptor.id)) {
    throw new Error(`Plugin already registered: ${descriptor.id}`);
  }
  globalRegistry.set(
    descriptor.id,
    descriptor as PluginDescriptor<Record<string, unknown>>,
  );
  return descriptor;
}

export function getPlugin(id: string): PluginDescriptor | undefined {
  return globalRegistry.get(id);
}

export function listPlugins(kind?: PluginKind): PluginDescriptor[] {
  const all = [...globalRegistry.values()];
  return kind ? all.filter((p) => p.kind === kind) : all;
}

export function createPlugin<TConfig extends Record<string, unknown>>(
  id: string,
  config: TConfig,
): unknown {
  const descriptor = globalRegistry.get(id);
  if (!descriptor) {
    throw new Error(`Unknown plugin: ${id}`);
  }
  return descriptor.create(config);
}

/** Test helper — clears the in-process registry. */
export function resetPluginRegistry() {
  globalRegistry.clear();
}
