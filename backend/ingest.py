import json
import re
import requests
from pathlib import Path
from pypdf import PdfReader

DOCS_DIR = Path(__file__).parent / "documents"
STORE_PATH = Path(__file__).parent / "store.json"
OLLAMA_EMBED_URL = "http://localhost:11434/api/embeddings"
EMBED_MODEL = "nomic-embed-text"

MIN_CHUNK_CHARS = 40
MAX_CHUNK_CHARS = 4000

def load_txt(path: Path) -> str:
    return path.read_text(encoding='utf-8', errors='ignore')

def load_pdf(path: Path) -> str:
    reader = PdfReader(str(path))
    return "\n".join(page.extract_text() or "" for page in reader.pages)

def chunk_numbered(text: str, source: str) -> list[dict]:
    pattern = re.compile(r"\n(\d{1,2})[.\-]\s*([^\n]{0,80})\n")
    matches = list(pattern.finditer(text))
    chunks = []
    skipped = []
    for i,m in enumerate(matches):
        start = m.start()
        end = matches[i+1].start() if i +1< len(matches) else len(text)
        body = text[start:end].strip()
        if len(body) < MIN_CHUNK_CHARS or len(body) > MAX_CHUNK_CHARS:
            skipped.append((m.group(2).strip(), len(body)))
            continue
            
        chunks.append({
            "id": f"{source}::{i}",
            "source":source,
            "title": m.group(2).strip(),
            "content": body,
        })
    if skipped:
        print(f" [!]{source}: skipped {len(skipped)} suspicious matches (check manually): ")
        for title, length in skipped:
            print(f"    - {title!r} ({length} chars)")
    return chunks

def chunk_checklist_pdf(text: str, source: str)-> list[dict]:
    return [{
        "id": f"{source}::0",
        "source": source,
        "title": "Tech Support Troubleshooting Checklist",
        "content": text.strip(),
    }]
    
def get_embedding(text:str)-> list[float]:
    resp = requests.post(
        OLLAMA_EMBED_URL,
        json={"model": EMBED_MODEL, "prompt": text},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["embedding"]

def main():
    all_chunks=[]
    
    for path in sorted(DOCS_DIR.glob("*")):
        if path.suffix == ".txt":
            chunks = chunk_numbered(load_txt(path), path.name)
        elif path.suffix == ".pdf":
            chunks = chunk_checklist_pdf(load_pdf(path), path.name)
        else:
            print(f"Skipping unsupported file: {path.name}")
            continue
        
        print(f"{path.name}: {len(chunks)} chunks")
        all_chunks.extend(chunks)
    
    print(f"\nEmbedding {len(all_chunks)} chunks via OLLAMA ({EMBED_MODEL})... ")
    for i, chunk in enumerate(all_chunks):
        chunk["embedding"] = get_embedding(chunk["content"])
        print(f" [{i+1}/{len(all_chunks)}] embedded: {chunk['title'][:50]}")
        
    STORE_PATH.write_text(json.dumps(all_chunks, indent=2))
    print(f"\nSaved {len(all_chunks)} chunks with embeddings to {STORE_PATH}")
    
if __name__ == "__main__":
    main()