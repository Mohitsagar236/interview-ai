# -*- coding: utf-8 -*-
"""
AI Model Router for Interview AI
Intelligently selects the optimal AI model based on question type, complexity, and context.
"""

import os
import logging
from typing import Dict, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

from question_classifier import classify_question, QuestionType, QuestionClassification

logger = logging.getLogger(__name__)


@dataclass
class UserConfig:
    """Runtime routing config from init_session (BYOK mode)"""
    provider: str = "openai"
    api_key: str = ""
    model: str = ""
    base_url: str = ""
    smart_routing: bool = True
    budget_mode: bool = False
    max_cost: float = 0.10


class ModelTier(str, Enum):
    """Model tiers based on capability and cost"""
    FAST = "fast"  # Ultra-fast, cheaper models
    STANDARD = "standard"  # Balanced performance/cost
    PREMIUM = "premium"  # Highest quality, expensive
    LOCAL = "local"  # Offline local models


@dataclass
class ModelConfig:
    """Configuration for a specific model"""
    name: str
    provider: str  # openai, anthropic, google, x-ai, local
    tier: ModelTier
    cost_per_1m_input: float  # USD
    cost_per_1m_output: float  # USD
    max_tokens: int
    supports_streaming: bool
    best_for: list[QuestionType]
    default_temperature: float
    default_max_tokens: int


class ModelRouter:
    """
    Intelligent model routing system.
    Selects optimal model based on question characteristics and user preferences.
    """
    
    # Model registry with costs and capabilities
    MODELS = {
        # OpenAI Models
        "openai/gpt-4o": ModelConfig(
            name="openai/gpt-4o",
            provider="openai",
            tier=ModelTier.PREMIUM,
            cost_per_1m_input=2.50,
            cost_per_1m_output=10.00,
            max_tokens=128000,
            supports_streaming=True,
            best_for=[QuestionType.CODING, QuestionType.ML_DATA_SCIENCE, QuestionType.MATH],
            default_temperature=0.1,
            default_max_tokens=2500,
        ),
        "openai/gpt-4o-mini": ModelConfig(
            name="openai/gpt-4o-mini",
            provider="openai",
            tier=ModelTier.STANDARD,
            cost_per_1m_input=0.15,
            cost_per_1m_output=0.60,
            max_tokens=128000,
            supports_streaming=True,
            best_for=[QuestionType.THEORY, QuestionType.GENERAL, QuestionType.SQL_DATABASE],
            default_temperature=0.2,
            default_max_tokens=1500,
        ),
        
        # Anthropic Models
        "anthropic/claude-3.5-sonnet": ModelConfig(
            name="anthropic/claude-3.5-sonnet",
            provider="anthropic",
            tier=ModelTier.PREMIUM,
            cost_per_1m_input=3.00,
            cost_per_1m_output=15.00,
            max_tokens=200000,
            supports_streaming=True,
            best_for=[QuestionType.SYSTEM_DESIGN, QuestionType.BEHAVIORAL, QuestionType.PRODUCT],
            default_temperature=0.2,
            default_max_tokens=3000,
        ),
        "anthropic/claude-3-haiku": ModelConfig(
            name="anthropic/claude-3-haiku",
            provider="anthropic",
            tier=ModelTier.FAST,
            cost_per_1m_input=0.25,
            cost_per_1m_output=1.25,
            max_tokens=200000,
            supports_streaming=True,
            best_for=[QuestionType.THEORY, QuestionType.GENERAL],
            default_temperature=0.2,
            default_max_tokens=1500,
        ),
        
        # Google Models
        "google/gemini-flash-1.5": ModelConfig(
            name="google/gemini-flash-1.5",
            provider="google",
            tier=ModelTier.FAST,
            cost_per_1m_input=0.075,
            cost_per_1m_output=0.30,
            max_tokens=1000000,
            supports_streaming=True,
            best_for=[QuestionType.GENERAL, QuestionType.THEORY],
            default_temperature=0.2,
            default_max_tokens=1500,
        ),
        
        # xAI Models
        "x-ai/grok-beta": ModelConfig(
            name="x-ai/grok-beta",
            provider="x-ai",
            tier=ModelTier.PREMIUM,
            cost_per_1m_input=5.00,
            cost_per_1m_output=15.00,
            max_tokens=131072,
            supports_streaming=True,
            best_for=[QuestionType.CODING, QuestionType.DEBUGGING],
            default_temperature=0.1,
            default_max_tokens=2000,
        ),
    }
    
    def __init__(
        self,
        default_model: Optional[str] = None,
        enable_routing: bool = True,
        budget_mode: bool = False,
        max_cost_per_request: float = 0.10,
        user_config: Optional["UserConfig"] = None,
    ):
        """
        Initialize model router.
        If user_config is provided (BYOK mode), routing is disabled and the
        user's configured model is used directly.
        """
        if user_config and user_config.model:
            self.default_model = user_config.model
            self.enable_routing = user_config.smart_routing
            self.budget_mode = user_config.budget_mode
            self.max_cost_per_request = user_config.max_cost
        else:
            self.default_model = default_model or os.getenv("DEFAULT_LLM", "openai/gpt-4o-mini")
            self.enable_routing = enable_routing and os.getenv("ENABLE_MODEL_ROUTING", "true").lower() in ("true", "1", "yes")
            self.budget_mode = budget_mode or os.getenv("BUDGET_MODE", "false").lower() in ("true", "1", "yes")
            self.max_cost_per_request = float(os.getenv("MAX_COST_PER_REQUEST", str(max_cost_per_request)))
        
        logger.info(
            f"Model Router initialized: routing={'enabled' if self.enable_routing else 'disabled'}, "
            f"default={self.default_model}, budget_mode={self.budget_mode}"
        )
    
    def route(
        self,
        question: str,
        context: Optional[Dict] = None,
        user_preference: Optional[str] = None,
    ) -> Tuple[str, Dict]:
        """
        Route question to optimal model with parameters.
        
        Args:
            question: The interview question text
            context: Additional context (resume, company, OCR, etc.)
            user_preference: Optional manual model override
            
        Returns:
            Tuple of (model_name, parameters_dict)
            
        Example:
            >>> router = ModelRouter()
            >>> model, params = router.route("Implement a binary search tree")
            >>> print(model)  # "openai/gpt-4o-mini"
            >>> print(params)  # {"temperature": 0.1, "max_tokens": 1500}
        """
        # User manual override takes precedence
        if user_preference:
            logger.info(f"Using user-selected model: {user_preference}")
            return self._get_model_params(user_preference)
        
        # If routing disabled, use default
        if not self.enable_routing:
            logger.debug(f"Routing disabled, using default: {self.default_model}")
            return self._get_model_params(self.default_model)
        
        # Classify the question
        classification = classify_question(question)
        
        logger.info(
            f"Question classified: type={classification.primary_type.value}, "
            f"confidence={classification.confidence:.2f}, complexity={classification.complexity}"
        )
        
        # Get optimal model based on classification
        selected_model = self._select_model(classification, context)
        
        # Get model-specific parameters
        model_name, params = self._get_model_params(selected_model, classification)
        
        # Cost check
        estimated_cost = self._estimate_cost(model_name, question, params.get("max_tokens", 1500))
        if estimated_cost > self.max_cost_per_request:
            logger.warning(
                f"Estimated cost ${estimated_cost:.4f} exceeds max ${self.max_cost_per_request:.4f}, "
                f"downgrading to cheaper model"
            )
            # Fallback to cheapest model
            model_name = "openai/gpt-4o-mini"
            _, params = self._get_model_params(model_name, classification)
        
        logger.info(f"Routed to model: {model_name} with params: {params}")
        return model_name, params
    
    def _select_model(
        self,
        classification: QuestionClassification,
        context: Optional[Dict] = None
    ) -> str:
        """Select optimal model based on classification and context"""
        
        # If classifier suggested a model, use it
        if classification.suggested_model and classification.confidence > 0.3:
            suggested = classification.suggested_model
            
            # Budget mode: downgrade premium models
            if self.budget_mode:
                if suggested in ["openai/gpt-4o", "anthropic/claude-3.5-sonnet", "x-ai/grok-beta"]:
                    logger.info(f"Budget mode: downgrading {suggested} to gpt-4o-mini")
                    return "openai/gpt-4o-mini"
            
            return suggested
        
        # Fallback: use default
        return self.default_model
    
    def _get_model_params(
        self,
        model_name: str,
        classification: Optional[QuestionClassification] = None
    ) -> Tuple[str, Dict]:
        """Get parameters for a specific model"""
        
        # Get model config if available
        model_config = self.MODELS.get(model_name)
        
        if model_config:
            # Use model-specific defaults
            params = {
                "temperature": model_config.default_temperature,
                "max_tokens": model_config.default_max_tokens,
            }
        else:
            # Unknown model, use conservative defaults
            params = {
                "temperature": 0.2,
                "max_tokens": 1500,
            }
        
        # Override with classification-specific params if available
        if classification and classification.suggested_params:
            params.update(classification.suggested_params)
        
        # Apply environment variable overrides
        if temp := os.getenv("AI_TEMPERATURE"):
            params["temperature"] = float(temp)
        if max_tok := os.getenv("AI_MAX_TOKENS"):
            max_tok_int = int(max_tok)
            if max_tok_int > 0:
                params["max_tokens"] = max_tok_int
        
        return model_name, params
    
    def _estimate_cost(self, model_name: str, question: str, max_tokens: int) -> float:
        """
        Estimate API cost for a request.
        
        Args:
            model_name: Model identifier
            question: Input question (to estimate input tokens)
            max_tokens: Maximum output tokens
            
        Returns:
            Estimated cost in USD
        """
        model_config = self.MODELS.get(model_name)
        if not model_config:
            return 0.0  # Unknown model, can't estimate
        
        # Rough token estimation: ~4 chars per token
        input_tokens = len(question) / 4 + 500  # +500 for system prompt
        output_tokens = max_tokens
        
        cost = (
            (input_tokens / 1_000_000) * model_config.cost_per_1m_input +
            (output_tokens / 1_000_000) * model_config.cost_per_1m_output
        )
        
        return cost
    
    def get_model_info(self, model_name: str) -> Optional[ModelConfig]:
        """Get information about a specific model"""
        return self.MODELS.get(model_name)
    
    def list_available_models(self, tier: Optional[ModelTier] = None) -> list[str]:
        """List all available models, optionally filtered by tier"""
        if tier:
            return [name for name, config in self.MODELS.items() if config.tier == tier]
        return list(self.MODELS.keys())


# Singleton instance
_router = None

def get_router() -> ModelRouter:
    """Get or create singleton router instance"""
    global _router
    if _router is None:
        _router = ModelRouter()
    return _router


def route_model(question: str, context: Optional[Dict] = None) -> Tuple[str, Dict]:
    """
    Convenience function to route a question to optimal model.
    
    Example:
        >>> model, params = route_model("Design a distributed cache")
        >>> print(model)  # "anthropic/claude-3.5-sonnet"
    """
    return get_router().route(question, context)


if __name__ == "__main__":
    # Test cases
    import json
    
    print("=" * 80)
    print("AI Model Router Test Suite")
    print("=" * 80)
    
    test_cases = [
        ("Implement a binary search tree with insert and delete", None),
        ("Design a URL shortening service like bit.ly", None),
        ("Tell me about a time you had a conflict with a team member", None),
        ("What is the difference between TCP and UDP?", None),
        ("Explain gradient descent in machine learning", None),
        ("Write SQL to find employees with salary > average", None),
    ]
    
    router = ModelRouter(enable_routing=True, budget_mode=False)
    
    for question, context in test_cases:
        print(f"\n📝 Question: {question[:60]}...")
        model, params = router.route(question, context)
        config = router.get_model_info(model)
        
        print(f"   → Model: {model}")
        print(f"   → Params: {json.dumps(params, indent=6)}")
        if config:
            cost = router._estimate_cost(model, question, params["max_tokens"])
            print(f"   → Tier: {config.tier.value}")
            print(f"   → Est. Cost: ${cost:.4f}")
    
    print("\n" + "=" * 80)
    print("Budget Mode Test")
    print("=" * 80)
    
    budget_router = ModelRouter(enable_routing=True, budget_mode=True)
    question = "Design Instagram's photo storage system"
    model, params = budget_router.route(question)
    print(f"Question: {question}")
    print(f"Budget Mode Model: {model} (would normally use Claude 3.5 Sonnet)")
