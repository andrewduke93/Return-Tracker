import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const upload = multer({ dest: "uploads/" });

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Ensure uploads directory exists
  if (!fs.existsSync("uploads")) {
    fs.mkdirSync("uploads");
  }

  // API Route for PWA Share Target
  app.post("/api/share", upload.single("media"), (req: any, res) => {
    if (!req.file) {
      return res.redirect("/");
    }

    // In a real app, we'd upload to cloud storage.
    // Here, we'll read the file, convert to base64, and pass it via a temporary session or just a redirect with a flag.
    // Since we can't easily pass large base64 in URL, we'll serve it from a temp route.
    const fileId = req.file.filename;
    res.redirect(`/?sharedFileId=${fileId}&mimeType=${req.file.mimetype}`);
  });

  // Route to get the shared file content
  app.get("/api/shared-file/:id", (req, res) => {
    const filePath = path.join(__dirname, "uploads", req.params.id);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).send("File not found");
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
