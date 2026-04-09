import cors from "cors";
import express from "express";
import fs from "fs";
import { createServer } from "http";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import {
  chatWithPDF,
  processPDF,
  summarizeDocument,
  translatePDF,
  translateAIResponse,
} from "./services/rag.js";
import fsPromises from "fs/promises";

const sessionFiles = new Map();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Upload setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

import { getAllAudioBase64 } from "google-tts-api";

// Routes
app.post("/api/upload", upload.single("pdf"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const sessionId = req.body.sessionId;
  if (!sessionId) {
    // Clean up immediately if no session
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "No session specified" });
  }

  try {
    console.log(`Processing file: ${req.file.path} for session: ${sessionId}`);
    await processPDF(req.file.path, sessionId);

    // Track the file for cleanup on disconnect
    if (sessionFiles.has(sessionId)) {
      const oldFile = sessionFiles.get(sessionId);
      if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
    }
    sessionFiles.set(sessionId, req.file.path);

    res.json({
      message: "File uploaded and processed successfully",
      filename: req.file.filename,
    });
  } catch (error) {
    console.error("Error processing PDF:", error);
    fs.unlinkSync(req.file.path);
    res.status(500).json({ error: "Failed to process PDF" });
  }
});

app.post("/api/tts", async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "No text provided" });
  try {
    const results = await getAllAudioBase64(text, {
      lang: "en",
      slow: false,
      host: "https://translate.google.com",
      splitPunct: ",.?",
    });

    const buffers = results.map((r) => Buffer.from(r.base64, "base64"));
    const combined = Buffer.concat(buffers);

    res.set("Content-Type", "audio/mp3");
    res.send(combined);
  } catch (error) {
    console.error("TTS Error:", error);
    res.status(500).json({ error: "Synthesis failed" });
  }
});

// POST Endpoints replacing Socket.io
app.post("/api/chat", async (req, res) => {
  const { message, history, sessionId } = req.body;
  if (!message || !sessionId) return res.status(400).json({ error: "Missing message or sessionId" });

  try {
    const response = await chatWithPDF(message, history, sessionId);
    res.json({ response });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: "Failed to generate response" });
  }
});

app.post("/api/summarize", async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

  try {
    const summary = await summarizeDocument(sessionId);
    res.json({ summary });
  } catch (error) {
    console.error("Summary error:", error);
    res.status(500).json({ error: "Summarization failed" });
  }
});

app.post("/api/translate_response", async (req, res) => {
  const { text, language } = req.body;
  if (!text || !language) return res.status(400).json({ error: "Missing text or language" });

  try {
    const translated = await translateAIResponse(text, language);
    res.json({ text: translated });
  } catch (error) {
    console.error("AI translation error:", error);
    res.status(500).json({ error: "Translation failed" });
  }
});

app.post("/api/translate_document", async (req, res) => {
  const { language, filename } = req.body;
  const uploadDir = path.join(__dirname, "uploads");

  if (!filename || !language) {
    return res.status(400).json({ error: "No file or language specified for translation" });
  }

  const safeFilename = path.basename(filename);
  const filePath = path.join(uploadDir, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found for translation" });
  }

  try {
    const translatedPages = await translatePDF(language, filePath);
    res.json({ pages: translatedPages });
  } catch (error) {
    console.error("Translation error:", error);
    res.status(500).json({ error: "Translation failed" });
  }
});

app.post("/api/cleanup", (req, res) => {
  const sessionId = req.body?.sessionId;
  if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

  console.log("Cleaning up session:", sessionId);
  const file = sessionFiles.get(sessionId);
  if (file && fs.existsSync(file)) {
    try {
      fs.unlinkSync(file);
      console.log(`Cleaned up session file: ${file}`);
    } catch (err) {
      console.error(`Failed to clean up file ${file}:`, err);
    }
  }
  sessionFiles.delete(sessionId);
  // Optional: implement a way to delete the SimpleVectorStore from activeSessions in rag.js
  res.json({ success: true });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
