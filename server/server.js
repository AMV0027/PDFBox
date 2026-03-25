import cors from 'cors';
import express from 'express';
import fs from 'fs';
import {createServer} from 'http';
import multer from 'multer';
import path from 'path';
import {Server} from 'socket.io';
import {fileURLToPath} from 'url';
import {createChat, getAllChats, getChatById, saveMessage, deleteChat, updateChatTitle} from './services/chatStore.js';
import {chatWithPDF, processPDF, summarizeDocument, translatePDF, translateAIResponse} from './services/rag.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*", // Allow all origins for development
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Upload setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, {recursive: true});
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({storage});

// Routes
app.post('/api/upload', upload.single('pdf'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({error: 'No file uploaded'});
    }

    try {
        console.log(`Processing file: ${req.file.path}`);
        await processPDF(req.file.path);
        res.json({message: 'File uploaded and processed successfully', filename: req.file.filename});
    } catch (error) {
        console.error('Error processing PDF:', error);
        res.status(500).json({error: 'Failed to process PDF'});
    }
});

// Chat History API
app.get('/api/chats', (req, res) => {
    const chats = getAllChats();
    res.json(chats);
});

app.post('/api/chats', (req, res) => {
    const newChat = createChat();
    res.json(newChat);
});

app.get('/api/chats/:id', (req, res) => {
    const chat = getChatById(req.params.id);
    if (!chat) {
        return res.status(404).json({error: 'Chat not found'});
    }
    res.json(chat);
});

app.delete('/api/chats/:id', (req, res) => {
    const success = deleteChat(req.params.id);
    if (success) {
        res.json({message: 'Chat deleted'});
    } else {
        res.status(404).json({error: 'Chat not found'});
    }
});

app.put('/api/chats/:id', (req, res) => {
    const {title} = req.body;
    const chat = updateChatTitle(req.params.id, title);
    if (chat) {
        res.json({message: 'Chat updated', chat});
    } else {
        res.status(404).json({error: 'Chat not found'});
    }
});

// Socket.io for Chat
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('chat_message', async (data) => {
        const {message, history, sessionId} = data;

        // Save user message
        if (sessionId) {
            saveMessage(sessionId, {
                id: Date.now().toString(),
                role: 'user',
                content: message,
                timestamp: new Date()
            });
        }

        try {
            const response = await chatWithPDF(message, history);

            // Save AI response
            if (sessionId) {
                saveMessage(sessionId, {
                    id: (Date.now() + 1).toString(),
                    role: 'ai',
                    content: response,
                    timestamp: new Date()
                });
            }

            socket.emit('ai_response', response);
        } catch (error) {
            console.error('Chat error:', error);
            socket.emit('error', {message: 'Failed to generate response'});
        }
    });

    socket.on('summarize_document', async () => {
        try {
            socket.emit('summary_start', {message: 'Generating summary...'});
            const summary = await summarizeDocument();
            socket.emit('summary_complete', {summary});
        } catch (error) {
            console.error('Summary error:', error);
            socket.emit('error', {message: 'Summarization failed'});
        }
    });

    socket.on('translate_ai_response', async (data) => {
        try {
            const translated = await translateAIResponse(data.text, data.language);
            socket.emit('ai_response_translated', {text: translated});
        } catch (error) {
            console.error('AI translation error:', error);
        }
    });

    socket.on('translate_document', async (data) => {
        const {language, filename} = data;
        const uploadDir = path.join(__dirname, 'uploads');

        if (!filename) {
            socket.emit('error', {message: 'No file specified for translation'});
            return;
        }

        // Safety check for filename
        const safeFilename = path.basename(filename);
        const filePath = path.join(uploadDir, safeFilename);

        if (!fs.existsSync(filePath)) {
            socket.emit('error', {message: 'File not found for translation'});
            return;
        }

        try {
            socket.emit('translation_start', {message: 'Translation started...'});
            const translatedPages = await translatePDF(language, filePath);
            socket.emit('translation_complete', {pages: translatedPages});
        } catch (error) {
            console.error('Translation error:', error);
            socket.emit('error', {message: 'Translation failed'});
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
