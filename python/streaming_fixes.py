"""
Streaming Response Fixes - Helper Functions

This module contains helper functions to fix duplicate streaming and markdown formatting issues.
"""

import re
from typing import Set


COMMON_LANGUAGES = {
    'python', 'javascript', 'typescript', 'java', 'cpp', 'c', 'csharp', 'cs',
    'ruby', 'go', 'rust', 'php', 'swift', 'kotlin', 'scala', 'perl',
    'bash', 'sh', 'powershell', 'sql', 'html', 'css', 'scss', 'less',
    'json', 'xml', 'yaml', 'yml', 'markdown', 'md', 'text', 'txt',
    'jsx', 'tsx', 'vue', 'svelte', 'r', 'matlab', 'lua', 'dart', 'elixir'
}


CODING_SECTION_HEADINGS = (
    ("problem restatement", "Problem restatement"),
    ("approach", "Approach"),
    ("clean code", "Clean code"),
    ("edge cases", "Edge cases"),
    ("time complexity", "Time complexity"),
    ("space complexity", "Space complexity"),
)


def _normalize_coding_section_headings(text: str) -> str:
    """Put known interview answer sections on their own markdown heading lines."""
    if not text:
        return text

    normalized = text
    for raw_heading, canonical_heading in CODING_SECTION_HEADINGS:
        pattern = re.compile(
            rf"(?im)(^|\n)\s*(?:#{{1,3}}\s*)?{re.escape(raw_heading)}\b:?\s*"
        )
        normalized = pattern.sub(lambda m, h=canonical_heading: f"{m.group(1)}## {h}\n", normalized)
    return re.sub(r"\n{3,}", "\n\n", normalized).strip()


def _stash_plain_clean_code_section(text: str) -> tuple[str, list[str]]:
    """Protect plain Clean code content from prose spacing cleanup."""
    normalized = _normalize_coding_section_headings(text)
    code_sections: list[str] = []

    def stash(match: re.Match) -> str:
        placeholder = f"@@PLAIN_CLEAN_CODE_{len(code_sections)}@@"
        code_sections.append((match.group("code") or "").strip("\n"))
        return f"{match.group('heading')}{placeholder}\n\n"

    protected = re.sub(
        r"(?ims)(?P<heading>^## Clean code\s*\n)(?P<code>.*?)(?=^## (?:Edge cases|Time complexity|Space complexity)\b|\Z)",
        stash,
        normalized,
    )
    return protected, code_sections


def _restore_plain_clean_code_section(text: str, code_sections: list[str]) -> str:
    restored = text
    for idx, code in enumerate(code_sections):
        restored = restored.replace(f"@@PLAIN_CLEAN_CODE_{idx}@@", code)
    return restored


def _split_fenced_blocks(text: str) -> list[str]:
    """Split text into normal/code-block chunks, preserving fence chunks."""
    return re.split(r"(```[\s\S]*?```)", text)


def _normalize_outside_code_blocks(text: str) -> str:
    """Normalize prose spacing without touching code indentation."""
    protected_text, code_sections = _stash_plain_clean_code_section(text)
    chunks = _split_fenced_blocks(protected_text)
    normalized = []
    for chunk in chunks:
        if chunk.startswith("```") and chunk.endswith("```"):
            normalized.append(chunk)
            continue

        chunk = re.sub(r' {2,}', ' ', chunk)
        chunk = re.sub(r'\n{3,}', '\n\n', chunk)
        normalized.append(chunk)
    return _restore_plain_clean_code_section(''.join(normalized), code_sections)


def _normalize_markdown_spacing(text: str) -> str:
    """Improve markdown readability while leaving code blocks untouched."""
    protected_text, code_sections = _stash_plain_clean_code_section(text)
    chunks = _split_fenced_blocks(protected_text)
    normalized = []
    for chunk in chunks:
        if chunk.startswith("```") and chunk.endswith("```"):
            normalized.append(chunk)
            continue

        chunk = chunk.replace("â€¢", "-").replace("•", "-")
        chunk = re.sub(r"([^\n])\s+(#{1,3}\s+)", r"\1\n\n\2", chunk)
        chunk = re.sub(r"([.:])\s+(\d+\.\s+)", r"\1\n\n\2", chunk)
        chunk = re.sub(r"([:])\s+([-*]\s+)", r"\1\n\2", chunk)
        chunk = re.sub(r"(?m)^\s*[-*]\s+", "- ", chunk)
        chunk = re.sub(r"(?m)^\s*(\d+)\.\s+", r"\1. ", chunk)
        chunk = re.sub(r"\n{3,}", "\n\n", chunk)
        normalized.append(chunk)
    return _restore_plain_clean_code_section(''.join(normalized), code_sections)


def _format_code_block(lang: str, code: str) -> str:
    """Preserve code content exactly; do not auto-format generated code."""
    if code is None:
        return code
    return code.lstrip("\n")


def format_markdown_blocks(response: str) -> str:
    """
    Automatically format markdown code blocks with proper newlines.
    
    Uses a simple splitting approach to avoid regex issues.
    
    Args:
        response: The raw response text
    
    Returns:
        Formatted response with proper markdown
    """
    if not response:
        return response
    
    # Split on ``` to process code blocks
    parts = response.split('```')
    
    if len(parts) <= 1:
        # No code blocks found - just fix inline code spacing
        formatted = response
        # Handle inline code spacing (single backticks)
        formatted = re.sub(r'([^\s`])(`[^`]+`)([^\s`])', r'\1 \2 \3', formatted)
        formatted = _normalize_outside_code_blocks(formatted)
        formatted = _normalize_markdown_spacing(formatted)
        return formatted.strip()
    
    # Reconstruct with proper formatting
    result_parts = []
    for i, part in enumerate(parts):
        if i == 0:
            # Text before first ```
            result_parts.append(part.rstrip())
        elif i % 2 == 1:
            # Inside code block (odd index): language + code
            # Format: ```language\ncode
            part = part.lstrip('\n')  # Remove leading newlines
            if part and part[0].isalpha():
                # Has language specifier
                # Find end of language name (stop at first non-alnum)
                lang_end = 0
                for j, ch in enumerate(part):
                    if not ch.isalnum():
                        lang_end = j
                        break
                
                if lang_end > 0:
                    # Found a non-alnum character
                    potential_lang = part[:lang_end].lower()
                    
                    # Check if this matches or STARTS WITH a known language
                    matched_lang = None
                    if potential_lang in COMMON_LANGUAGES:
                        # Exact match
                        matched_lang = potential_lang
                    else:
                        # Check if it starts with a known language (e.g., "pythonimport" starts with "python")
                        for lang_name in sorted(COMMON_LANGUAGES, key=len, reverse=True):
                            if potential_lang.startswith(lang_name):
                                matched_lang = lang_name
                                break
                    
                    if matched_lang:
                        # Use the matched language
                        lang = part[:len(matched_lang)]
                        code = part[len(matched_lang):]
                        code = _format_code_block(lang, code)
                        result_parts.append(f"\n\n```{lang}\n{code}")
                    elif lang_end <= 15:
                        # Short enough to be a language (but not recognized), use it anyway
                        lang = part[:lang_end]
                        code = part[lang_end:]
                        code = _format_code_block(lang, code)
                        result_parts.append(f"\n\n```{lang}\n{code}")
                    else:
                        # Too long, probably not a language
                        result_parts.append(f"\n\n```\n{part}")
                else:
                    # No non-alnum found - entire part is alphanumeric
                    # Check first few chars against known languages
                    potential_lang = part[:15].lower()
                    matched_lang = None
                    for lang_name in COMMON_LANGUAGES:
                        if potential_lang.startswith(lang_name):
                            matched_lang = lang_name
                            break
                    
                    if matched_lang:
                        # Found a match! Extract language and code
                        lang_len = len(matched_lang)
                        lang = part[:lang_len]
                        code = part[lang_len:]
                        code = _format_code_block(lang, code)
                        result_parts.append(f"\n\n```{lang}\n{code}")
                    else:
                        # No match - treat as no language specifier
                        result_parts.append(f"\n\n```\n{part}")
            else:
                # No language specifier
                result_parts.append(f"\n\n```\n{part}")
        else:
            # After code block (even index, not first): closing and next text
            # Ensure closing ``` has newline before, and spacing after
            result_parts.append(f"\n```\n\n{part.lstrip()}")
    
    formatted = ''.join(result_parts)
    
    # Clean up prose spacing without touching code indentation.
    formatted = _normalize_outside_code_blocks(formatted)
    
    # Handle inline code spacing (single backticks not part of code blocks)
    # Match: (non-space)(backtick...backtick)(non-space)
    # Only if backticks are not preceded or followed by another backtick
    formatted = re.sub(r'([^\s`])(`[^`]+`)([^\s`])', r'\1 \2 \3', formatted)
    
    # Balance fences if needed
    code_fences = formatted.count('```')
    if code_fences % 2 != 0:
        formatted += '\n```\n'
    
    formatted = _normalize_markdown_spacing(formatted)
    return formatted.strip()


def remove_duplicate_content(text: str, seen_prefixes: Set[str], check_length: int = 100) -> str:
    """
    Remove duplicate content that may have been sent twice during streaming.
    
    Args:
        text: The full text to check
        seen_prefixes: Set of already-seen text prefixes
        check_length: How many characters to check at start
    
    Returns:
        Text with duplicates removed
    """
    if not text or not seen_prefixes:
        return text
    
    # Check if start of text matches any seen prefix
    text_start = text[:min(check_length, len(text))].strip()
    
    for prefix in seen_prefixes:
        prefix_clean = prefix[:min(check_length, len(prefix))].strip()
        
        # Check if this prefix matches the start of the text
        if text_start == prefix_clean and len(prefix) < len(text):
            # Found duplicate - remove the prefix portion
            # Find where the prefix ends in the original text
            remaining = text[len(prefix):].lstrip()
            return remaining
    
    return text


def should_send_final_response(
    already_sent: bool,
    strict_filtered: bool,
    has_completion_signal: bool
) -> bool:
    """
    Determine if final response should be sent to avoid duplicates.
    
    Args:
        already_sent: Whether response was already sent
        strict_filtered: Whether strict mode filtering was applied
        has_completion_signal: Whether completion signal was already sent
    
    Returns:
        True if should send final response, False otherwise
    """
    # Don't send if already sent in any form
    if already_sent or has_completion_signal:
        return False
    
    # Don't send again if strict filtering already sent it
    if strict_filtered:
        return False
    
    return True


def clean_streamed_response(collected_tokens: list, enable_formatting: bool = True) -> str:
    """
    Clean and format the final streamed response.
    
    This is called ONCE after all tokens are collected, not during streaming.
    
    Args:
        collected_tokens: List of all streamed tokens
        enable_formatting: Whether to apply markdown formatting
    
    Returns:
        Cleaned and formatted response text
    """
    # Combine all tokens
    full_text = ''.join(collected_tokens)
    
    if not full_text:
        return ""
    
    # Apply markdown formatting if enabled
    if enable_formatting:
        full_text = format_markdown_blocks(full_text)
    else:
        full_text = _normalize_outside_code_blocks(full_text)
    
    return full_text.strip()


def normalize_streaming_tokens(token: str) -> str:
    """
    Normalize individual tokens during streaming to prevent formatting issues.
    
    This is called for EACH token during streaming, before broadcasting.
    
    Args:
        token: Individual token from LLM
    
    Returns:
        Normalized token
    """
    # Don't modify the token during streaming - let it flow naturally
    # Formatting happens AFTER all tokens are collected
    return token
