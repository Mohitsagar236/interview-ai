"""
Integration Test for Intelligent Routing System
Tests the complete flow: Question → Classification → Routing → RAG → Confidence
"""

import pytest
import asyncio
import sys
import os
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from question_classifier import classify_question, QuestionType
from ai_router import route_model, ModelRouter
from context_manager import ResumeContextManager, create_context_manager
from confidence_scorer import score_answer, ConfidenceScorer
import numpy as np


class TestIntegration:
    """Integration tests for the complete intelligent routing pipeline"""
    
    @pytest.fixture
    def mock_resume_data(self):
        """Create mock resume data for testing"""
        texts = [
            "Senior Software Engineer at TechCorp (2020-2023). Led team of 5 developers building Python microservices.",
            "Built real-time analytics dashboard using React and Node.js, serving 10k daily users.",
            "Implemented CI/CD pipelines with GitHub Actions and Docker, reducing deployment time by 60%.",
            "Bachelor of Science in Computer Science, Stanford University, GPA 3.8",
            "Skills: Python, JavaScript, React, Node.js, AWS, Docker, Kubernetes, PostgreSQL",
            "Developed ML model for fraud detection using TensorFlow, achieving 95% accuracy.",
        ]
        
        # Create mock embeddings (random but normalized)
        embeddings = np.random.randn(len(texts), 384).astype('float32')
        embeddings = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)
        
        return texts, embeddings
    
    @pytest.fixture
    def mock_embedder(self):
        """Create mock embedder"""
        class MockEmbedder:
            def encode(self, texts, normalize_embeddings=True):
                embs = np.random.randn(len(texts), 384).astype('float32')
                if normalize_embeddings:
                    embs = embs / np.linalg.norm(embs, axis=1, keepdims=True)
                return embs
        return MockEmbedder()
    
    def test_coding_question_pipeline(self, mock_resume_data, mock_embedder):
        """Test complete pipeline for coding question"""
        question = "Implement a function to reverse a linked list"
        texts, embeddings = mock_resume_data
        
        # Step 1: Classify
        classification = classify_question(question)
        assert classification.primary_type == QuestionType.CODING
        assert classification.confidence > 0.5
        assert "coding" in classification.tags
        
        # Step 2: Route to model
        model, params = route_model(question)
        assert "gpt-4o" in model.lower()
        assert params["temperature"] <= 0.2
        assert params["max_tokens"] >= 1000
        
        # Step 3: Enhanced RAG retrieval
        context_mgr = create_context_manager(mock_embedder, embeddings, texts)
        chunks = context_mgr.retrieve(question, top_k=3, rerank=True, expand_query=True)
        
        assert len(chunks) <= 3
        assert all(hasattr(c, 'relevance_score') for c in chunks)
        
        # Step 4: Mock LLM response
        mock_answer = """
Here's an implementation to reverse a linked list:

```python
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

def reverseLinkedList(head):
    prev = None
    current = head
    
    while current:
        next_temp = current.next
        current.next = prev
        prev = current
        current = next_temp
    
    return prev
```

**Time Complexity**: $O(n)$ where n is the number of nodes
**Space Complexity**: $O(1)$ - only using pointers

**Approach**: Iteratively reverse the pointers by maintaining three pointers: prev, current, and next.
"""
        
        # Step 5: Score confidence
        confidence = score_answer(mock_answer, question)
        
        assert confidence.overall_score > 0.7
        assert confidence.recommendation == "accept"
        assert confidence.completeness > 0.7
        assert confidence.technical_accuracy > 0.7
        
        print(f"✅ Coding pipeline test passed!")
        print(f"   Classification: {classification.primary_type.value}")
        print(f"   Model: {model}")
        print(f"   Confidence: {confidence.overall_score:.2f}")
    
    def test_behavioral_question_pipeline(self, mock_resume_data, mock_embedder):
        """Test complete pipeline for behavioral question"""
        question = "Tell me about a time you had a conflict with a team member"
        texts, embeddings = mock_resume_data
        
        # Classify
        classification = classify_question(question)
        assert classification.primary_type == QuestionType.BEHAVIORAL
        
        # Route
        model, params = route_model(question)
        assert "claude" in model.lower()
        
        # RAG with section filter
        context_mgr = create_context_manager(mock_embedder, embeddings, texts)
        chunks = context_mgr.retrieve(
            question,
            top_k=3,
            rerank=True,
            section_filter="experience"
        )
        
        # Mock STAR format answer
        mock_answer = """
**Situation**: During my time at TechCorp, I worked with a senior developer who disagreed with my approach to implementing a new API endpoint.

**Task**: We needed to decide on the architecture for a high-traffic microservice, and we had conflicting opinions on using REST vs GraphQL.

**Action**: I scheduled a 1-on-1 meeting to understand their concerns. I prepared data showing GraphQL would reduce network calls by 40% for our use case. We compromised by implementing GraphQL with REST fallback.

**Result**: The solution reduced response times by 35% and satisfied both architectural preferences. We documented our decision-making process for future reference.
"""
        
        confidence = score_answer(mock_answer, question)
        
        assert confidence.overall_score > 0.6
        assert confidence.recommendation in ["accept", "manual_review"]
        
        print(f"✅ Behavioral pipeline test passed!")
        print(f"   Model: {model}")
        print(f"   Confidence: {confidence.overall_score:.2f}")
    
    def test_system_design_pipeline(self):
        """Test pipeline for system design question"""
        question = "Design a URL shortening service like bit.ly"
        
        # Classify
        classification = classify_question(question)
        assert classification.primary_type == QuestionType.SYSTEM_DESIGN
        assert classification.complexity in ["medium", "hard"]
        
        # Route
        model, params = route_model(question)
        assert "claude" in model.lower() or "gpt-4o" in model.lower()
        assert params["max_tokens"] >= 2000  # System design needs longer responses
        
        # Mock comprehensive answer
        mock_answer = """
## High-Level Architecture

**Components:**
1. Web Server (API Gateway)
2. Application Server (URL Generation Service)
3. Database (URL Mappings)
4. Cache Layer (Redis)
5. Analytics Service

## Design Details

**URL Generation Algorithm:**
- Use Base62 encoding (a-zA-Z0-9) for short URLs
- Generate unique IDs using distributed ID generator (Snowflake)
- Hash collision handling with retry mechanism

**Scalability:**
- Horizontal scaling with load balancers
- Database sharding by hash(short_url)
- Read replicas for analytics queries
- CDN for global distribution

**Trade-offs:**
- Short URL length vs collision probability
- Consistency vs availability (AP in CAP theorem)
- Custom URLs vs random generation
"""
        
        confidence = score_answer(mock_answer, question)
        
        # System design should have good formatting and completeness
        assert confidence.formatting_quality > 0.6
        assert confidence.completeness > 0.6
        
        print(f"✅ System design pipeline test passed!")
        print(f"   Complexity: {classification.complexity}")
        print(f"   Confidence: {confidence.overall_score:.2f}")
    
    def test_low_quality_answer_detection(self):
        """Test that low-quality answers are properly flagged"""
        question = "Implement binary search"
        
        # Various bad answers
        bad_answers = [
            "I cannot see the screen content to answer this.",
            "Here's the code:\n\ndef binary_search(arr, target):\n    # TODO\n    pass",
            "That's a great question! Binary search is an important algorithm. Let me know if you need more help!",
            "x x x x x",  # Gibberish
        ]
        
        for bad_answer in bad_answers:
            confidence = score_answer(bad_answer, question)
            
            # Should be flagged for retry
            assert confidence.overall_score < 0.6, f"Failed to detect bad answer: {bad_answer[:50]}"
            assert confidence.recommendation in ["retry", "manual_review"]
            assert len(confidence.issues) > 0
        
        print(f"✅ Low quality detection test passed!")
    
    def test_router_cost_estimation(self):
        """Test that router estimates costs correctly"""
        router = ModelRouter(budget_mode=False)
        
        question = "Implement quicksort"
        model, params = router.route(question)
        
        # Estimate cost
        cost = router._estimate_cost(model, question, params["max_tokens"])
        
        assert cost > 0
        assert cost < 1.0  # Should be reasonable
        
        print(f"✅ Cost estimation test passed!")
        print(f"   Estimated cost: ${cost:.4f}")
    
    def test_budget_mode(self):
        """Test that budget mode uses cheaper models"""
        # Without budget mode
        router_premium = ModelRouter(budget_mode=False)
        question = "Design a distributed cache"
        model_premium, _ = router_premium.route(question)
        
        # With budget mode
        router_budget = ModelRouter(budget_mode=True)
        model_budget, _ = router_budget.route(question)
        
        # Budget mode should downgrade expensive models
        if "claude" in model_premium.lower() or "gpt-4o" in model_premium.lower():
            assert "gpt-4o-mini" in model_budget.lower()
        
        print(f"✅ Budget mode test passed!")
        print(f"   Premium: {model_premium}")
        print(f"   Budget: {model_budget}")
    
    def test_query_expansion(self, mock_resume_data, mock_embedder):
        """Test query expansion in context manager"""
        texts, embeddings = mock_resume_data
        context_mgr = create_context_manager(mock_embedder, embeddings, texts)
        
        question = "Tell me about your Python experience"
        
        # Expand query
        expanded = context_mgr.expand_query(question)
        
        assert len(expanded) >= 1  # Should have at least original
        assert question in expanded  # Original should be included
        
        # Should expand "Python" to related terms
        expanded_str = " ".join(expanded).lower()
        # May include: django, flask, pandas, etc.
        
        print(f"✅ Query expansion test passed!")
        print(f"   Original: {question}")
        print(f"   Expanded to {len(expanded)} variants")


class TestEdgeCases:
    """Test edge cases and error handling"""
    
    def test_empty_question(self):
        """Test handling of empty questions"""
        classification = classify_question("")
        assert classification.primary_type == QuestionType.GENERAL
        assert classification.confidence == 0.0
        
        model, params = route_model("")
        assert model is not None
    
    def test_gibberish_question(self):
        """Test handling of nonsense input"""
        classification = classify_question("asdfghjkl qwertyuiop")
        assert classification.primary_type == QuestionType.GENERAL
        assert classification.confidence < 0.5
    
    def test_very_long_question(self):
        """Test handling of very long questions"""
        long_question = "Implement a function " * 1000
        classification = classify_question(long_question)
        assert classification is not None
        
        model, params = route_model(long_question)
        assert model is not None


def run_all_tests():
    """Run all integration tests"""
    print("=" * 80)
    print("INTEGRATION TEST SUITE - Intelligent Routing System")
    print("=" * 80)
    
    # Create test instance
    test = TestIntegration()
    
    # Create fixtures
    mock_resume_data = (
        [
            "Senior Software Engineer at TechCorp (2020-2023)",
            "Built React dashboard with 10k users",
            "Skills: Python, JavaScript, AWS, Docker",
        ],
        np.random.randn(3, 384).astype('float32')
    )
    
    class MockEmbedder:
        def encode(self, texts, normalize_embeddings=True):
            embs = np.random.randn(len(texts), 384).astype('float32')
            if normalize_embeddings:
                embs = embs / np.linalg.norm(embs, axis=1, keepdims=True)
            return embs
    
    # Run tests
    print("\n1. Testing coding question pipeline...")
    test.test_coding_question_pipeline(mock_resume_data, MockEmbedder())
    
    print("\n2. Testing behavioral question pipeline...")
    test.test_behavioral_question_pipeline(mock_resume_data, MockEmbedder())
    
    print("\n3. Testing system design pipeline...")
    test.test_system_design_pipeline()
    
    print("\n4. Testing low quality detection...")
    test.test_low_quality_answer_detection()
    
    print("\n5. Testing cost estimation...")
    test.test_router_cost_estimation()
    
    print("\n6. Testing budget mode...")
    test.test_budget_mode()
    
    print("\n7. Testing query expansion...")
    test.test_query_expansion(mock_resume_data, MockEmbedder())
    
    # Edge cases
    print("\n8. Testing edge cases...")
    edge_test = TestEdgeCases()
    edge_test.test_empty_question()
    edge_test.test_gibberish_question()
    edge_test.test_very_long_question()
    print("✅ Edge cases passed!")
    
    print("\n" + "=" * 80)
    print("ALL INTEGRATION TESTS PASSED! ✅")
    print("=" * 80)


if __name__ == "__main__":
    # Can run standalone or with pytest
    try:
        # Try running with pytest if available
        pytest.main([__file__, "-v", "-s"])
    except:
        # Fallback to manual run
        run_all_tests()
