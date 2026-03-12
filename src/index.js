const { startMetrics } = require("./metrics.ts");
const app = require("./service.js");

// Prefer explicit PORT env, then CLI arg, then default 3000
const port = process.env.PORT || process.argv[2] || 3000;

startMetrics();

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
