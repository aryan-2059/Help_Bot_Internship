import json
import math
import requests
from pathlib import Path
import numpy as np

STORE_PATH = Path(__file__).parent / "store.json"
OLLAMA_EMBED_URL = "http://localhost:11434/api/embeddings"
EMBED_MODEL = "nomic-embed-text" # same model as that of ingestion

SIMILARITY_THRESHOLD = 0.6
TOP_K = 3
_store_cache = None # list of chunk dicts
_embedding_matrix = None # pre-normalized numpy matrix

def _load():
    '''Load + cache store.json, pre-normalize embeddings'''
    global _store_cache, _embedding_matrix
    if _store_cache is not None:
        return _store_cache, _embedding_matrix
    
    if not STORE_PATH.exists():
        raise FileNotFoundError(f"{STORE_PATH} not found. Run ingest.py first.")
    raw = json.loads(STORE_PATH.read_text())
    _store_cache =raw
    vectors = np.array([c['embedding'] for c in raw], dtype=np.float32)
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms==0] = 1e-8 #avoiding divide by 0 for any zero vector edge case
    _embedding_matrix = vectors/norms
    return _store_cache, _embedding_matrix

def embed_query(text:str) -> np.ndarray:
    resp = requests.post(
        OLLAMA_EMBED_URL,
        json={"model": EMBED_MODEL, "prompt": text, "keep_alive":"30m"},
        timeout=30,
    )
    resp.raise_for_status()
    return np.array(resp.json()['embedding'], dtype=np.float32)

def retrieve(query: str) -> list[dict]:
    '''Return top-k matching chunks, or an empty list if nothing surpasses the threshold'''
    store, matrix = _load()
        
    q = embed_query(query)
    q_norm = q/(np.linalg.norm(q) or 1e-8)
    
    # cosine similarity again every chunk at once
    scores = matrix @ q_norm
    top_idx = np.argsort(-scores)[:TOP_K]
    
    if scores[top_idx[0]] < SIMILARITY_THRESHOLD:
        return [] # nothing, caller falls back to web search
    
    return [
        {**store[c], "score": float(scores[c])}
        for c in top_idx
        if scores[c] >= SIMILARITY_THRESHOLD
        ]

def format_context(chunks: list[dict])->str:
    '''Turns retrieved chunks into a text block to inject into the LLM response'''
    parts = []
    for c in chunks:
        parts.append(f"[Source: {c['source']} | relevance: {c['score']:.2f}]\n{c['content']}")
    return "\n\n-----\n\n".join(parts)

if __name__=="__main__":
    store,_ = _load()
    print(f"Loaded {len(store)} chunks from store. \n")
    while True:
        query = input("Query (blank to quit): ").strip()
        if not query:
            break
        results = retrieve(query, store)
        if not results:
            print("     -> NOT FOUND (fall back to web search)\n")
            continue
        print(f"    -> {len(results)} match(es):")
        for r in results:
            print(f"    [{r['score']:.3f}] {r['title']} ({r['source']})")
        print()    