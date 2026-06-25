# -*- coding: utf-8 -*-
"""
Answer Confidence Scorer
Evaluates the quality and confidence of AI-generated interview answers.
"""

import re
import logging
from typing import Dict, List, Literal
from dataclasses import dataclass

from question_classifier import QuestionType, classify_question

logger = logging.getLogger(__name__)


@dataclass
class ConfidenceScore:
    """Confidence assessment for an AI answer"""
    overall_score: float  # 0.0 to 1.0
    completeness: float  # 0.0 to 1.0
    relevance: float  # 0.0 to 1.0
    technical_accuracy: float  # 0.0 to 1.0
    formatting_quality: float  # 0.0 to 1.0
    issues: List[str]  # List of detected problems
    recommendation: Literal["accept", "retry", "manual_review"]


class ConfidenceScorer:
    """
    Scores AI-generated answers for quality and confidence.
    Helps detect hallucinations, incomplete answers, and off-topic responses.
    """

    # Red flags that indicate low-quality responses
    DEFLECTION_PATTERNS = [
        r"I cannot see.*screen.*content",
        r"I don't have access.*image",
        r"Please provide.*more.*context",
        r"I need.*additional.*information",
        r"Could you.*please.*clarify",
        r"As an AI language model, I cannot",
        r"I apologize, but I don't have",
    ]

    # Filler phrases that add no value
    FILLER_PHRASES = [
        "that's a great question",
        "I hope this helps",
        "let me know if you need",
        "feel free to ask",
        "I'd be happy to",
        "please let me know",
    ]

    # Indicators of incomplete/truncated responses
    TRUNCATION_MARKERS = [
        "to be continued",
        "part 1 of",
        "continued in next response",
        "I'll continue",
        "let me provide the rest",
        "here's part",
    ]

    def __init__(self):
        """Initialize scorer with compiled patterns"""
        self.deflection_regex = [re.compile(p, re.IGNORECASE) for p in self.DEFLECTION_PATTERNS]
        self.filler_regex = [re.compile(re.escape(p), re.IGNORECASE) for p in self.FILLER_PHRASES]
        self.truncation_regex = [re.compile(p, re.IGNORECASE) for p in self.TRUNCATION_MARKERS]

    def score(self, answer: str, question: str, expected_type: QuestionType = None) -> ConfidenceScore:
        """
        Score an answer's quality and confidence.

        Args:
            answer: AI-generated response
            question: Original question
            expected_type: Expected question type (if known)

        Returns:
            ConfidenceScore with detailed assessment
        """
        issues = []

        # Classify question if not provided
        if expected_type is None:
            classification = classify_question(question)
            expected_type = classification.primary_type

        # Score individual dimensions
        completeness = self._score_completeness(answer, question, expected_type, issues)
        relevance = self._score_relevance(answer, question, issues)
        technical_accuracy = self._score_technical_accuracy(answer, expected_type, issues)
        formatting_quality = self._score_formatting(answer, expected_type, issues)

        # Overall score (weighted average)
        overall_score = (
            0.35 * completeness +
            0.30 * relevance +
            0.20 * technical_accuracy +
            0.15 * formatting_quality
        )

        # Determine recommendation
        if overall_score >= 0.75 and not any("CRITICAL" in issue for issue in issues):
            recommendation = "accept"
        elif overall_score >= 0.50:
            recommendation = "manual_review"
        else:
            recommendation = "retry"

        return ConfidenceScore(
            overall_score=overall_score,
            completeness=completeness,
            relevance=relevance,
            technical_accuracy=technical_accuracy,
            formatting_quality=formatting_quality,
            issues=issues,
            recommendation=recommendation
        )

    def _score_completeness(
        self,
        answer: str,
        question: str,
        qtype: QuestionType,
        issues: List[str]
    ) -> float:
        """Score how complete the answer is"""
        score = 1.0

        # Check minimum length
        if len(answer.strip()) < 50:
            issues.append("CRITICAL: Answer too short (<50 chars)")
            score -= 0.8
        elif len(answer.strip()) < 100:
            issues.append("WARNING: Answer very brief (<100 chars)")
            score -= 0.3

        # Check for deflection patterns
        for pattern in self.deflection_regex:
            if pattern.search(answer):
                issues.append(f"CRITICAL: Deflection detected - {pattern.pattern[:50]}")
                score -= 0.9
                break

        # Check for truncation markers
        for pattern in self.truncation_regex:
            if pattern.search(answer):
                issues.append("WARNING: Answer appears truncated")
                score -= 0.4
                break

        # Type-specific completeness checks
        if qtype == QuestionType.CODING:
            if "```" not in answer:
                issues.append("WARNING: Coding question but no code block found")
                score -= 0.6
            if not re.search(r'O\([^)]+\)', answer):
                issues.append("INFO: No complexity analysis found")
                score -= 0.2

        elif qtype == QuestionType.BEHAVIORAL:
            # Check for STAR method components
            has_situation = bool(re.search(r'\b(situation|context|scenario)\b', answer, re.IGNORECASE))
            has_action = bool(re.search(r'\b(action|did|implemented|took)\b', answer, re.IGNORECASE))
            has_result = bool(re.search(r'\b(result|outcome|impact|achieved)\b', answer, re.IGNORECASE))

            if not (has_situation or has_action or has_result):
                issues.append("WARNING: Behavioral answer lacks STAR structure")
                score -= 0.3

        elif qtype == QuestionType.SYSTEM_DESIGN:
            # Check for design components
            has_architecture = bool(re.search(r'\b(component|service|layer|tier)\b', answer, re.IGNORECASE))
            has_tradeoffs = bool(re.search(r'\b(tradeoff|trade-off|advantage|disadvantage)\b', answer, re.IGNORECASE))

            if not has_architecture:
                issues.append("WARNING: System design lacks architecture discussion")
                score -= 0.2
            if not has_tradeoffs:
                issues.append("INFO: No tradeoffs discussed")
                score -= 0.1

        return max(score, 0.0)

    def _score_relevance(self, answer: str, question: str, issues: List[str]) -> float:
        """Score how relevant the answer is to the question"""
        score = 1.0

        # Extract key terms from question
        question_terms = set(re.findall(r'\b\w{4,}\b', question.lower()))
        answer_terms = set(re.findall(r'\b\w{4,}\b', answer.lower()))

        # Calculate term overlap
        if question_terms:
            overlap = len(question_terms & answer_terms) / len(question_terms)

            if overlap < 0.2:
                issues.append("WARNING: Low keyword overlap with question (<20%)")
                score -= 0.4
            elif overlap < 0.4:
                issues.append("INFO: Moderate keyword overlap (20-40%)")
                score -= 0.2

        # Check for excessive filler
        filler_count = sum(1 for pattern in self.filler_regex if pattern.search(answer))
        if filler_count >= 3:
            issues.append("WARNING: Excessive filler phrases")
            score -= 0.3
        elif filler_count >= 1:
            score -= 0.1

        return max(score, 0.0)

    def _score_technical_accuracy(
        self,
        answer: str,
        qtype: QuestionType,
        issues: List[str]
    ) -> float:
        """Score technical accuracy (basic checks only)"""
        score = 1.0

        # Check for obvious errors
        if "ERROR:" in answer or "Failed to" in answer:
            issues.append("CRITICAL: Error message in answer")
            score -= 0.8

        # Check for repeated text (stuttering)
        words = answer.lower().split()
        if len(words) > 10:
            for i in range(len(words) - 3):
                if words[i] == words[i+1] == words[i+2] and len(words[i]) > 3:
                    issues.append(f"WARNING: Repetitive text detected ('{words[i]}')")
                    score -= 0.3
                    break

        # Type-specific checks
        if qtype == QuestionType.CODING:
            # Check for obviously broken code syntax
            code_blocks = re.findall(r'```(?:\w+)?\n(.*?)```', answer, re.DOTALL)
            if not code_blocks:

                issues.append("WARNING: Coding answer has no implementation")

                score -= 0.5

            for code in code_blocks:
                if code.count('(') != code.count(')'):
                    issues.append("WARNING: Unbalanced parentheses in code")
                    score -= 0.2
                if code.count('{') != code.count('}'):
                    issues.append("WARNING: Unbalanced braces in code")
                    score -= 0.2

        return max(score, 0.0)

    def _score_formatting(
        self,
        answer: str,
        qtype: QuestionType,
        issues: List[str]
    ) -> float:
        """Score formatting quality"""
        score = 1.0

        # Check for proper structure
        has_headers = bool(re.search(r'^#{1,3}\s+\w+', answer, re.MULTILINE))
        has_bullets = bool(re.search(r'^\s*[-*•]\s+\w+', answer, re.MULTILINE))
        has_code_blocks = "```" in answer

        # Type-specific formatting expectations
        if qtype == QuestionType.CODING:
            if not has_code_blocks:
                issues.append("WARNING: Coding answer should use code blocks")
                score -= 0.6

        elif qtype in [QuestionType.SYSTEM_DESIGN, QuestionType.THEORY]:
            if not (has_headers or has_bullets):
                issues.append("INFO: Answer could benefit from better structure")
                score -= 0.2

        # Check for wall of text (no paragraphs)
        paragraphs = answer.split('\n\n')
        if len(paragraphs) == 1 and len(answer) > 500:
            issues.append("INFO: Answer is a wall of text - needs paragraph breaks")
            score -= 0.2

        return max(score, 0.0)


# Singleton instance
_scorer = None

def get_scorer() -> ConfidenceScorer:
    """Get or create singleton scorer instance"""
    global _scorer
    if _scorer is None:
        _scorer = ConfidenceScorer()
    return _scorer


def score_answer(answer: str, question: str) -> ConfidenceScore:
    """
    Convenience function to score an answer.

    Example:
        >>> score = score_answer(answer_text, question_text)
        >>> print(f"Confidence: {score.overall_score:.2f}")
        >>> if score.recommendation == "retry":
        >>>     print("Should retry this answer")
    """
    return get_scorer().score(answer, question)


if __name__ == "__main__":
    # Test cases
    print("=" * 80)
    print("Answer Confidence Scorer - Test Suite")
    print("=" * 80)

    test_cases = [
        {
            "question": "Implement a binary search tree",
            "answer": """Here's a complete implementation:

```python
class TreeNode:
    def __init__(self, val):
        self.val = val
        self.left = None
        self.right = None

class BST:
    def __init__(self):
        self.root = None

    def insert(self, val):
        if not self.root:
            self.root = TreeNode(val)
        else:
            self._insert_helper(self.root, val)

    def _insert_helper(self, node, val):
        if val < node.val:
            if node.left is None:
                node.left = TreeNode(val)
            else:
                self._insert_helper(node.left, val)
        else:
            if node.right is None:
                node.right = TreeNode(val)
            else:
                self._insert_helper(node.right, val)
```

Time Complexity: $O(\\log n)$ average, $O(n)$ worst case
Space Complexity: $O(h)$ where h is height""",
            "expected": "accept"
        },
        {
            "question": "Tell me about a time you had a conflict",
            "answer": "I don't have access to the screen content to answer this question.",
            "expected": "retry"
        },
        {
            "question": "What is REST API?",
            "answer": "REST is Representational State Transfer, an architectural style for web services.",
            "expected": "manual_review"  # Brief but not wrong
        },
    ]

    scorer = ConfidenceScorer()

    for i, test in enumerate(test_cases, 1):
        print(f"\n{'='*80}")
        print(f"Test Case {i}")
        print(f"{'='*80}")
        print(f"Question: {test['question']}")
        print(f"Answer: {test['answer'][:100]}...")

        result = scorer.score(test['answer'], test['question'])

        print(f"\n📊 Scores:")
        print(f"   Overall: {result.overall_score:.2f}")
        print(f"   Completeness: {result.completeness:.2f}")
        print(f"   Relevance: {result.relevance:.2f}")
        print(f"   Technical: {result.technical_accuracy:.2f}")
        print(f"   Formatting: {result.formatting_quality:.2f}")
        print(f"\n💡 Recommendation: {result.recommendation.upper()}")

        if result.issues:
            print(f"\n⚠️  Issues Detected:")
            for issue in result.issues:
                print(f"   - {issue}")

        expected_match = "✅" if result.recommendation == test["expected"] else "❌"
        print(f"\n{expected_match} Expected: {test['expected']}, Got: {result.recommendation}")
