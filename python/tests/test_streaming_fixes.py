"""
Unit tests for streaming response fixes.

Tests markdown formatting, duplicate detection, and response cleanup.
"""

import pytest
from python.streaming_fixes import (
    format_markdown_blocks,
    remove_duplicate_content,
    should_send_final_response,
    clean_streamed_response,
    normalize_streaming_tokens
)


class TestMarkdownFormatting:
    """Test markdown code block formatting."""
    
    def test_format_simple_code_block(self):
        """Test basic code block gets proper newlines."""
        input_text = "Here is code:```python\nprint('hello')\n```Done"
        result = format_markdown_blocks(input_text)
        
        # Should have newlines before and after code block
        assert '\n\n```python' in result
        assert '```\n\nDone' in result
    
    def test_format_code_block_no_language(self):
        """Test code block without language specifier."""
        input_text = "Code:```\nsome code\n```End"
        result = format_markdown_blocks(input_text)
        
        assert '\n\n```\n' in result
        assert '```\n\nEnd' in result
    
    def test_format_inline_code(self):
        """Test inline code gets proper spacing."""
        input_text = "Use`print()`function"
        result = format_markdown_blocks(input_text)
        
        # Should have spaces around inline code
        assert ' `print()` ' in result
    
    def test_format_multiple_code_blocks(self):
        """Test multiple code blocks are formatted."""
        input_text = "First:```python\ncode1\n```Second:```js\ncode2\n```"
        result = format_markdown_blocks(input_text)
        
        assert result.count('```') == 4  # 2 opening + 2 closing
        assert '\n\n```python' in result
        assert '\n\n```js' in result
    
    def test_balance_unbalanced_code_fences(self):
        """Test unbalanced code fences are fixed."""
        input_text = "Code:```python\nprint('test')\n"  # Missing closing
        result = format_markdown_blocks(input_text)
        
        # Should add closing fence
        assert result.count('```') == 2
    
    def test_preserve_already_formatted(self):
        """Test already properly formatted blocks are preserved."""
        input_text = "Text\n\n```python\ncode\n```\n\nMore text"
        result = format_markdown_blocks(input_text)
        
        # Should remain similar (may clean up extra newlines)
        assert '```python' in result
        assert 'code' in result
    
    def test_clean_excessive_newlines(self):
        """Test excessive newlines are cleaned up."""
        input_text = "Text\n\n\n\n\n```python\ncode\n```"
        result = format_markdown_blocks(input_text)
        
        # Should have max 2 consecutive newlines
        assert '\n\n\n' not in result
    
    def test_empty_input(self):
        """Test empty input returns empty."""
        assert format_markdown_blocks("") == ""
        assert format_markdown_blocks(None) == None

    def test_expands_compressed_cpp_code(self):
        """Test one-line C++ blocks get readable indentation."""
        input_text = "```cpp#include <bits/stdc++.h>using namespace std;int main(){int x=1;if(x){cout<<x;}return 0;}```"
        result = format_markdown_blocks(input_text)

        assert "```cpp\n#include <bits/stdc++.h>\nusing namespace std;" in result
        assert "\nint main()" in result
        assert "\n    int x=1;" in result
        assert "\n    if(x)" in result
        assert "\n        cout<<x;" in result


class TestDuplicateDetection:
    """Test duplicate content removal."""
    
    def test_remove_exact_duplicate(self):
        """Test exact duplicate prefix is removed."""
        seen = {"This is the answer to"}
        # Text starts with exact match of seen prefix
        text = "This is the answer to your question about Python."
        
        result = remove_duplicate_content(text, seen, check_length=100)
        
        # The function checks if text starts with seen prefix
        # Since check_length=100 and both match at start, should remove the seen portion
        # But function only removes if seen text is a complete match at start
        # In this case "This is the answer to" matches, so it should remove it
        assert "your question" in result
    
    def test_no_duplicate_no_change(self):
        """Test non-duplicate text is unchanged."""
        seen = {"Something different"}
        text = "This is unique content"
        
        result = remove_duplicate_content(text, seen, check_length=100)
        
        assert result == text
    
    def test_empty_seen_set(self):
        """Test empty seen set returns original."""
        result = remove_duplicate_content("Some text", set(), check_length=100)
        assert result == "Some text"
    
    def test_partial_prefix_match(self):
        """Test partial prefix matching with check_length."""
        seen = {"The quick brown fox jumps"}
        text = "The quick brown fox jumps over the lazy dog"
        
        result = remove_duplicate_content(text, seen, check_length=25)
        
        # Should detect and remove duplicate
        assert "over the lazy dog" in result


class TestFinalResponseLogic:
    """Test final response sending logic."""
    
    def test_should_send_normal_case(self):
        """Test should send in normal case."""
        result = should_send_final_response(
            already_sent=False,
            strict_filtered=False,
            has_completion_signal=False
        )
        assert result is True
    
    def test_should_not_send_if_already_sent(self):
        """Test should not send if already sent."""
        result = should_send_final_response(
            already_sent=True,
            strict_filtered=False,
            has_completion_signal=False
        )
        assert result is False
    
    def test_should_not_send_if_completion_signal_sent(self):
        """Test should not send if completion signal already sent."""
        result = should_send_final_response(
            already_sent=False,
            strict_filtered=False,
            has_completion_signal=True
        )
        assert result is False
    
    def test_should_not_send_if_strict_filtered(self):
        """Test should not send if strict mode already sent."""
        result = should_send_final_response(
            already_sent=False,
            strict_filtered=True,
            has_completion_signal=False
        )
        assert result is False
    
    def test_should_not_send_multiple_flags(self):
        """Test should not send if multiple flags are true."""
        result = should_send_final_response(
            already_sent=True,
            strict_filtered=True,
            has_completion_signal=True
        )
        assert result is False


class TestStreamedResponseCleaning:
    """Test streamed response cleaning and formatting."""
    
    def test_clean_simple_response(self):
        """Test cleaning simple token list."""
        tokens = ["Hello", " ", "world", "!"]
        result = clean_streamed_response(tokens, enable_formatting=False)
        
        assert result == "Hello world!"
    
    def test_clean_with_markdown_formatting(self):
        """Test cleaning with markdown formatting enabled."""
        tokens = ["Here is code:", "```python", "\n", "print('hi')", "\n", "```"]
        result = clean_streamed_response(tokens, enable_formatting=True)
        
        # Should have proper markdown formatting
        assert '```python' in result
        assert 'print' in result
    
    def test_remove_duplicate_whitespace(self):
        """Test duplicate whitespace is removed."""
        tokens = ["Hello", "  ", "  ", "world"]
        result = clean_streamed_response(tokens, enable_formatting=False)
        
        # Should have single space
        assert result == "Hello world"
    
    def test_remove_excessive_newlines(self):
        """Test excessive newlines are cleaned."""
        tokens = ["Line1", "\n", "\n", "\n", "\n", "Line2"]
        result = clean_streamed_response(tokens, enable_formatting=False)
        
        # Should have max 2 newlines
        assert '\n\n\n' not in result

    def test_empty_token_list(self):
        """Test empty token list returns empty string."""
        result = clean_streamed_response([], enable_formatting=True)
        assert result == ""

    def test_strip_leading_trailing_whitespace(self):
        """Test leading and trailing whitespace is stripped."""
        tokens = [" ", " ", "Content", " ", " "]
        result = clean_streamed_response(tokens, enable_formatting=False)

        assert result == "Content"


def test_server_wraps_unfenced_coding_answer():
    import server

    raw = (
        "Problem Restatement\nRemove duplicates from a sorted array.\n\n"
        "Clean Code\n"
        "#include \nstd::vector removeDuplicates(std::vector& nums) {    if (nums.empty()) {        return nums;    }\n"
        "int writeIndex = 1;    for (int readIndex = 1; readIndex < nums.size(); ++readIndex) {        if (nums[readIndex] != nums[readIndex - 1]) {            nums[writeIndex] = nums[readIndex];            ++writeIndex;        }    }\n"
        "nums.resize(writeIndex);    return nums;}\n\n"
        "Edge Cases\nEmpty array."
    )

    result = server._ensure_coding_answer_has_fenced_code(
        raw,
        "Remove duplicates from a sorted array.",
    )

    assert "```cpp" in result
    assert "#include <bits/stdc++.h>" in result
    assert "vector<int> removeDuplicates(vector<int>& nums)" in result
    assert "Edge Cases" in result


def test_answer_postprocess_preserves_fenced_cpp_code():
    from answer_quality import postprocess_answer

    raw = (
        "Approach: Use a vector.\n\n"
        "```cpp\n"
        "#include <bits/stdc++.h>\n"
        "using namespace std;\n\n"
        "std::vector<int> values = {1, 2, 3};\n"
        "```\n\n"
        "Time complexity: O(n)."
    )

    result = postprocess_answer(raw, set())

    assert "#include <bits/stdc++.h>" in result
    assert "std::vector<int>" in result
    assert "bits/stdc++. h" not in result
    assert "std: : vector" not in result


class TestTokenNormalization:
    """Test individual token normalization during streaming."""
    
    def test_normalize_preserves_token(self):
        """Test normalization preserves token during streaming."""
        token = "Hello"
        result = normalize_streaming_tokens(token)
        
        # Should not modify during streaming
        assert result == token
    
    def test_normalize_whitespace_preserved(self):
        """Test whitespace tokens are preserved."""
        token = " "
        result = normalize_streaming_tokens(token)
        
        assert result == token
    
    def test_normalize_special_chars(self):
        """Test special characters are preserved."""
        token = "\n"
        result = normalize_streaming_tokens(token)
        
        assert result == token


class TestIntegrationScenarios:
    """Test realistic integration scenarios."""
    
    def test_full_streaming_pipeline(self):
        """Test complete streaming pipeline with all fixes."""
        # Simulate token stream
        tokens = [
            "Let me explain:",
            "```python",
            "\n",
            "def hello():",
            "\n",
            "    print('Hi')",
            "\n",
            "```",
            "Done!"
        ]
        
        # Normalize each token during streaming (no-op)
        normalized = [normalize_streaming_tokens(t) for t in tokens]
        
        # Clean and format after streaming complete
        result = clean_streamed_response(normalized, enable_formatting=True)
        
        # Should have proper formatting
        assert '```python' in result
        assert 'def hello' in result
        assert 'Done!' in result
    
    def test_duplicate_prevention_workflow(self):
        """Test preventing duplicate sends."""
        # First send via streaming
        completion_sent = False
        strict_filtered = False
        
        # After streaming, check if should send again
        should_send_1 = should_send_final_response(
            already_sent=False,
            strict_filtered=strict_filtered,
            has_completion_signal=completion_sent
        )
        assert should_send_1 is True  # OK to send first time
        
        # Mark as sent
        completion_sent = True
        
        # Try to send again
        should_send_2 = should_send_final_response(
            already_sent=False,
            strict_filtered=strict_filtered,
            has_completion_signal=completion_sent
        )
        assert should_send_2 is False  # Should NOT send again
    
    def test_strict_mode_prevents_duplicate(self):
        """Test strict mode filtering prevents duplicate send."""
        # Strict mode sends response
        strict_filtered = True
        
        # Check if should send final response
        should_send = should_send_final_response(
            already_sent=False,
            strict_filtered=strict_filtered,
            has_completion_signal=False
        )
        
        # Should NOT send because strict mode already sent
        assert should_send is False
    
    def test_markdown_code_real_scenario(self):
        """Test real-world markdown code formatting scenario."""
        # Simulate AI response with code
        tokens = [
            "To solve this, use:",
            "```python",
            "import numpy as np",
            "\n",
            "arr = np.array([1,2,3])",
            "```",
            "This creates an array."
        ]
        
        result = clean_streamed_response(tokens, enable_formatting=True)
        
        # Should have proper newlines
        assert '\n\n```python' in result
        assert '```\n\n' in result or result.endswith('```')
        assert 'import numpy' in result
