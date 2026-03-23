const { createProdDependencies } = require("./depInjector.ts");
const { createApp } = require("./service.js");

// Prefer explicit PORT env, then CLI arg, then default 3000
const port = process.env.PORT || process.argv[2] || 3000;
const deps = createProdDependencies();
const app = createApp(deps);

process.on("unhandledRejection", (reason) => {
  deps.logger.log("error", "unhandled-exception", {
    type: "unhandledRejection",
    reason,
  });
});

process.on("uncaughtException", (error) => {
  deps.logger.log("error", "unhandled-exception", {
    type: "uncaughtException",
    error: {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
    },
  });
});

deps.metricsManager.startMetrics();

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
