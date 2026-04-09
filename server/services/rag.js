import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
process.env.OPENAI_API_KEY = process.env.OPEN_ROUTER_API_KEY;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Custom Pure JS Vector Store ---
class SimpleVectorStore {
  constructor(embeddings, documents = []) {
    this.embeddings = embeddings;
    this.documents = documents; // Array of { pageContent, metadata, vector }
  }

  static async fromDocuments(docs, embeddings) {
    const instance = new SimpleVectorStore(embeddings);
    await instance.addDocuments(docs);
    return instance;
  }

  async addDocuments(docs) {
    const texts = docs.map((d) => d.pageContent);
    console.log(`Generating embeddings for ${texts.length} chunks...`);
    const vectors = await this.embeddings.embedDocuments(texts);

    for (let i = 0; i < docs.length; i++) {
      this.documents.push({
        pageContent: docs[i].pageContent,
        metadata: docs[i].metadata,
        vector: vectors[i],
      });
    }
  }

  async similaritySearch(query, k = 4) {
    const queryVector = await this.embeddings.embedQuery(query);

    // Calculate Cosine Similarity
    const scoredDocs = this.documents.map((doc) => {
      const similarity = this.cosineSimilarity(queryVector, doc.vector);
      return { ...doc, score: similarity };
    });

    // Sort by Score (Descending)
    scoredDocs.sort((a, b) => b.score - a.score);

    return scoredDocs.slice(0, k);
  }

  cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
// -----------------------------------

const embeddings = new OpenAIEmbeddings({
  apiKey: process.env.OPEN_ROUTER_API_KEY,
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
  },
});

const model = new ChatOpenAI({
  apiKey: process.env.OPEN_ROUTER_API_KEY,
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
  },
  modelName: process.env.OPEN_ROUTER_MODEL,
});

const activeSessions = new Map();

export const processPDF = async (filePath, sessionId) => {
  try {
    console.log(`Processing PDF for session ${sessionId}...`);
    const loader = new PDFLoader(filePath);
    const docs = await loader.load();

    console.log("Splitting text...");
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const splitDocs = await splitter.splitDocuments(docs);

    console.log("Updating Vector Store...");
    const store = new SimpleVectorStore(embeddings);
    await store.addDocuments(splitDocs);
    activeSessions.set(sessionId, store);

    console.log("PDF Processed and stored for session.");
    return true;
  } catch (error) {
    console.error("Error processing PDF:", error);
    throw error;
  }
};

export const chatWithPDF = async (question, history, sessionId) => {
  const vectorStore = activeSessions.get(sessionId);
  if (!vectorStore || vectorStore.documents.length === 0) {
    return "Please upload a PDF first.";
  }

  // RAG Logic
  const relevantDocs = await vectorStore.similaritySearch(question, 4);
  const context = relevantDocs.map((d) => d.pageContent).join("\n\n");

  const template = `Answer the question based only on the following context:
{context}

Question: {question}

If the question is about filling a form, provide specific instructions on what to write in each field found in the context.
`;

  const prompt = PromptTemplate.fromTemplate(template);

  const chain = RunnableSequence.from([
    {
      context: () => context,
      question: () => question,
    },
    prompt,
    model,
    new StringOutputParser(),
  ]);

  const response = await chain.invoke({});
  return response;
};

export const summarizeDocument = async (sessionId) => {
  const vectorStore = activeSessions.get(sessionId);
  if (!vectorStore || vectorStore.documents.length === 0) {
    return "Please upload a PDF first.";
  }

  // Use a broad sample of chunks for a holistic summary
  const allDocs = vectorStore.documents.slice(0, 20); // Up to 20 chunks
  const context = allDocs.map((d) => d.pageContent).join("\n\n");

  const summaryModel = new ChatOpenAI({
    apiKey: process.env.OPEN_ROUTER_API_KEY,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
    },
    modelName: process.env.OPEN_ROUTER_MODEL,
    temperature: 0.3,
  });

  const prompt = `You are a document summarizer. Based on the following document content, provide a clear, structured summary covering:
1. Main topic and purpose of the document
2. Key points and important details
3. Any notable sections, conclusions, or takeaways

Document Content:
${context}

Provide the summary in a well-structured markdown format.`;

  const response = await summaryModel.invoke(prompt);
  return response.content;
};

export const translatePDF = async (targetLanguage, filePath) => {
  try {
    console.log(`Translating PDF to ${targetLanguage}...`);
    const loader = new PDFLoader(filePath);
    // Load raw docs to get page content directly
    const docs = await loader.load();

    const translatedPages = [];

    // Translate each page (or chunk) - limiting to first 5 pages for MVP speed/cost if needed,
    // but here we do all.
    // Note: For very large PDFs, this might take a while.

    const translationModel = new ChatOpenAI({
      apiKey: process.env.OPEN_ROUTER_API_KEY,
      configuration: {
        baseURL: "https://openrouter.ai/api/v1",
      },
      modelName: process.env.OPEN_ROUTER_MODEL,
      temperature: 0.3,
    });

    for (const doc of docs) {
      const prompt = `Translate the following text to ${targetLanguage}. Maintain the original formatting structure (paragraphs, lists) as much as possible. Do not add introductory text.

Text:
${doc.pageContent}`;

      const response = await translationModel.invoke(prompt);
      translatedPages.push(response.content);
    }

    return translatedPages;
  } catch (error) {
    console.error("Translation error:", error);
    throw error;
  }
};

export const translateAIResponse = async (text, language) => {
  try {
    const translationModel = new ChatOpenAI({
      apiKey: process.env.OPEN_ROUTER_API_KEY,
      configuration: { baseURL: "https://openrouter.ai/api/v1" },
      modelName: process.env.OPEN_ROUTER_MODEL,
      temperature: 0.3,
    });
    const prompt = `Translate the following text to ${language}. Maintain the formatting exactly.\n\nText:\n${text}`;
    const response = await translationModel.invoke(prompt);
    return response.content;
  } catch (error) {
    console.error("AI Response translation error:", error);
    throw error;
  }
};
