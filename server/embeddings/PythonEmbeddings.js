// embeddings/PythonEmbeddings.js
import { Embeddings } from "@langchain/core/embeddings";
import fetch from "node-fetch";

export class PythonEmbeddings extends Embeddings {
  constructor(options = {}) {
    super();
    this.apiUrl = options.apiUrl || "http://localhost:5001";
  }

  async embedDocuments(texts) {
    try {
      const response = await fetch(`${this.apiUrl}/embed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ texts }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.embeddings;
    } catch (error) {
      console.error('Error calling Python embedding API:', error);
      throw error;
    }
  }

  async embedQuery(text) {
    const embeddings = await this.embedDocuments([text]);
    return embeddings[0];
  }
}