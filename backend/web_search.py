import os
import requests
from dotenv import load_dotenv

load_dotenv()
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
TAVILY_URL = "https://api.tavily.com/search"

def web_search(query: str, max_results: int = 3) -> str:
    try:
        resp = requests.post(
            TAVILY_URL,
            json={
                "api_key": TAVILY_API_KEY,
                "query": query,
                "search_depth":"basic",
                "max_results": max_results,
            },
            timeout=10,
        )
        resp.raise_for_status()
        results = resp.json().get("results",[])
        if not results:
            return ""
        parts = []
        for r in results:
            parts.append(f"[Source: {r.get('url','')}]\n{r.get('content','')}")
        return "\n\n-----\n\n".join(parts)
    except Exception as e:
        print(f"[Tavily error: {e}]")
        return ""