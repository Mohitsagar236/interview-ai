"""
Unit tests for Question Classifier
"""

import pytest
from question_classifier import classify_question, classify_interview_question, QuestionType, QuestionClassifier


class TestQuestionClassifier:
    """Test suite for question type classification"""
    
    @pytest.fixture
    def classifier(self):
        """Create classifier instance for tests"""
        return QuestionClassifier()
    
    def test_coding_question_detection(self, classifier):
        """Test detection of coding questions"""
        questions = [
            "Implement a binary search tree",
            "Write a function to reverse a linked list",
            "Given an array, find the maximum subarray sum",
            "Code a solution for the two-sum problem",
        ]
        
        for q in questions:
            result = classifier.classify(q)
            assert result.primary_type == QuestionType.CODING, f"Failed for: {q}"
            assert result.confidence > 0.4, f"Low confidence for: {q}"
            assert "coding" in result.tags
    
    def test_system_design_detection(self, classifier):
        """Test detection of system design questions"""
        questions = [
            "Design a URL shortening service like bit.ly",
            "How would you architect a distributed cache?",
            "Design Instagram's photo storage system",
            "How would you scale a messaging service to 1M users?",
        ]
        
        for q in questions:
            result = classifier.classify(q)
            assert result.primary_type == QuestionType.SYSTEM_DESIGN, f"Failed for: {q}"
            assert "anthropic" in result.suggested_model or "claude" in result.suggested_model
    
    def test_behavioral_detection(self, classifier):
        """Test detection of behavioral questions"""
        questions = [
            "Tell me about a time you had a conflict with a teammate",
            "Describe a situation where you showed leadership",
            "Give an example of a challenging project you completed",
            "Tell me about a time you failed",
        ]
        
        for q in questions:
            result = classifier.classify(q)
            assert result.primary_type == QuestionType.BEHAVIORAL, f"Failed for: {q}"
    
    def test_theory_detection(self, classifier):
        """Test detection of theory/definition questions"""
        questions = [
            "What is the difference between TCP and UDP?",
            "Explain what REST API means",
            "Define polymorphism in OOP",
        ]
        
        for q in questions:
            result = classifier.classify(q)
            assert result.primary_type == QuestionType.THEORY, f"Failed for: {q}"
    
    def test_ml_detection(self, classifier):
        """Test detection of ML/data science questions"""
        questions = [
            "Explain gradient descent in neural networks",
            "What is overfitting and how do you prevent it?",
            "Describe how a random forest works",
        ]
        
        for q in questions:
            result = classifier.classify(q)
            assert result.primary_type == QuestionType.ML_DATA_SCIENCE, f"Failed for: {q}"
    
    def test_sql_detection(self, classifier):
        """Test detection of SQL questions"""
        questions = [
            "Write SQL to find the second highest salary",
            "How would you join these two tables?",
            "Write a query to get employees with salary > average",
        ]
        
        for q in questions:
            result = classifier.classify(q)
            assert result.primary_type == QuestionType.SQL_DATABASE, f"Failed for: {q}"
    
    def test_empty_question(self, classifier):
        """Test handling of empty/invalid input"""
        result = classifier.classify("")
        assert result.primary_type == QuestionType.GENERAL
        assert result.confidence == 0.0
        
        result = classifier.classify("   ")
        assert result.primary_type == QuestionType.GENERAL
    
    def test_complexity_assessment(self, classifier):
        """Test complexity detection"""
        easy = classifier.classify("What is a linked list?")
        hard = classifier.classify("Implement a concurrent lock-free LRU cache with O(1) operations")
        
        assert easy.complexity in ["easy", "medium"], f"Expected easy/medium, got {easy.complexity}"
        assert hard.complexity in ["medium", "hard"], f"Expected medium/hard, got {hard.complexity}"
    
    @pytest.mark.parametrize("question,expected_type", [
        ("Explain gradient descent", QuestionType.ML_DATA_SCIENCE),
        ("Write SQL to find second highest salary", QuestionType.SQL_DATABASE),
        ("Debug this NullPointerException", QuestionType.DEBUGGING),
        ("How would you prioritize features?", QuestionType.PRODUCT),
    ])
    def test_specialized_types(self, classifier, question, expected_type):
        """Test detection of specialized question types"""
        result = classifier.classify(question)
        assert result.primary_type == expected_type
    
    def test_model_recommendations(self, classifier):
        """Test that model recommendations are appropriate"""
        # Coding should suggest GPT-4o or GPT-4o-mini
        coding_result = classifier.classify("Implement quicksort")
        assert "gpt-4o" in coding_result.suggested_model.lower()
        
        # System design should suggest Claude
        design_result = classifier.classify("Design a distributed cache")
        assert "claude" in design_result.suggested_model.lower()
        
        # Behavioral should suggest Claude
        behavioral_result = classifier.classify("Tell me about a conflict you had")
        assert "claude" in behavioral_result.suggested_model.lower()
    
    def test_suggested_params(self, classifier):
        """Test that suggested parameters are reasonable"""
        result = classifier.classify("Implement binary search")
        
        assert "temperature" in result.suggested_params
        assert "max_tokens" in result.suggested_params
        assert 0.0 <= result.suggested_params["temperature"] <= 0.3  # Low temp for coding
        assert result.suggested_params["max_tokens"] > 0
    
    def test_tags_population(self, classifier):
        """Test that relevant tags are populated"""
        # Mixed question (coding + ML)
        result = classifier.classify("Implement a neural network from scratch in Python")
        
        assert len(result.tags) >= 1
        assert any(tag in ["coding", "ml_data_science"] for tag in result.tags)
    
    def test_confidence_scores(self, classifier):
        """Test that confidence scores are in valid range"""
        questions = [
            "Implement a binary search tree",
            "Design a URL shortener",
            "Tell me about yourself",
            "asdfghjkl",  # Gibberish
        ]
        
        for q in questions:
            result = classifier.classify(q)
            assert 0.0 <= result.confidence <= 1.0, f"Invalid confidence for: {q}"


class TestConvenienceFunctions:
    """Test standalone convenience functions"""
    
    def test_classify_question_function(self):
        """Test the standalone classify_question function"""
        result = classify_question("Implement merge sort")
        assert isinstance(result.primary_type, QuestionType)
        assert result.primary_type == QuestionType.CODING
    
    def test_get_classifier_singleton(self):
        """Test that get_classifier returns singleton"""
        from question_classifier import get_classifier
        
        classifier1 = get_classifier()
        classifier2 = get_classifier()
        
        assert classifier1 is classifier2  # Same instance


class TestInterviewRoutingClassification:
    """Test resume-aware interview copilot routing metadata."""

    @pytest.mark.parametrize("question,expected_type,needs_resume,needs_general_ai", [
        ("Tell me about yourself.", "resume_hr", True, False),
        ("Tell me about your internship experience.", "resume_specific", True, False),
        ("Which company did I intern at Microsoft for?", "unsupported_resume_claim_check", True, False),
        ("Explain Docker to a beginner.", "technical", False, True),
        ("Find the largest element in an array.", "coding", False, True),
        ("Design WhatsApp.", "system_design", False, True),
        ("Why should we hire you for an ML Engineer role?", "resume_hr", True, False),
    ])
    def test_requested_classifier_examples(self, question, expected_type, needs_resume, needs_general_ai):
        result = classify_interview_question(question)

        assert result["question_type"] == expected_type
        assert result["needs_resume"] is needs_resume
        assert result["needs_general_ai"] is needs_general_ai
        assert 0 <= result["confidence"] <= 100


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
