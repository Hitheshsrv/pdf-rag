from flask import Flask, request, jsonify
from sentence_transformers import SentenceTransformer
import numpy as np
import os
import torch
import gc

app = Flask(__name__)

# Global model variable
model = None

def load_model():
    """Load model with memory optimizations"""
    global model
    if model is None:
        print("Loading SentenceTransformer model...")
        
        # Memory optimizations
        torch.set_num_threads(1)  # Reduce CPU thread usage
        
        # Load model with reduced precision if available
        model = SentenceTransformer('all-MiniLM-L6-v2')
        
        # Force garbage collection
        gc.collect()
        
        print("Model loaded successfully")
    return model

@app.route('/embed', methods=['POST'])
def embed_text():
    try:
        # Load model lazily (only when needed)
        current_model = load_model()
        
        data = request.json
        texts = data.get('texts', [])
        
        if not texts:
            return jsonify({'error': 'No texts provided'}), 400
        
        # Limit batch size to prevent memory spikes
        batch_size = min(len(texts), 32)  # Process max 32 texts at once
        
        all_embeddings = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            batch_embeddings = current_model.encode(batch)
            all_embeddings.extend(batch_embeddings.tolist())
            
            # Clear cache after each batch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            gc.collect()
        
        return jsonify({
            'embeddings': all_embeddings,
            'dimension': len(all_embeddings[0]) if all_embeddings else 0
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy'})

@app.route('/', methods=['GET'])
def root():
    return jsonify({
        'message': 'Text Embedding Server',
        'endpoints': {
            '/embed': 'POST - Generate embeddings for texts',
            '/health': 'GET - Health check'
        }
    })

if __name__ == '__main__':
    # Use environment variables for production
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)