# -*- coding: utf-8 -*-
"""
Answer Quality Enhancement Module

This module provides postprocessing and quality validation for streamed LLM responses:
- Removes duplicate paragraphs
- Balances code fences
- Normalizes punctuation
- Computes confidence scores
- Detects low-quality responses
"""

import re
import hashlib
import time
from typing import Set, Tuple, Dict, Optional
from collections import OrderedDict
import logging

logger = logging.getLogger("answer_quality")


# ============================================================================
# DUPLICATE QUESTION DETECTION (LRU Cache with TTL)
# ============================================================================

class LRUCacheWithTTL:
    """LRU cache that expires entries after a time-to-live period"""
    
    def __init__(self, maxsize: int = 100, ttl_seconds: float = 10.0):
        self.cache: OrderedDict[str, Tuple[str, float]] = OrderedDict()
        self.maxsize = maxsize
        self.ttl_seconds = ttl_seconds
    
    def get(self, key: str) -> Optional[str]:
        """Get value if exists and not expired"""
        if key not in self.cache:
            return None
        
        value, timestamp = self.cache[key]
        
        # Check if expired
        if time.time() - timestamp > self.ttl_seconds:
            del self.cache[key]
            return None
        
        # Move to end (most recently used)
        self.cache.move_to_end(key)
        return value
    
    def set(self, key: str, value: str):
        """Set value with current timestamp"""
        # Remove if exists (to update position)
        if key in self.cache:
            del self.cache[key]
        
        # Add to end
        self.cache[key] = (value, time.time())
        
        # Enforce size limit
        if len(self.cache) > self.maxsize:
            self.cache.popitem(last=False)  # Remove oldest
    
    def clear_expired(self):
        """Remove all expired entries"""
        current_time = time.time()
        expired_keys = [
            k for k, (_, ts) in self.cache.items()
            if current_time - ts > self.ttl_seconds
        ]
        for k in expired_keys:
            del self.cache[k]


# Global cache for recent questions (10-second TTL)
recent_question_hashes = LRUCacheWithTTL(maxsize=100, ttl_seconds=10.0)


def compute_question_hash(question: str) -> str:
    """Compute stable hash for a question (normalized)"""
    # Normalize: lowercase, remove extra spaces, strip
    normalized = re.sub(r'\s+', ' ', question.lower().strip())
    return hashlib.sha256(normalized.encode('utf-8')).hexdigest()[:16]


def check_duplicate_question(question: str) -> Tuple[bool, Optional[str]]:
    """
    Check if question was recently asked.
    
    Returns:
        (is_duplicate, previous_answer_hash)
    """
    recent_question_hashes.clear_expired()  # Clean up expired entries
    
    question_hash = compute_question_hash(question)
    previous_answer = recent_question_hashes.get(question_hash)
    
    if previous_answer:
        logger.info(f"🔄 Duplicate question detected (hash: {question_hash})")
        return True, previous_answer
    
    return False, None


def cache_question_answer(question: str, answer: str):
    """Cache a question-answer pair"""
    question_hash = compute_question_hash(question)
    # Store hash of answer (not full text to save memory)
    answer_hash = hashlib.sha256(answer.encode('utf-8')).hexdigest()[:16]
    recent_question_hashes.set(question_hash, answer_hash)
    logger.info(f"💾 Cached question (hash: {question_hash})")


# ============================================================================
# POSTPROCESSING: CLEAN UP STREAMED ANSWERS
# ============================================================================

def postprocess_answer(text: str, seen_tokens_log: Set[str]) -> str:
    """
    Postprocess streamed answer to remove duplicates and improve quality.
    
    Args:
        text: The full streamed answer
        seen_tokens_log: Set of token prefixes already sent (first ~256 chars)
    
    Returns:
        Cleaned and deduplicated text
    """
    if not text or len(text.strip()) < 10:
        return text
    
    original_length = len(text)
    
    # Step 1: Remove duplicate prefix (if seen in previous chunks)
    if seen_tokens_log:
        # Check first 256 chars against seen tokens
        prefix = text[:256]
        for seen_prefix in seen_tokens_log:
            if text.startswith(seen_prefix):
                text = text[len(seen_prefix):].lstrip()
                logger.info(f"🔄 Removed duplicate prefix ({len(seen_prefix)} chars)")
                break
    
    # Step 2: Remove repeated consecutive paragraphs
    paragraphs = text.split('\n\n')
    unique_paragraphs = []
    prev_para = None
    
    for para in paragraphs:
        para_normalized = re.sub(r'\s+', ' ', para.strip().lower())
        prev_normalized = re.sub(r'\s+', ' ', prev_para.strip().lower()) if prev_para else ""
        
        # Skip if identical to previous paragraph
        if para_normalized and para_normalized != prev_normalized:
            unique_paragraphs.append(para)
            prev_para = para
        elif not para_normalized:  # Keep empty paragraphs for spacing
            unique_paragraphs.append(para)
    
    text = '\n\n'.join(unique_paragraphs)
    
    # Step 3: Remove repeated consecutive sentences within paragraphs
    def dedupe_sentences(paragraph: str) -> str:
        sentences = re.split(r'([.!?]+)', paragraph)
        result = []
        prev_sentence = None
        
        i = 0
        while i < len(sentences):
            sentence = sentences[i].strip()
            punctuation = sentences[i + 1] if i + 1 < len(sentences) else ''
            
            sentence_normalized = re.sub(r'\s+', ' ', sentence.lower())
            prev_normalized = re.sub(r'\s+', ' ', prev_sentence.lower()) if prev_sentence else ""
            
            if sentence_normalized and sentence_normalized != prev_normalized:
                result.append(sentence + punctuation)
                prev_sentence = sentence
            elif not sentence_normalized and punctuation:
                # Add orphaned punctuation to previous sentence
                if result:
                    result[-1] += punctuation
            
            i += 2 if punctuation else 1
        
        return ' '.join(result)
    
    paragraphs = text.split('\n\n')
    text = '\n\n'.join(dedupe_sentences(p) if p.strip() else p for p in paragraphs)
    
    # Step 4: Balance code fences
    code_fence_pattern = r'```(\w*)'
    fences = re.findall(code_fence_pattern, text)
    
    # Count opening fences
    if len(fences) % 2 != 0:
        # Unbalanced - add closing fence
        last_fence_lang = fences[-1] if fences else 'txt'
        text += f'\n```'
        logger.info(f"✅ Balanced code fences (added closing fence)")
    
    # Step 5: Normalize punctuation spacing
    # Remove extra spaces before punctuation
    text = re.sub(r'\s+([,.!?;:])', r'\1', text)
    
    # Ensure single space after punctuation (unless end of string/line)
    text = re.sub(r'([,.!?;:])([^\s\n])', r'\1 \2', text)
    
    # Fix multiple consecutive spaces
    text = re.sub(r' {2,}', ' ', text)
    
    # Step 6: Remove trailing whitespace from lines
    text = '\n'.join(line.rstrip() for line in text.split('\n'))
    
    # Step 7: Clean up excessive newlines (max 2 consecutive)
    text = re.sub(r'\n{3,}', '\n\n', text)
    
    # Step 8: Remove common markdown artifacts and duplicates
    # Remove duplicate heading markers
    text = re.sub(r'(#{1,6})\s*\1+\s*', r'\1 ', text)
    
    # Remove duplicate bullet points
    text = re.sub(r'(^|\n)([-*•])\s*\2+\s*', r'\1\2 ', text)
    
    final_length = len(text)
    if final_length != original_length:
        logger.info(f"📝 Postprocessed answer: {original_length} → {final_length} chars")
    
    return text.strip()


# ============================================================================
# CONFIDENCE SCORING: VALIDATE ANSWER QUALITY
# ============================================================================

def compute_confidence(answer_text: str, question_type: str = "general") -> Tuple[float, str]:
    """
    Compute confidence score for an answer based on quality indicators.
    
    Args:
        answer_text: The generated answer
        question_type: Type of question (coding, behavioral, system_design, etc.)
    
    Returns:
        (confidence_score, confidence_label)
        - confidence_score: 0.0 to 1.0
        - confidence_label: "High", "Medium", or "Low"
    
    Scoring rules:
        - Base score: 0.5
        - +0.15 if reasoning steps present
        - +0.10 if code block for coding questions
        - +0.05 if mentions resume/project context
        - -0.20 if answer length < 200 chars for complex questions
    """
    if not answer_text or len(answer_text.strip()) < 5:
        return 0.0, "Low"
    
    score = 0.5  # Base score
    answer_lower = answer_text.lower()
    answer_length = len(answer_text.strip())
    
    # === POSITIVE INDICATORS ===
    
    # 1. Reasoning steps (+0.15)
    reasoning_keywords = [
        r'\bstep\s+\d+',
        r'\breasoning\b',
        r'\bexplanation\b',
        r'\bfirst[,\s]',
        r'\bsecond[,\s]',
        r'\bthen\b',
        r'\bfinally\b',
        r'\bbecause\b',
        r'\btherefore\b',
        r'\bhowever\b',
        r'\bconsequently\b',
    ]
    
    reasoning_found = sum(1 for kw in reasoning_keywords if re.search(kw, answer_lower))
    if reasoning_found >= 2:
        score += 0.15
        logger.debug(f"  +0.15: Reasoning steps detected ({reasoning_found} keywords)")
    
    # 2. Code block for coding questions (+0.10)
    has_code_block = bool(re.search(r'```[\w]*\n', answer_text))
    is_coding_question = question_type.lower() in ['coding', 'programming', 'algorithm', 'data_structure']
    
    if has_code_block:
        if is_coding_question:
            score += 0.10
            logger.debug(f"  +0.10: Code block present for coding question")
        else:
            score += 0.05  # Still valuable but less critical
            logger.debug(f"  +0.05: Code block present")
    
    # 3. Mentions resume/project context (+0.05)
    context_keywords = [
        r'\bmy (project|experience|role|position|work|resume)\b',
        r'\bin my (previous|current|last)\b',
        r'\bwhen I (worked|developed|built|created)\b',
        r'\bat (company|organization)\b',
        r'\bI (implemented|designed|led|managed)\b',
    ]
    
    context_found = any(re.search(kw, answer_lower) for kw in context_keywords)
    if context_found:
        score += 0.05
        logger.debug(f"  +0.05: Resume/project context mentioned")
    
    # 4. Structured formatting (+0.05)
    has_structure = bool(
        re.search(r'^#{1,3}\s+\w+', answer_text, re.MULTILINE) or  # Headings
        re.search(r'^\d+\.\s+\w+', answer_text, re.MULTILINE) or   # Numbered lists
        re.search(r'^[-*•]\s+\w+', answer_text, re.MULTILINE)      # Bullet points
    )
    if has_structure:
        score += 0.05
        logger.debug(f"  +0.05: Structured formatting detected")
    
    # === NEGATIVE INDICATORS ===
    
    # 1. Too short for complex questions (-0.20)
    complex_question_types = ['system_design', 'behavioral', 'architecture', 'design']
    is_complex = question_type.lower() in complex_question_types or 'design' in question_type.lower()
    
    if answer_length < 200 and is_complex:
        score -= 0.20
        logger.debug(f"  -0.20: Answer too short for complex question ({answer_length} chars)")
    elif answer_length < 100:
        score -= 0.10
        logger.debug(f"  -0.10: Answer very short ({answer_length} chars)")
    
    # 2. Generic deflections (-0.25)
    deflection_patterns = [
        r"I (cannot|can't|don't) (see|access|view|process)",
        r"please provide (more|additional) (context|information|details)",
        r"I need more information to",
        r"could you (clarify|specify|provide more)",
        r"I'm (unable|not able) to (help|assist|answer)",
    ]
    
    deflection_found = any(re.search(pat, answer_lower) for pat in deflection_patterns)
    if deflection_found and answer_length < 300:
        score -= 0.25
        logger.debug(f"  -0.25: Generic deflection detected")
    
    # 3. Incomplete response indicators (-0.15)
    incomplete_patterns = [
        r'\.\.\.+$',           # Trailing ellipsis
        r'```\s*$',            # Unclosed code block
        r'\([^)]*$',           # Unclosed parenthesis
        r'\[[^\]]*$',          # Unclosed bracket
        r'\{[^}]*$',           # Unclosed brace
    ]
    
    incomplete_found = any(re.search(pat, answer_text.strip()) for pat in incomplete_patterns)
    if incomplete_found:
        score -= 0.15
        logger.debug(f"  -0.15: Incomplete response indicators")
    
    # 4. Excessive repetition (-0.15)
    words = answer_text.lower().split()
    if len(words) > 20:
        # Check for repeated 3-grams
        trigrams = [' '.join(words[i:i+3]) for i in range(len(words) - 2)]
        if trigrams:
            most_common_count = max(trigrams.count(t) for t in set(trigrams))
            if most_common_count >= 3:
                score -= 0.15
                logger.debug(f"  -0.15: Excessive repetition detected")
    
    # === CLAMP SCORE TO [0, 1] ===
    score = max(0.0, min(1.0, score))
    
    # === DETERMINE LABEL ===
    if score >= 0.8:
        label = "High"
    elif score >= 0.5:
        label = "Medium"
    else:
        label = "Low"
    
    logger.info(f"📊 Confidence: {score:.2f} ({label}) for {question_type} question ({answer_length} chars)")
    
    return score, label


# ============================================================================
# SEEN TOKENS LOG MANAGEMENT
# ============================================================================

def create_seen_tokens_log(text: str, max_prefix_length: int = 256) -> Set[str]:
    """
    Create a set of seen token prefixes for deduplication.
    
    Args:
        text: The full text to extract prefixes from
        max_prefix_length: Maximum length of each prefix
    
    Returns:
        Set of unique prefixes
    """
    prefixes = set()
    
    # Add full prefix if short enough
    if len(text) <= max_prefix_length:
        prefixes.add(text)
    else:
        # Add sliding window prefixes
        for i in range(0, len(text) - max_prefix_length + 1, max_prefix_length // 2):
            prefix = text[i:i + max_prefix_length]
            prefixes.add(prefix)
    
    return prefixes


def update_seen_tokens_log(seen_log: Set[str], new_text: str, max_prefix_length: int = 256):
    """
    Update seen tokens log with new text.
    
    Args:
        seen_log: Existing set of seen prefixes
        new_text: New text to add
        max_prefix_length: Maximum length of each prefix
    """
    new_prefixes = create_seen_tokens_log(new_text, max_prefix_length)
    seen_log.update(new_prefixes)
