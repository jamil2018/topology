export type PluginKind = "ci" | "scm" | "issue" | "ai" | "reporter";

export type PluginDescriptor<TConfig = Record<string, unknown>> = {
  id: string;
  kind: PluginKind;
  label: string;
  create: (config: TConfig) => unknown;
};

export type PluginRegistry = Map<string, PluginDescriptor>;
