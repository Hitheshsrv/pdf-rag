# PDF RAG (Retrieval-Augmented Generation)

This project implements a PDF document analysis system using RAG (Retrieval-Augmented Generation) architecture. It consists of a Next.js client application for the frontend and a server component that handles document processing and embeddings.

## Project Structure

```
├── client/           # Next.js frontend application
│   ├── app/         # Next.js app router components
│   ├── components/  # React components
│   └── lib/        # Utility functions
├── server/          # Backend server
    ├── embeddings/  # Embedding generation logic
    ├── qdrant/     # Vector database configuration
    ├── valkey/     # Key validation service
    └── upload/     # File upload handling
```

## Features

- PDF document upload and processing
- Document text extraction and embedding generation
- Vector similarity search using Qdrant
- Local LLM integration using Ollama (Llama 3.1)
- Interactive chat interface for document queries
- Secure authentication using Clerk
- UI built with Next.js 13+ and Tailwind CSS

## Prerequisites

- Node.js 16+
- Python 3.8+
- Docker and Docker Compose
- pnpm (for package management)
- Ollama (for running local LLM)

### Installing Ollama
1. Install Ollama from [ollama.ai](https://ollama.ai)
2. Pull the Llama model:
```bash
ollama pull llama2:latest
```

## Installation

1. Clone the repository:
```bash
git clone https://github.com/Hitheshsrv/pdf-rag.git
cd pdf-rag
```

2. Install client dependencies:
```bash
cd client
pnpm install
```

3. Install server dependencies:
```bash
cd ../server
pnpm install
pip install -r requirements.txt
```

4. Start the Docker services:
```bash
cd server
docker-compose up -d
```

5. Start the development services:

First, start the Docker containers:
```bash
cd server
docker-compose up -d
```

This will start:
- Qdrant vector database
- Valkey service

Start Ollama with the Llama model:
```bash
ollama run llama2
```

Then start the server components (in separate terminals):

For the main server:
```bash
cd server
pnpm dev
```

For the worker process:
```bash
cd server
pnpm dev:worker
```

For the Python embedding server:
```bash
cd server
python embedding_server.py
```

Finally, start the client:
```bash
cd client
pnpm dev
```

## Environment Variables

Create `.env` files in both client and server directories with the necessary configuration variables.

### Server Environment Variables
```env
PORT = 8000
QDRANT_URL = "http://localhost:6333"
```

### Client Environment Variables
```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key
```

You'll need to create a Clerk application at [clerk.com](https://clerk.com) and obtain these authentication keys.

## Acknowledgments

- Next.js for the frontend framework
- Qdrant for vector similarity search
- Python for embedding generation
- Clerk for authentication and user management
