import express from "express";
import "dotenv/config";
import searchRoutes from "./routes/search.js";
import redirectRoutes from "./routes/redirect.js";

const app = express();
app.use(express.json());

app.use("/api", searchRoutes);
app.use("/", redirectRoutes);

app.get("/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API running on :${port}`));
