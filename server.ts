import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import cron from "node-cron";
import { exec } from "child_process";
import { promisify } from "util";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Run crawls every morning at 8 AM German time
  cron.schedule("0 8 * * *", () => {
    console.log("Starting daily 8AM crawl...");
    
    exec("npx tsx scrape_otto.ts", (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing Otto scrape: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`Otto scrape stderr: ${stderr}`);
      }
      console.log(`Otto scrape results:\n${stdout}`);
      
      // Run Praxis after Otto completes
      exec("npx tsx scrape_praxis.ts", (error2, stdout2, stderr2) => {
        if (error2) {
          console.error(`Error executing Praxis scrape: ${error2.message}`);
          return;
        }
        if (stderr2) {
          console.error(`Praxis scrape stderr: ${stderr2}`);
        }
        console.log(`Praxis scrape results:\n${stdout2}`);
      });
    });
  }, {
    timezone: "Europe/Berlin"
  });

  // Basic API status
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Optional manual trigger endpoint for crawled data
  app.post("/api/crawl", async (req, res) => {
    console.log("Manual crawl triggered via API...");
    const execAsync = promisify(exec);
    
    try {
      console.log("Running Otto scrape...");
      await execAsync("npx tsx scrape_otto.ts");
      console.log("Running Praxis scrape...");
      await execAsync("npx tsx scrape_praxis.ts");
      console.log("Manual crawl completed successfully.");
      res.json({ message: "Crawl completed successfully" });
    } catch (error: any) {
      console.error(`Error executing scans: ${error.message}`);
      res.status(500).json({ message: "Crawl failed", error: error.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    // Vite middleware for development
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Static serving for production
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Cron scheduler active. Crawls set for 08:00 AM (Europe/Berlin).`);
  });
}

startServer();
