import json
import math
import requests
from pathlib import Path

STORE_PATH = Path(__file__).parent / "store.json"
OLLAMA_EMBED_URL = "http://localhost:11434/api/embeddings"
EMBED_MODEL = "nomic-embed-text" # same model as that of ingestion

SIMILARITY_THRESHOLD = 0.6
TOP_K = 3

def load_store() -> list[dict]:
    if not STORE_PATH.exists():
        raise FileNotFoundError( f"{STORE_PATH} not found. Run ingest.py first. ")
    return json.loads(STORE_PATH.read_text())

def embed_query(text:str)-> list[float]:
    resp = requests.post(
        OLLAMA_EMBED_URL,
        json={"model": EMBED_MODEL, "prompt": text},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["embedding"]

def cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x*y for x,y in zip(a,b))
    norm_a = math.sqrt(sum(x*x for x in a))
    norm_b = math.sqrt(sum(y*y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot/(norm_a * norm_b)

def retrieve(query: str, store: list[dict] | None = None) -> list[dict]:
    '''Return top-k matching chunks, or an empty list if nothing surpasses the threshold'''
    if store is None:
        store = load_store()
        
    q_embedding = embed_query(query)
    scored=[]
    for chunk in store:
        score = cosine_similarity(q_embedding, chunk["embedding"])
        scored.append({**chunk,  "score":score})
        
    scored.sort(key=lambda c: c["score"], reverse=True)
    top = scored[:TOP_K]
    
    if not top or top[0]["score"] < SIMILARITY_THRESHOLD:
        return [] # nothing, caller falls back to web search
    
    return [c for c in top if c["score"] >= SIMILARITY_THRESHOLD]

def format_context(chunks: list[dict])->str:
    '''Turns retrieved chunks into a text block to inject into the LLM response'''
    parts = []
    for c in chunks:
        parts.append(f"[Source: {c['source']} | relevance: {c['score']:.2f}]\n{c['content']}")
    return "\n\n-----\n\n".join(parts)

if __name__=="__main__":
    store = load_store()
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