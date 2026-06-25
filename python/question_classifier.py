# -*- coding: utf-8 -*-
"""
Question Type Classifier for Interview AI
Categorizes questions to enable intelligent model routing and prompt optimization.
"""

import re
from typing import Dict, List, Literal
from dataclasses import dataclass
from enum import Enum


class QuestionType(str, Enum):
    """Question categories for interview preparation"""
    CODING = "coding"
    SYSTEM_DESIGN = "system_design"
    BEHAVIORAL = "behavioral"
    THEORY = "theory"
    MATH = "math"
    DEBUGGING = "debugging"
    SQL_DATABASE = "sql_database"
    ML_DATA_SCIENCE = "ml_data_science"
    PRODUCT = "product"
    GENERAL = "general"


@dataclass
class QuestionClassification:
    """Result of question classification"""
    primary_type: QuestionType
    confidence: float  # 0.0 to 1.0; kept for existing model-routing code
    tags: List[str]
    complexity: Literal["easy", "medium", "hard", "unknown"]
    suggested_model: str
    suggested_params: Dict[str, any]
    question_type: str = "general_knowledge"
    needs_resume: bool = False
    needs_general_ai: bool = True
    confidence_percent: int = 30

    def to_interview_dict(self) -> Dict[str, object]:
        """Return the compact classifier shape used by prompt/context routing."""
        return {
            "question_type": self.question_type,
            "needs_resume": self.needs_resume,
            "needs_general_ai": self.needs_general_ai,
            "confidence": self.confidence_percent,
        }

class QuestionClassifier:
    """
    Lightweight rule-based classifier for interview questions.
    Uses keyword matching + pattern recognition for fast classification.
    """

    # Keyword patterns for each question type
    CODING_KEYWORDS = [
        r'\b(algorithm|code|implement|function|class|program|solve|write)\b',
        r'\b(array|string|tree|graph|linked list|hash|stack|queue)\b',
        r'\b(time complexity|space complexity|optimize|efficient)\b',
        r'\b(leetcode|hackerrank|codility)\b',
        r'\b(return|print|output|input)\b',
        r'O\([nlogmk\d\s\+\*]+\)',  # Big-O notation
    ]

    SYSTEM_DESIGN_KEYWORDS = [
        r'\b(design|architect|scale|distributed|microservice)\b',
        r'\b(load balanc|cache|database|api|rest|graphql)\b',
        r'\b(availability|consistency|partition|cap theorem)\b',
        r'\b(throughput|latency|qps|requests per second)\b',
        r'\b(sharding|replication|cdn|message queue)\b',
        r'\b(design (a|an) |how would you (build|design|architect))\b',
    ]

    BEHAVIORAL_KEYWORDS = [
        r'\b(tell me about|describe a time|give an example)\b',
        r'\b(experience|situation|challenge|conflict|disagree)\b',
        r'\b(team|leader|manage|collaborate|communicate)\b',
        r'\b(failure|mistake|learn|improve|feedback)\b',
        r'\b(strength|weakness|motivate|passion)\b',
        r'\b(why (should we|do you want)|what makes you)\b',
    ]

    THEORY_KEYWORDS = [
        r'\b(what is|define|explain|difference between)\b',
        r'\b(concept|principle|pattern|paradigm)\b',
        r'\b(oop|solid|dry|kiss|inheritance|polymorphism)\b',
        r'\b(rest|soap|http|tcp|udp|dns)\b',
        r'\b(agile|scrum|ci/cd|devops|testing)\b',
    ]

    ML_DS_KEYWORDS = [
        r'\b(machine learning|deep learning|neural network)\b',
        r'\b(model|train|feature|dataset|prediction)\b',
        r'\b(supervised|unsupervised|reinforcement)\b',
        r'\b(regression|classification|clustering|dimensionality)\b',
        r'\b(precision|recall|f1|accuracy|overfitting)\b',
        r'\b(gradient descent|backprop|loss function)\b',
    ]

    SQL_DB_KEYWORDS = [
        r'\b(sql|query|database|table|join|select)\b',
        r'\b(inner join|left join|group by|order by|where)\b',
        r'\b(index|foreign key|primary key|normalize)\b',
        r'\b(transaction|acid|isolation|rollback)\b',
    ]

    DEBUGGING_KEYWORDS = [
        r'\b(debug|fix|error|bug|issue|problem)\b',
        r'\b(why (is|does)|what\'s wrong|not working)\b',
        r'\b(crash|fail|exception|null pointer)\b',
    ]

    PRODUCT_KEYWORDS = [
        r'\b(product|feature|user|customer|market)\b',
        r'\b(roadmap|priority|metric|kpi|growth)\b',
        r'\b(a/b test|experiment|hypothesis|data-driven)\b',
    ]

    # Complexity indicators
    EASY_INDICATORS = [
        r'\b(simple|basic|intro|beginner|easy)\b',
        r'\b(what is|define|list)\b',
    ]

    HARD_INDICATORS = [
        r'\b(advanced|complex|difficult|challenging|hard)\b',
        r'\b(optimize|efficient|scalable|distributed)\b',
        r'\b(multi-|concurrent|parallel|async)\b',
    ]

    def __init__(self):
        """Initialize classifier with compiled regex patterns"""
        self.patterns = {
            QuestionType.CODING: [re.compile(p, re.IGNORECASE) for p in self.CODING_KEYWORDS],
            QuestionType.SYSTEM_DESIGN: [re.compile(p, re.IGNORECASE) for p in self.SYSTEM_DESIGN_KEYWORDS],
            QuestionType.BEHAVIORAL: [re.compile(p, re.IGNORECASE) for p in self.BEHAVIORAL_KEYWORDS],
            QuestionType.THEORY: [re.compile(p, re.IGNORECASE) for p in self.THEORY_KEYWORDS],
            QuestionType.ML_DATA_SCIENCE: [re.compile(p, re.IGNORECASE) for p in self.ML_DS_KEYWORDS],
            QuestionType.SQL_DATABASE: [re.compile(p, re.IGNORECASE) for p in self.SQL_DB_KEYWORDS],
            QuestionType.DEBUGGING: [re.compile(p, re.IGNORECASE) for p in self.DEBUGGING_KEYWORDS],
            QuestionType.PRODUCT: [re.compile(p, re.IGNORECASE) for p in self.PRODUCT_KEYWORDS],
        }

        self.easy_patterns = [re.compile(p, re.IGNORECASE) for p in self.EASY_INDICATORS]
        self.hard_patterns = [re.compile(p, re.IGNORECASE) for p in self.HARD_INDICATORS]

    def classify(self, question: str) -> QuestionClassification:
        """
        Classify a question into its primary type with confidence score.

        Args:
            question: The interview question text

        Returns:
            QuestionClassification with type, confidence, tags, and recommendations
        """
        if not question or len(question.strip()) < 3:
            return self._default_classification()

        # Score each question type
        scores = {}
        all_tags = []

        for qtype, patterns in self.patterns.items():
            matches = 0
            for pattern in patterns:
                if pattern.search(question):
                    matches += 1

            # Normalize score (0-1 range)
            score = min(matches / len(patterns), 1.0)
            scores[qtype] = score

            if score >= 0.15:  # Tag threshold
                all_tags.append(qtype.value)

        ql = question.lower()
        priority_overrides = {
            QuestionType.CODING: [
                r"\b(implement|code a solution|write a function|write .*code|find the .* in .*array|reverse .*linked list|max(?:imum)? subarray)\b",
                r"\b(binary search tree|two[- ]sum|largest element|given an array|palindrome)\b",
            ],
            QuestionType.BEHAVIORAL: [
                r"\b(tell me about a time|describe a situation|give an example|showed leadership|conflict|failed|challenge)\b",
            ],
            QuestionType.ML_DATA_SCIENCE: [
                r"\b(gradient descent|neural network|neural networks|random forest|overfitting|machine learning)\b",
            ],
            QuestionType.PRODUCT: [
                r"\b(prioritize features?|feature prioritization|roadmap|product)\b",
            ],
            QuestionType.SYSTEM_DESIGN: [
                r"\b(lld|low[- ]level design|class diagram|object model|design classes|schema design)\b",
            ],
        }
        for qtype, patterns in priority_overrides.items():
            if any(re.search(pattern, ql, re.IGNORECASE) for pattern in patterns):
                scores[qtype] = max(scores.get(qtype, 0.0), 0.6)
                if qtype.value not in all_tags:
                    all_tags.append(qtype.value)


        # Determine primary type (highest score)
        if not scores or max(scores.values()) < 0.15:
            primary_type = QuestionType.GENERAL
            confidence = 0.3
        else:
            primary_type = max(scores, key=scores.get)
            confidence = scores[primary_type]

        # Determine complexity
        complexity = self._assess_complexity(question)

        # Get model recommendation
        suggested_model, params = self._recommend_model(primary_type, complexity, confidence)
        interview_type, needs_resume, needs_general_ai, confidence_percent = self._classify_interview_intent(
            question, primary_type, confidence
        )

        return QuestionClassification(
            primary_type=primary_type,
            confidence=confidence,
            tags=all_tags,
            complexity=complexity,
            suggested_model=suggested_model,
            suggested_params=params,
            question_type=interview_type,
            needs_resume=needs_resume,
            needs_general_ai=needs_general_ai,
            confidence_percent=confidence_percent,
        )

    def _classify_interview_intent(self, question: str, primary_type: QuestionType, confidence: float):
        """Classify into interview-copilot categories and resume/general context needs."""
        q = (question or "").strip().lower()

        def has(pattern: str) -> bool:
            return bool(re.search(pattern, q, re.IGNORECASE))

        candidate_terms = (
            r"\b(i|me|my|mine|myself|candidate|resume|cv|project|projects|internship|internships|skill|skills|"
            r"education|degree|achievement|achievements|experience|background|hire|fit|role fit|strength|weakness|"
            r"programming languages?|languages?)\b"
        )
        resume_specific_terms = (
            r"\b(resume|cv|project|projects|internship|internships|company did i|where did i|"
            r"skill|skills|programming languages?|languages?|education|degree|achievement|certification|course|experience|"
            r"worked on|built|developed)\b"
        )
        claim_check_terms = (
            r"\b(do i have|did i|have i|was i|am i|according to (my )?(resume|cv)|"
            r"is .* on my (resume|cv)|which company did i|where did i|did i intern|did i work|"
            r"(i see you have|you have|you've got).*\d+\+?\s+years?\s+of\s+experience)\b"
        )
        hr_terms = r"\b(tell me about yourself|introduce yourself|walk me through your resume|why should we hire|why hire you|why are you a good fit|why this role|strengths?|weaknesses?)\b"
        behavioral_terms = r"\b(tell me about a time|describe a time|give an example|challenge|conflict|failure|mistake|leadership|teamwork|deadline|pressure|feedback)\b"
        known_resume_entities = (
            r"\b(precisionpath|credit risk|resume analyzer|interviewai\.space|tayog\.in)\b"
        )

        if has(claim_check_terms):
            return "unsupported_resume_claim_check", True, False, 92
        if has(hr_terms):
            return "resume_hr", True, False, 90
        if has(known_resume_entities):
            return "resume_specific", True, False, 86
        if has(resume_specific_terms) and has(candidate_terms):
            return "resume_specific", True, False, 88
        if has(behavioral_terms):
            return "behavioral", True, True, 84
        if primary_type == QuestionType.CODING or (primary_type == QuestionType.SQL_DATABASE and has(r"\b(write|query|select|join|sql)\b")):
            return "coding", False, True, max(70, int(confidence * 100))
        if primary_type == QuestionType.SYSTEM_DESIGN:
            return "system_design", False, True, max(75, int(confidence * 100))
        if has(r"\b(type|enter|open|visit)\s+(google\.com|a url|url).*\b(browser|address bar)\b|\bgoogle\.com\b.*\bbrowser\b"):
            return "technical", False, True, max(75, int(confidence * 100))
        if primary_type in {QuestionType.THEORY, QuestionType.DEBUGGING, QuestionType.SQL_DATABASE, QuestionType.ML_DATA_SCIENCE}:
            return "technical", False, True, max(70, int(confidence * 100))
        if has(candidate_terms) and has(r"\b(hire|fit|role|experience|background|project|internship|skill|education)\b"):
            return "resume_hr", True, False, 78
        return "general_knowledge", False, True, max(35, int(confidence * 100))

    def _assess_complexity(self, question: str) -> Literal["easy", "medium", "hard", "unknown"]:
        """Assess question complexity based on linguistic patterns"""
        easy_count = sum(1 for p in self.easy_patterns if p.search(question))
        hard_count = sum(1 for p in self.hard_patterns if p.search(question))

        if hard_count >= 2:
            return "hard"
        elif hard_count == 1:
            return "medium"
        elif easy_count >= 2:
            return "easy"
        elif easy_count == 1:
            return "easy"
        else:
            # Default: medium for technical, easy for behavioral
            return "medium"

    def _recommend_model(
        self,
        qtype: QuestionType,
        complexity: str,
        confidence: float
    ) -> tuple[str, Dict[str, any]]:
        """
        Recommend optimal model and parameters based on question type.

        Model Selection Strategy:
        - Coding: GPT-4o (best for code generation)
        - System Design: Claude 3.5 Sonnet (best for reasoning)
        - Behavioral: Claude 3.5 Sonnet (best for structured responses)
        - Theory/Math: GPT-4o-mini (fast, accurate for definitions)
        - General: GPT-4o-mini (cost-effective default)
        """
        # Model routing logic
        if qtype == QuestionType.CODING:
            if complexity == "hard":
                model = "openai/gpt-4o"
                params = {"temperature": 0.1, "max_tokens": 2500}
            else:
                model = "openai/gpt-4o-mini"
                params = {"temperature": 0.1, "max_tokens": 1500}

        elif qtype == QuestionType.SYSTEM_DESIGN:
            model = "anthropic/claude-3.5-sonnet"
            params = {"temperature": 0.2, "max_tokens": 3000}

        elif qtype == QuestionType.BEHAVIORAL:
            model = "anthropic/claude-3.5-sonnet"
            params = {"temperature": 0.15, "max_tokens": 1500}

        elif qtype == QuestionType.ML_DATA_SCIENCE:
            model = "openai/gpt-4o"  # Good for math/ML
            params = {"temperature": 0.1, "max_tokens": 2000}

        elif qtype == QuestionType.THEORY:
            model = "openai/gpt-4o-mini"
            params = {"temperature": 0.1, "max_tokens": 1000}

        else:  # GENERAL, DEBUGGING, SQL, PRODUCT
            model = "openai/gpt-4o-mini"
            params = {"temperature": 0.2, "max_tokens": 1500}

        return model, params

    def _default_classification(self) -> QuestionClassification:
        """Return default classification for empty/invalid questions"""
        return QuestionClassification(
            primary_type=QuestionType.GENERAL,
            confidence=0.0,
            tags=[],
            complexity="unknown",
            suggested_model="openai/gpt-4o-mini",
            suggested_params={"temperature": 0.2, "max_tokens": 1500}
        )


# Singleton instance
_classifier = None

def get_classifier() -> QuestionClassifier:
    """Get or create singleton classifier instance"""
    global _classifier
    if _classifier is None:
        _classifier = QuestionClassifier()
    return _classifier


def classify_question(question: str) -> QuestionClassification:
    """
    Convenience function to classify a question.

    Example:
        >>> result = classify_question("Implement a binary search tree")
        >>> print(result.primary_type)  # QuestionType.CODING
        >>> print(result.suggested_model)  # "openai/gpt-4o-mini"
    """
    return get_classifier().classify(question)

def classify_interview_question(question: str) -> Dict[str, object]:
    """Classify a question into resume-aware interview routing metadata."""
    return classify_question(question).to_interview_dict()


if __name__ == "__main__":
    # Test cases
    test_questions = [
        "Implement a function to reverse a linked list",
        "Design a URL shortening service like bit.ly",
        "Tell me about a time you had a conflict with a team member",
        "What is the difference between TCP and UDP?",
        "Write SQL to find the second highest salary",
        "Explain gradient descent and how it's used in neural networks",
        "Debug this code that's throwing a NullPointerException",
        "How would you prioritize features for a new mobile app?",
    ]

    print("=" * 80)
    print("Question Classifier Test Suite")
    print("=" * 80)

    for question in test_questions:
        result = classify_question(question)
        print(f"\n📝 Question: {question}")
        print(f"   Type: {result.primary_type.value} (confidence: {result.confidence:.2f})")
        print(f"   Complexity: {result.complexity}")
        print(f"   Tags: {', '.join(result.tags)}")
        print(f"   Model: {result.suggested_model}")
        print(f"   Params: {result.suggested_params}")
