"""
Hybrid Search (RAG 2.0) - Combines Semantic + Keyword Search
Provides superior retrieval accuracy by merging vector similarity with BM25 keyword matching.
"""

import logging
import math
import re
from collections import Counter
from dataclasses import dataclass
from typing import List, Dict, Optional, Tuple, Any
import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class SearchResult:
    """A search result with hybrid score"""
    text: str
    chunk_id: int
    semantic_score: float  # Vector similarity (0-1)
    keyword_score: float   # BM25 score (0+)
    hybrid_score: float    # Combined score
    section: str = ""
    metadata: Dict[str, Any] = None


class BM25:
    """
    BM25 (Best Matching 25) ranking algorithm.
    Industry standard for keyword-based information retrieval.
    """
    
    def __init__(self, k1: float = 1.5, b: float = 0.75):
        """
        Args:
            k1: Term frequency saturation parameter (1.2-2.0)
            b: Length normalization parameter (0-1)
        """
        self.k1 = k1
        self.b = b
        self.corpus = []
        self.doc_freqs = []  # Term frequencies per document
        self.idf = {}        # Inverse document frequency
        self.doc_lengths = []
        self.avg_doc_length = 0
        self.n_docs = 0
    
    def _tokenize(self, text: str) -> List[str]:
        """Simple tokenization - lowercase and split on non-alphanumeric"""
        return re.findall(r'\b\w+\b', text.lower())
    
    def fit(self, documents: List[str]):
        """Index documents for BM25 search"""
        self.corpus = documents
        self.n_docs = len(documents)
        self.doc_freqs = []
        self.doc_lengths = []
        
        # Count document frequencies
        df = Counter()
        
        for doc in documents:
            tokens = self._tokenize(doc)
            self.doc_lengths.append(len(tokens))
            
            # Term frequency for this document
            tf = Counter(tokens)
            self.doc_freqs.append(tf)
            
            # Document frequency (count unique terms)
            df.update(set(tokens))
        
        # Calculate average document length
        self.avg_doc_length = sum(self.doc_lengths) / self.n_docs if self.n_docs > 0 else 1
        
        # Calculate IDF for each term
        for term, freq in df.items():
            # IDF with smoothing
            self.idf[term] = math.log((self.n_docs - freq + 0.5) / (freq + 0.5) + 1)
        
        logger.info(f"BM25 indexed {self.n_docs} documents, {len(self.idf)} unique terms")
    
    def score(self, query: str) -> List[float]:
        """
        Score all documents against query.
        
        Returns:
            List of BM25 scores for each document
        """
        query_tokens = self._tokenize(query)
        scores = [0.0] * self.n_docs
        
        for q_term in query_tokens:
            if q_term not in self.idf:
                continue
            
            idf = self.idf[q_term]
            
            for doc_idx in range(self.n_docs):
                tf = self.doc_freqs[doc_idx].get(q_term, 0)
                doc_len = self.doc_lengths[doc_idx]
                
                # BM25 formula
                numerator = tf * (self.k1 + 1)
                denominator = tf + self.k1 * (1 - self.b + self.b * (doc_len / self.avg_doc_length))
                
                scores[doc_idx] += idf * (numerator / denominator)
        
        return scores
    
    def search(self, query: str, top_k: int = 5) -> List[Tuple[int, float]]:
        """
        Search for top-k documents.
        
        Returns:
            List of (doc_index, score) tuples, sorted by score descending
        """
        scores = self.score(query)
        
        # Get top-k
        indexed_scores = [(i, s) for i, s in enumerate(scores)]
        indexed_scores.sort(key=lambda x: x[1], reverse=True)
        
        return indexed_scores[:top_k]


class HybridSearch:
    """
    Hybrid Search combining Semantic (Vector) and Keyword (BM25) retrieval.
    
    This is the RAG 2.0 approach used by top AI applications.
    
    Benefits:
    - Catches exact technical terms that semantic search might miss
    - Handles synonyms and concepts via semantic search
    - More robust to query variations
    """
    
    def __init__(
        self,
        semantic_weight: float = 0.7,
        keyword_weight: float = 0.3,
        embedder = None
    ):
        """
        Args:
            semantic_weight: Weight for semantic (vector) scores
            keyword_weight: Weight for keyword (BM25) scores
            embedder: Sentence embedder model (e.g., sentence-transformers)
        """
        self.semantic_weight = semantic_weight
        self.keyword_weight = keyword_weight
        self.embedder = embedder
        
        self.bm25 = BM25()
        self.documents = []
        self.embeddings = None
        self.metadata = []
        
        logger.info(f"HybridSearch initialized: semantic={semantic_weight}, keyword={keyword_weight}")
    
    def index(
        self,
        documents: List[str],
        metadata: Optional[List[Dict]] = None,
        embeddings: Optional[np.ndarray] = None
    ):
        """
        Index documents for hybrid search.
        
        Args:
            documents: List of text chunks
            metadata: Optional metadata for each chunk
            embeddings: Pre-computed embeddings (optional, will compute if embedder provided)
        """
        self.documents = documents
        self.metadata = metadata or [{}] * len(documents)
        
        # Index for BM25
        self.bm25.fit(documents)
        
        # Handle embeddings
        if embeddings is not None:
            self.embeddings = embeddings
        elif self.embedder is not None:
            logger.info("Computing embeddings for hybrid search...")
            self.embeddings = self.embedder.encode(documents, show_progress_bar=True)
            logger.info(f"Computed embeddings: shape={self.embeddings.shape}")
        else:
            logger.warning("No embedder or pre-computed embeddings provided. Semantic search disabled.")
            self.embeddings = None
    
    def _cosine_similarity(self, query_emb: np.ndarray, doc_embs: np.ndarray) -> np.ndarray:
        """Compute cosine similarity between query and all documents"""
        # Normalize
        query_norm = query_emb / (np.linalg.norm(query_emb) + 1e-9)
        doc_norms = doc_embs / (np.linalg.norm(doc_embs, axis=1, keepdims=True) + 1e-9)
        
        return np.dot(doc_norms, query_norm)
    
    def search(
        self,
        query: str,
        top_k: int = 5,
        semantic_weight: Optional[float] = None,
        keyword_weight: Optional[float] = None
    ) -> List[SearchResult]:
        """
        Perform hybrid search.
        
        Args:
            query: Search query
            top_k: Number of results to return
            semantic_weight: Override default semantic weight
            keyword_weight: Override default keyword weight
            
        Returns:
            List of SearchResult objects sorted by hybrid score
        """
        if not self.documents:
            logger.warning("No documents indexed")
            return []
        
        sem_w = semantic_weight if semantic_weight is not None else self.semantic_weight
        kw_w = keyword_weight if keyword_weight is not None else self.keyword_weight
        
        # Get keyword (BM25) scores
        bm25_scores = self.bm25.score(query)
        
        # Normalize BM25 scores to 0-1 range
        max_bm25 = max(bm25_scores) if bm25_scores and max(bm25_scores) > 0 else 1
        bm25_normalized = [s / max_bm25 for s in bm25_scores]
        
        # Get semantic scores
        if self.embeddings is not None and self.embedder is not None:
            query_emb = self.embedder.encode([query])[0]
            semantic_scores = self._cosine_similarity(query_emb, self.embeddings)
            # Normalize to 0-1 (cosine is already -1 to 1, shift to 0-1)
            semantic_scores = (semantic_scores + 1) / 2
        else:
            # No semantic search available
            semantic_scores = [0.0] * len(self.documents)
            sem_w = 0
            kw_w = 1
        
        # Compute hybrid scores
        results = []
        for i, doc in enumerate(self.documents):
            sem_score = float(semantic_scores[i])
            kw_score = float(bm25_normalized[i])
            hybrid_score = (sem_w * sem_score) + (kw_w * kw_score)
            
            results.append(SearchResult(
                text=doc,
                chunk_id=i,
                semantic_score=sem_score,
                keyword_score=kw_score,
                hybrid_score=hybrid_score,
                section=self.metadata[i].get("section", "") if self.metadata else "",
                metadata=self.metadata[i] if self.metadata else {}
            ))
        
        # Sort by hybrid score
        results.sort(key=lambda x: x.hybrid_score, reverse=True)
        
        return results[:top_k]
    
    def rerank_with_keywords(
        self,
        query: str,
        semantic_results: List[Tuple[int, float]],
        boost_factor: float = 0.3
    ) -> List[SearchResult]:
        """
        Rerank semantic search results by boosting keyword matches.
        Useful when you already have semantic results from FAISS.
        
        Args:
            query: Search query
            semantic_results: List of (doc_index, semantic_score) from existing search
            boost_factor: How much to boost keyword matches (0-1)
            
        Returns:
            Reranked SearchResult list
        """
        if not self.documents:
            return []
        
        # Get BM25 scores for the query
        bm25_scores = self.bm25.score(query)
        max_bm25 = max(bm25_scores) if bm25_scores and max(bm25_scores) > 0 else 1
        
        results = []
        for doc_idx, sem_score in semantic_results:
            kw_score = bm25_scores[doc_idx] / max_bm25 if max_bm25 > 0 else 0
            hybrid_score = sem_score + (boost_factor * kw_score)
            
            results.append(SearchResult(
                text=self.documents[doc_idx],
                chunk_id=doc_idx,
                semantic_score=sem_score,
                keyword_score=kw_score,
                hybrid_score=hybrid_score,
                section=self.metadata[doc_idx].get("section", "") if self.metadata else "",
                metadata=self.metadata[doc_idx] if self.metadata else {}
            ))
        
        results.sort(key=lambda x: x.hybrid_score, reverse=True)
        return results


# Convenience function for quick integration
def create_hybrid_search(
    embedder = None,
    semantic_weight: float = 0.7,
    keyword_weight: float = 0.3
) -> HybridSearch:
    """Create a HybridSearch instance with default settings"""
    return HybridSearch(
        semantic_weight=semantic_weight,
        keyword_weight=keyword_weight,
        embedder=embedder
    )
