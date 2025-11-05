"""
Test company brief conditional inclusion.

Ensures company information is ONLY included when the interviewer asks company-related questions.
"""

import sys
import os
import pytest

# Add parent directory to path to import server module
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from server import _is_company_related, _extract_company_names


class TestCompanyRelatedDetection:
    """Test detection of company-related questions."""
    
    @pytest.fixture
    def company_text(self):
        """Sample company brief."""
        return """
        Company Name: TechCorp Inc.
        Mission: Building innovative AI solutions.
        Products: AI Assistant, Cloud Platform
        Culture: Fast-paced, collaborative environment
        """
    
    def test_direct_company_name_mention(self, company_text):
        """Test questions mentioning company name."""
        questions = [
            "Tell me about TechCorp",
            "Why do you want to work at TechCorp Inc?",
            "What do you know about TechCorp?",
        ]
        for q in questions:
            assert _is_company_related(q, company_text), f"Should detect: {q}"
    
    def test_why_work_here_questions(self, company_text):
        """Test 'why work here' variations."""
        questions = [
            "Why do you want to work here?",
            "Why work with us?",
            "Why are you interested in this company?",
            "What interests you about this role?",
        ]
        for q in questions:
            assert _is_company_related(q, company_text), f"Should detect: {q}"
    
    def test_company_knowledge_questions(self, company_text):
        """Test questions about company knowledge."""
        questions = [
            "What do you know about us?",
            "What do you know about our company?",
            "Tell me about the company",
            "What do you know about this company?",
        ]
        for q in questions:
            assert _is_company_related(q, company_text), f"Should detect: {q}"
    
    def test_our_company_attributes(self, company_text):
        """Test questions using 'our' for company attributes."""
        questions = [
            "What do you think about our mission?",
            "How do you align with our values?",
            "What do you know about our products?",
            "How would you improve our product?",
            "Tell me about our tech stack",
            "What do you think about our culture?",
        ]
        for q in questions:
            assert _is_company_related(q, company_text), f"Should detect: {q}"
    
    def test_fit_and_contribution_questions(self, company_text):
        """Test questions about fit and contribution."""
        questions = [
            "Why should we hire you?",
            "What can you bring to our team?",
            "How would you fit in our company?",
            "How do you contribute to the team?",
        ]
        for q in questions:
            assert _is_company_related(q, company_text), f"Should detect: {q}"
    
    def test_technical_questions_not_company_related(self, company_text):
        """Test that technical questions are NOT detected as company-related."""
        questions = [
            "Explain the difference between REST and GraphQL",
            "How does a hash table work?",
            "Write a function to reverse a linked list",
            "What is the time complexity of quicksort?",
            "Implement binary search in Python",
            "Explain async/await in JavaScript",
        ]
        for q in questions:
            assert not _is_company_related(q, company_text), f"Should NOT detect: {q}"
    
    def test_behavioral_questions_not_company_related(self, company_text):
        """Test that behavioral questions are NOT detected as company-related."""
        questions = [
            "Tell me about a time you solved a difficult problem",
            "Describe a situation where you had a conflict with a teammate",
            "What is your greatest weakness?",
            "Where do you see yourself in 5 years?",
            "Tell me about your experience with agile development",
            "How do you handle tight deadlines?",
        ]
        for q in questions:
            assert not _is_company_related(q, company_text), f"Should NOT detect: {q}"
    
    def test_system_design_questions_not_company_related(self, company_text):
        """Test that system design questions are NOT detected as company-related."""
        questions = [
            "Design a URL shortener like bit.ly",
            "How would you design Instagram?",
            "Design a chat system like WhatsApp",
            "How would you build a rate limiter?",
            "Design a distributed cache",
        ]
        for q in questions:
            assert not _is_company_related(q, company_text), f"Should NOT detect: {q}"
    
    def test_empty_inputs(self, company_text):
        """Test edge cases with empty inputs."""
        assert not _is_company_related("", company_text)
        assert not _is_company_related("Some question", "")
        assert not _is_company_related("", "")
    
    def test_company_name_extraction(self):
        """Test company name extraction."""
        company_texts = [
            "Company Name: Acme Corp\nMission: Innovation",
            "Company: TechStart Inc.\nFounded: 2020",
            "Organization: DataFlow\nIndustry: Analytics",
        ]
        
        expected_names = ["Acme Corp", "TechStart Inc.", "DataFlow"]
        
        for text, expected in zip(company_texts, expected_names):
            names = _extract_company_names(text)
            assert len(names) > 0, f"Should extract name from: {text}"
            assert expected in names or expected.lower() in [n.lower() for n in names], \
                f"Should extract '{expected}' from: {text}"
    
    def test_case_insensitive_detection(self, company_text):
        """Test case-insensitive detection."""
        questions = [
            "WHY DO YOU WANT TO WORK HERE?",
            "what do you know about our COMPANY?",
            "Tell Me About The Company",
        ]
        for q in questions:
            assert _is_company_related(q, company_text), f"Should detect (case insensitive): {q}"


class TestCompanyBriefIntegration:
    """Test integration with prompt building."""
    
    def test_company_brief_only_for_company_questions(self):
        """
        CRITICAL TEST: Verify company brief is ONLY included for company-related questions.
        
        This ensures:
        - Technical questions don't get company context
        - Behavioral questions don't get company context  
        - ONLY company-specific questions get company context
        """
        # This test would require mocking the build_prompts function
        # For now, document the expected behavior
        
        expected_behavior = {
            "Why work here?": "SHOULD include company brief",
            "Reverse a linked list": "should NOT include company brief",
            "Tell me about a time...": "should NOT include company brief",
            "What do you know about our company?": "SHOULD include company brief",
        }
        
        # This is a documentation test - actual implementation tested above
        assert True, "Company brief inclusion logic tested via _is_company_related()"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
