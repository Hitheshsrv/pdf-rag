import { Worker } from "bullmq";
import { QdrantVectorStore } from "@langchain/qdrant";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import 'dotenv/config';



import { PythonEmbeddings } from "./embeddings/PythonEmbeddings.js";

// Suppress HuggingFace warnings
process.env.TRANSFORMERS_VERBOSITY = 'error';

const worker = new Worker(
  "file-upload-queue",
  async (job) => {
    try {
      console.log(`🚀 Processing job ${job.id}...`);
      
      const data = JSON.parse(job.data);
      console.log(`📄 Loading PDF from: ${data.path}`);
      
      // Load PDF
      const loader = new PDFLoader(data.path);
      const docs = await loader.load();
      console.log(`✅ Loaded ${docs.length} documents`);
      console.log(`📊 Total characters: ${docs.reduce((sum, doc) => sum + doc.pageContent.length, 0)}`);

      // IMPORTANT: Split documents into chunks
      console.log("✂️ Splitting documents into chunks...");
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });
      
      const splitDocs = await textSplitter.splitDocuments(docs);
      console.log(`✅ Split into ${splitDocs.length} chunks`);

      // Initialize embeddings
      console.log("🤖 Initializing Python embeddings...");
      const embeddings = new PythonEmbeddings({
        apiUrl: "http://localhost:5001"
      });
      console.log("✅ python embeddings initialized");

      // Test embeddings first
      console.log("🧪 Testing embeddings with sample text...");
      const testEmbedding = await embeddings.embedQuery("This is a test sentence.");
      console.log(`✅ Test embedding successful. Dimensions: ${testEmbedding.length}`);

      // Connect to Qdrant
      console.log("🔗 Connecting to Qdrant...");
      let vectorStore;
      try {
        vectorStore = await QdrantVectorStore.fromExistingCollection(
          embeddings,
          {
            url: 'http://localhost:6333',
            collectionName: "langchainjs-testing",
          }
        );
        console.log("✅ Connected to Qdrant successfully");
      } catch (qdrantError) {
        console.error("❌ Failed to connect to Qdrant:", qdrantError.message);
        
        // Try to create collection if it doesn't exist
        console.log("🔧 Attempting to create new collection...");
        vectorStore = await QdrantVectorStore.fromDocuments(
          splitDocs.slice(0, 1), // Use first document to create collection
          embeddings,
          {
            url: 'http://localhost:6333',
            collectionName: "langchainjs-testing",
          }
        );
        console.log("✅ Created new Qdrant collection");
        
        // Add remaining documents
        if (splitDocs.length > 1) {
          await vectorStore.addDocuments(splitDocs.slice(1));
        }
        console.log(`✅ Added all ${splitDocs.length} chunks to new collection`);
        return {
          success: true,
          documentsProcessed: docs.length,
          chunksCreated: splitDocs.length,
          message: "PDF processed and new collection created"
        };
      }

      // Add documents to existing collection
      console.log(`📤 Adding ${splitDocs.length} chunks to Qdrant...`);
      await vectorStore.addDocuments(splitDocs);
      console.log(`✅ Successfully added ${splitDocs.length} embeddings to Qdrant`);

      // Verify documents were added
      console.log("🔍 Verifying documents were added...");
      const searchTest = await vectorStore.similaritySearch("test", 1);
      console.log(`✅ Verification successful. Found ${searchTest.length} similar documents`);
      
      return {
        success: true,
        documentsProcessed: docs.length,
        chunksCreated: splitDocs.length,
        message: "PDF processed and embeddings stored successfully"
      };
      
    } catch (error) {
      console.error("❌ Job processing failed:", error);
      console.error("Stack trace:", error.stack);
      throw error; // This will mark the job as failed in BullMQ
    }
  },
  {
    concurrency: 2, // Reduced for stability
    connection: {
      host: "localhost",
      port: 6379,
    },
  }
);

// Worker event handlers
worker.on('completed', (job, result) => {
  console.log(`🎉 Job ${job.id} completed successfully:`, result);
});

worker.on('failed', (job, err) => {
  console.error(`💥 Job ${job.id} failed:`, err.message);
});

worker.on('error', (err) => {
  console.error('⚠️ Worker error:', err);
});

console.log('🏃‍♂️ PDF RAG Worker started and waiting for jobs...');

export default worker;