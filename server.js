import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from "@google/genai";
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// --- Initialization ---
dotenv.config({ path: ".env.local" });

// Initialize Firebase Admin
try {
  const serviceAccount = JSON.parse(readFileSync('./firebase-service-account.json', 'utf8'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("Firebase Admin initialized successfully.");
} catch (error) {
  console.error("Error initializing Firebase Admin:", error);
  console.error("Please ensure 'firebase-service-account.json' is in the root directory.");
  process.exit(1);
}


const app = express();
const PORT = 3001;

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Auth Middleware to verify Firebase ID token
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send({ error: 'Unauthorized: No token provided.' });
  }
  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying token:', error);
    return res.status(403).send({ error: 'Forbidden: Invalid token.' });
  }
};


// --- Gemini AI Setup ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY environment variable not set");
}
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// --- API Routes ---

// Secure this route with the verifyToken middleware
app.post('/api/process-file', verifyToken, async (req, res) => {
  console.log(`Processing file for user: ${req.user.uid}`);
  try {
    const { fileData, mimeType } = req.body;
    if (!fileData || !mimeType) {
      return res.status(400).json({ error: 'Missing fileData or mimeType' });
    }

    const filePart = { inlineData: { data: fileData, mimeType } };
    const textPart = {
      text: "First, extract the full text content from this file. If it's audio, transcribe it. If it's a document, extract the text. After extracting the text, please perform a cleaning pass: correct any grammatical errors, ensure proper spacing between words that may have been joined together, and reconstruct the original paragraph structure with appropriate line breaks. The final text should be clean and readable. Second, based on the cleaned content, generate a concise summary. Third, generate 5-7 relevant keywords or tags. Fourth, suggest 1-3 relevant categories for the story (e.g., 'Technology', 'Health', 'Science'). Return the result as a JSON object with four keys: 'content' for the cleaned text, 'summary' for the summary, 'tags' for the keywords, and 'categories' for the categories."
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [filePart, textPart] },
      config: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            content: { type: Type.STRING },
            summary: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            categories: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
        },
      }
    });

    res.json(JSON.parse(response.text));
  } catch (error) {
    console.error("Error processing file in backend:", error);
    res.status(500).json({ error: "Failed to process file on the server." });
  }
});


app.post('/api/summarize', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
        return res.status(400).json({ error: 'Missing text to summarize' });
    }
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Please provide a concise, easy-to-read summary of the following text:\n\n---\n\n${text}`,
    });
    res.json({ summary: response.text });
  } catch (error) {
    console.error("Error summarizing text in backend:", error);
    res.status(500).json({ error: "Failed to summarize text on the server." });
  }
});


app.post('/api/chat', async (req, res) => {
  try {
    const { history, message } = req.body;
    if (!history || !message) {
        return res.status(400).json({ error: 'Missing history or message for chat' });
    }

    // System prompt to define the AI's personality
    const systemPrompt = `You are a friendly and empathetic guide for the "Living Library 2.0," a collection of personal stories about diverse human experiences. Your name is 'Leo'. Your purpose is to help users explore these stories and connect with their themes. Be warm, encouraging, and curious. Ask thoughtful follow-up questions. When appropriate, gently guide users toward the library's themes of caste, gender, migration, and identity. Do not sound like a generic AI. Sound like a friend who loves stories and believes in the power of listening.`;

    const chat = ai.chats.create({ 
      model: 'gemini-2.5-flash', 
      history,
      systemInstruction: systemPrompt 
    });

    const response = await chat.sendMessage({ message });
    res.json({ text: response.text });
  } catch (error) {
    console.error("Error handling chat in backend:", error);
    res.status(500).json({ error: "Failed to get chat response from the server." });
  }
});

// --- Server Start ---

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});