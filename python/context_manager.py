# -*- coding: utf-8 -*-
"""
Enhanced Resume Context Manager with Reranking and Query Expansion
Improves relevance of resume chunks retrieved for interview questions.
"""

import logging
import re
from typing import List, Optional, Tuple
from dataclasses import dataclass
import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class ResumeChunk:
    """A chunk of resume text with metadata"""
    text: str
    chunk_id: int
    similarity_score: float
    section: str  # e.g., "experience", "education", "skills"
    relevance_score: float = 0.0  # Reranking score


class ResumeContextManager:
    """
    Manages resume context retrieval with advanced features:
    - Query expansion (synonyms, related terms)
    - Semantic reranking
    - Section-aware retrieval
    """
    
    # Domain-specific synonym mappings for query expansion
    SKILL_SYNONYMS = {
        "python": ["py", "django", "flask", "fastapi", "pandas", "numpy"],
        "javascript": ["js", "node", "nodejs", "react", "vue", "angular", "typescript", "ts"],
        "java": ["spring", "springboot", "hibernate", "maven", "gradle"],
        "leadership": ["lead", "manage", "mentor", "guide", "supervise", "direct"],
        "design": ["architect", "plan", "structure", "model", "blueprint"],
        "optimize": ["improve", "enhance", "streamline", "refactor", "performance"],
        "api": ["rest", "restful", "graphql", "endpoint", "microservice"],
        "database": ["db", "sql", "mysql", "postgres", "mongodb", "nosql"],
        "cloud": ["aws", "azure", "gcp", "kubernetes", "k8s", "docker"],
        "frontend": ["ui", "ux", "react", "vue", "angular", "css", "html"],
        "backend": ["server", "api", "microservice", "service"],
        "testing": ["test", "qa", "junit", "pytest", "automation"],
        "agile": ["scrum", "sprint", "kanban", "jira"],
        "machine learning": ["ml", "ai", "neural network", "deep learning", "tensorflow", "pytorch"],
    }
    
    # Section keywords for automatic section detection
    SECTION_PATTERNS = {
        "experience": [
            r"\b(experience|work history|employment|professional)\b",
            r"\b(engineer|developer|manager|lead|analyst)\b",
            r"\b(company|corporation|startup|firm)\b",
        ],
        "education": [
            r"\b(education|degree|university|college|school)\b",
            r"\b(bachelor|master|phd|bs|ms|ba|ma)\b",
            r"\b(gpa|coursework|major|minor)\b",
        ],
        "skills": [
            r"\b(skills|technologies|tools|languages|frameworks)\b",
            r"\b(proficient|expert|experienced|familiar)\b",
        ],
        "projects": [
            r"\b(project|built|developed|created|implemented)\b",
            r"\b(github|repository|demo|portfolio)\b",
        ],
    }
    
    def __init__(self, embedder=None, emb_matrix=None, emb_texts=None, index=None):
        """
        Initialize context manager with embedding resources.
        
        Args:
            embedder: SentenceTransformer model for encoding queries
            emb_matrix: Numpy array of resume chunk embeddings
            emb_texts: List of resume chunk texts
            index: FAISS index (optional, falls back to numpy if None)
        """
        self.embedder = embedder
        self.emb_matrix = emb_matrix
        self.emb_texts = emb_texts or []
        self.index = index
        
        # Detect sections for each chunk
        self.chunk_sections = self._detect_sections()
    
    def _detect_sections(self) -> List[str]:
        """Automatically detect which section each chunk belongs to"""
        sections = []
        for text in self.emb_texts:
            section = self._classify_section(text)
            sections.append(section)
        return sections
    
    def _classify_section(self, text: str) -> str:
        """Classify a chunk into a resume section"""
        text_lower = text.lower()
        
        scores = {}
        for section, patterns in self.SECTION_PATTERNS.items():
            score = sum(
                1 for pattern in patterns
                if re.search(pattern, text_lower, re.IGNORECASE)
            )
            scores[section] = score
        
        if not scores or max(scores.values()) == 0:
            return "general"
        
        return max(scores, key=scores.get)
    
    def expand_query(self, query: str) -> List[str]:
        """
        Expand query with synonyms and related terms.
        
        Args:
            query: Original query text
            
        Returns:
            List of expanded query variants
        """
        query_lower = query.lower()
        expanded = [query]  # Always include original
        
        # Add synonyms for matched skills
        for skill, synonyms in self.SKILL_SYNONYMS.items():
            if skill in query_lower:
                # Add a variant with synonym
                for syn in synonyms[:2]:  # Limit to top 2 synonyms
                    expanded.append(query_lower.replace(skill, syn))
        
        # Remove duplicates while preserving order
        seen = set()
        unique_expanded = []
        for q in expanded:
            if q not in seen:
                seen.add(q)
                unique_expanded.append(q)
        
        if len(unique_expanded) > 1:
            logger.debug(f"Query expansion: {query} → {len(unique_expanded)} variants")
        
        return unique_expanded[:5]  # Limit to 5 variants
    
    def retrieve(
        self,
        query: str,
        top_k: int = 5,
        rerank: bool = True,
        expand_query: bool = True,
        section_filter: Optional[str] = None,
    ) -> List[ResumeChunk]:
        """
        Retrieve relevant resume chunks with optional reranking and filtering.
        
        Args:
            query: Question or search query
            top_k: Number of chunks to return
            rerank: Whether to apply reranking
            expand_query: Whether to use query expansion
            section_filter: Optional section to filter (e.g., "experience")
            
        Returns:
            List of ResumeChunk objects sorted by relevance
        """
        if not self.embedder or not self.emb_texts:
            logger.warning("Resume context manager not initialized")
            return []
        
        # Query expansion
        queries = self.expand_query(query) if expand_query else [query]
        
        # Get initial candidates (retrieve more for reranking)
        retrieve_k = top_k * 3 if rerank else top_k
        candidates = self._retrieve_candidates(queries, retrieve_k)
        
        # Apply section filter if specified
        if section_filter:
            candidates = [
                c for c in candidates
                if self.chunk_sections[c.chunk_id] == section_filter
            ]
        
        # Rerank if enabled
        if rerank and len(candidates) > top_k:
            candidates = self._rerank_chunks(query, candidates)
        
        # Return top-k
        return candidates[:top_k]
    
    def _retrieve_candidates(
        self,
        queries: List[str],
        top_k: int
    ) -> List[ResumeChunk]:
        """Retrieve candidates using vector similarity"""
        all_candidates = {}  # chunk_id -> ResumeChunk
        
        for query_text in queries:
            # Encode query
            q_emb = self.embedder.encode([query_text], normalize_embeddings=True).astype('float32')
            
            # Search
            if self.index is not None:
                try:
                    import faiss
                    D, I = self.index.search(q_emb, top_k)
                    chunk_ids = I[0].tolist()
                    scores = D[0].tolist()
                except Exception as e:
                    logger.warning(f"FAISS search failed: {e}, falling back to numpy")
                    chunk_ids, scores = self._numpy_search(q_emb[0], top_k)
            else:
                chunk_ids, scores = self._numpy_search(q_emb[0], top_k)
            
            # Aggregate results
            for chunk_id, score in zip(chunk_ids, scores):
                if 0 <= chunk_id < len(self.emb_texts):
                    section = self.chunk_sections[chunk_id] if chunk_id < len(self.chunk_sections) else "general"
                    
                    if chunk_id in all_candidates:
                        # Update score (take max across queries)
                        all_candidates[chunk_id].similarity_score = max(
                            all_candidates[chunk_id].similarity_score,
                            score
                        )
                    else:
                        all_candidates[chunk_id] = ResumeChunk(
                            text=self.emb_texts[chunk_id],
                            chunk_id=chunk_id,
                            similarity_score=score,
                            section=section,
                            relevance_score=score,
                        )
        
        # Sort by similarity
        candidates = sorted(
            all_candidates.values(),
            key=lambda x: x.similarity_score,
            reverse=True
        )
        
        return candidates
    
    def _numpy_search(self, query_emb: np.ndarray, top_k: int) -> Tuple[List[int], List[float]]:
        """Fallback numpy-based similarity search"""
        if self.emb_matrix is None:
            return [], []
        
        # Cosine similarity (embeddings are normalized)
        similarities = self.emb_matrix @ query_emb
        
        # Get top-k indices
        top_indices = np.argsort(-similarities)[:top_k]
        top_scores = similarities[top_indices].tolist()
        
        return top_indices.tolist(), top_scores
    
    def _rerank_chunks(
        self,
        query: str,
        candidates: List[ResumeChunk]
    ) -> List[ResumeChunk]:
        """
        Rerank candidates using additional signals beyond embedding similarity.
        
        Reranking features:
        - Keyword overlap (query terms in chunk)
        - Section relevance (experience > projects > skills > education)
        - Position bias (earlier chunks often more important)
        - Length penalty (very short chunks less informative)
        """
        query_terms = set(re.findall(r'\b\w+\b', query.lower()))
        
        # Section importance weights
        section_weights = {
            "experience": 1.2,
            "projects": 1.1,
            "skills": 1.0,
            "education": 0.9,
            "general": 0.8,
        }
        
        for chunk in candidates:
            # Feature 1: Keyword overlap
            chunk_terms = set(re.findall(r'\b\w+\b', chunk.text.lower()))
            overlap = len(query_terms & chunk_terms) / max(len(query_terms), 1)
            
            # Feature 2: Section relevance
            section_weight = section_weights.get(chunk.section, 1.0)
            
            # Feature 3: Length normalization (prefer medium-length chunks)
            length = len(chunk.text)
            if length < 50:
                length_weight = 0.7  # Too short
            elif length > 500:
                length_weight = 0.9  # Too long
            else:
                length_weight = 1.0  # Good length
            
            # Combine scores (weighted)
            relevance_score = (
                0.6 * chunk.similarity_score +  # Embedding similarity
                0.2 * overlap +  # Keyword match
                0.1 * section_weight +  # Section importance
                0.1 * length_weight  # Length quality
            )
            
            chunk.relevance_score = relevance_score
        
        # Sort by relevance score
        candidates.sort(key=lambda x: x.relevance_score, reverse=True)
        
        logger.debug(f"Reranked {len(candidates)} chunks")
        return candidates
    
    def get_context_summary(self, chunks: List[ResumeChunk]) -> str:
        """
        Format resume chunks into a concise context string.
        
        Args:
            chunks: Retrieved resume chunks
            
        Returns:
            Formatted context string for LLM prompt
        """
        if not chunks:
            return "No relevant resume information found."
        
        # Group by section
        by_section = {}
        for chunk in chunks:
            section = chunk.section
            if section not in by_section:
                by_section[section] = []
            by_section[section].append(chunk.text)
        
        # Format
        parts = []
        for section in ["experience", "projects", "skills", "education", "general"]:
            if section in by_section:
                section_title = section.title()
                section_text = "\n".join(by_section[section])
                parts.append(f"**{section_title}:**\n{section_text}")
        
        return "\n\n".join(parts)


def create_context_manager(embedder, emb_matrix, emb_texts, index=None) -> ResumeContextManager:
    """
    Factory function to create a ResumeContextManager instance.
    
    Example:
        >>> manager = create_context_manager(embedder, emb_matrix, emb_texts, index)
        >>> chunks = manager.retrieve("Tell me about your Python experience", top_k=5)
        >>> context = manager.get_context_summary(chunks)
    """
    return ResumeContextManager(embedder, emb_matrix, emb_texts, index)


if __name__ == "__main__":
    print("=" * 80)
    print("Resume Context Manager - Demo")
    print("=" * 80)
    
    # Simulate resume chunks
    mock_resume_texts = [
        "Senior Software Engineer at TechCorp (2020-2023). Led a team of 5 developers building microservices in Python and Go.",
        "Built a real-time analytics dashboard using React and Node.js, serving 10k daily active users.",
        "Implemented CI/CD pipelines with GitHub Actions and Docker, reducing deployment time by 60%.",
        "Bachelor of Science in Computer Science, Stanford University, GPA 3.8/4.0",
        "Skills: Python, JavaScript, React, Node.js, AWS, Docker, Kubernetes, PostgreSQL",
        "Developed machine learning model for fraud detection using TensorFlow, achieving 95% accuracy.",
    ]
    
    # Create mock embeddings (random for demo)
    mock_embeddings = np.random.randn(len(mock_resume_texts), 384).astype('float32')
    mock_embeddings = mock_embeddings / np.linalg.norm(mock_embeddings, axis=1, keepdims=True)
    
    # Mock embedder (just for demo)
    class MockEmbedder:
        def encode(self, texts, normalize_embeddings=True):
            embs = np.random.randn(len(texts), 384).astype('float32')
            if normalize_embeddings:
                embs = embs / np.linalg.norm(embs, axis=1, keepdims=True)
            return embs
    
    manager = ResumeContextManager(
        embedder=MockEmbedder(),
        emb_matrix=mock_embeddings,
        emb_texts=mock_resume_texts,
        index=None
    )
    
    test_queries = [
        "Tell me about your Python experience",
        "What leadership roles have you had?",
        "Do you have machine learning experience?",
    ]
    
    for query in test_queries:
        print(f"\n📝 Query: {query}")
        chunks = manager.retrieve(query, top_k=3, rerank=True, expand_query=True)
        
        print(f"   Retrieved {len(chunks)} chunks:")
        for i, chunk in enumerate(chunks, 1):
            print(f"   {i}. [{chunk.section}] (score: {chunk.relevance_score:.3f})")
            print(f"      {chunk.text[:80]}...")
