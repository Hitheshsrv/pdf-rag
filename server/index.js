import express from 'express';
import cors from 'cors';
import { QdrantVectorStore } from "@langchain/qdrant";
import multer from 'multer';
import { Queue } from "bullmq";
import { Ollama } from 'ollama';
import 'dotenv/config';

import { PythonEmbeddings } from "./embeddings/PythonEmbeddings.js";

// Initialize Ollama client
const ollama = new Ollama({
  host: 'http://localhost:11434' // Default Ollama host
});

const queue = new Queue("file-upload-queue", {
    connection: {
        host: 'localhost',
        port: '6379',
    }
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'upload/')
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, `${uniqueSuffix}-${file.originalname}`)
  }
})

const embeddings = new PythonEmbeddings({
    apiUrl: "http://localhost:5001"
});

const vectorStore = await QdrantVectorStore.fromExistingCollection(
    embeddings,
    {
        url: 'http://localhost:6333',
        collectionName: "langchainjs-testing",
    }
);

const upload = multer({ storage: storage });

const app = express();

// Configure CORS properly for your frontend
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:3001'], // Add your frontend URLs
    credentials: true,
}));

app.use(express.json({ limit: '10mb' })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// In-memory storage for chat sessions (you can replace with a database)
const chatSessions = new Map();

app.post('/upload/pdf', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }

        await queue.add('file-ready', JSON.stringify({
            filename: req.file.originalname,
            destination: req.file.destination,
            path: req.file.path,
        }));

        return res.json({ 
            message: 'PDF uploaded successfully',
            filename: req.file.originalname,
            fileId: req.file.filename
        });
    } catch (error) {
        console.error('Upload error:', error);
        return res.status(500).json({ error: 'Failed to upload PDF' });
    }
});

app.post('/chat', async (req, res) => {
    try {
        const { query, model = 'llama3.1', sessionId = 'default' } = req.body;
        
        if (!query || typeof query !== 'string' || !query.trim()) {
            return res.status(400).json({ error: 'Valid query is required' });
        }

        console.log(`Received chat request: "${query}"`);

        // Initialize session if doesn't exist
        if (!chatSessions.has(sessionId)) {
            chatSessions.set(sessionId, {
                messages: [],
                createdAt: new Date(),
                lastActivity: new Date()
            });
        }

        // Update last activity
        const session = chatSessions.get(sessionId);
        session.lastActivity = new Date();

        // Retrieve relevant context from vector store
        const retriever = vectorStore.asRetriever({
            k: 3, // Retrieve top 3 most relevant chunks
        });
        
        console.log('Retrieving context from vector store...');
        const retrievedDocs = await retriever.invoke(query);
        console.log(`Retrieved ${retrievedDocs.length} documents`);
        
        // Extract context from retrieved documents
        const context = retrievedDocs
            .map(doc => doc.pageContent)
            .join('\n\n');

        if (!context.trim()) {
            console.log('No relevant context found in vector store');
        }

        // Create prompt with context and user query
        const prompt = `You are a helpful AI assistant that answers questions based on the provided context from PDF documents.

Context from documents:
${context || 'No relevant context found in the documents.'}

User Question: ${query}

Instructions:
- Answer the question based primarily on the provided context
- If the context contains relevant information, use it to provide a comprehensive answer
- If the context doesn't contain enough information, clearly mention this limitation
- Be concise but thorough in your response
- If no context is provided, politely explain that you need relevant documents to answer the question

Answer:`;

        console.log('Generating response with Ollama...');
        
        // Generate response using Ollama
        const response = await ollama.chat({
            model: model,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            options: {
                temperature: 0.7,
                top_p: 0.9,
            }
        });

        const assistantResponse = response.message.content;

        // Store messages in session
        session.messages.push(
            {
                role: 'user',
                content: query,
                timestamp: new Date()
            },
            {
                role: 'assistant',
                content: assistantResponse,
                timestamp: new Date(),
                context: retrievedDocs.map(doc => ({
                    content: doc.pageContent,
                    metadata: doc.metadata
                })),
                model_used: model
            }
        );

        console.log('Response generated successfully');

        return res.json({
            answer: assistantResponse,
            context: retrievedDocs.map(doc => ({
                content: doc.pageContent,
                metadata: doc.metadata
            })),
            model_used: model,
            sessionId: sessionId,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Chat error:', error);
        
        // More specific error handling
        if (error.message.includes('Connection refused')) {
            return res.status(503).json({ 
                error: 'Ollama service is not available. Please ensure Ollama is running.',
                details: error.message 
            });
        }
        
        if (error.message.includes('model')) {
            return res.status(400).json({ 
                error: 'Model not found. Please ensure the specified model is available in Ollama.',
                details: error.message 
            });
        }

        return res.status(500).json({ 
            error: 'Failed to process chat request',
            details: error.message 
        });
    }
});

// Get chat history for a session
app.get('/chat/history/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId;
    const session = chatSessions.get(sessionId);
    
    if (!session) {
        return res.json({ messages: [] });
    }
    
    return res.json({
        messages: session.messages,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity
    });
});

// Get default chat history
app.get('/chat/history', (req, res) => {
    const session = chatSessions.get('default');
    
    if (!session) {
        return res.json({ messages: [] });
    }
    
    return res.json({
        messages: session.messages,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity
    });
});

// Clear chat history for a session
app.delete('/chat/history/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId;
    chatSessions.delete(sessionId);
    return res.json({ message: 'Chat history cleared' });
});

// Clear default chat history
app.delete('/chat/history', (req, res) => {
    chatSessions.delete('default');
    return res.json({ message: 'Chat history cleared' });
});

// Get available models endpoint
app.get('/models', async (req, res) => {
    try {
        const models = await ollama.list();
        return res.json({ models: models.models });
    } catch (error) {
        console.error('Models error:', error);
        return res.status(500).json({ error: 'Failed to fetch models' });
    }
});

// Health check endpoint
app.get('/health', async (req, res) => {
    const health = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        services: {}
    };

    // Check Ollama
    try {
        await ollama.list();
        health.services.ollama = 'OK';
    } catch (error) {
        health.services.ollama = 'DOWN';
        health.status = 'DEGRADED';
    }

    // Check Qdrant (basic check)
    try {
        // This is a simple check - you might want to add a proper health check
        health.services.qdrant = 'OK';
    } catch (error) {
        health.services.qdrant = 'DOWN';
        health.status = 'DEGRADED';
    }

    res.json(health);
});

// Cleanup old sessions (run every hour)
setInterval(() => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    for (const [sessionId, session] of chatSessions.entries()) {
        if (session.lastActivity < oneHourAgo) {
            chatSessions.delete(sessionId);
            console.log(`Cleaned up inactive session: ${sessionId}`);
        }
    }
}, 60 * 60 * 1000); // Run every hour

const port = process.env.PORT || 8000;

app.listen(port, () => {
    console.log(`Server started on PORT: ${port}`);
    console.log(`Health check available at: http://localhost:${port}/health`);
});