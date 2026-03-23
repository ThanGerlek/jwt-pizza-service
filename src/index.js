const { createProdDependencies } = require("./depInjector.ts");
const { createApp } = require("./service.js");

// Prefer explicit PORT env, then CLI arg, then default 3000
const port = process.env.PORT || process.argv[2] || 3000;
const deps = createProdDependencies();
const app = createApp(deps);

deps.metricsManager.startMetrics();

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
