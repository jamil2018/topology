module.exports = class Reporter {
  constructor(globalConfig, options) {
    this.reporter = import("@topology/jest").then(({ default: TopologyReporter }) =>
      new TopologyReporter(globalConfig, options));
  }

  async onRunComplete(contexts, results) {
    await (await this.reporter).onRunComplete(contexts, results);
  }
};
