import asyncio
import os
import sys
from types import SimpleNamespace

import pytest


sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def test_process_ocr_image_uses_tesseract_fallback_when_paddle_is_empty(monkeypatch):
    import server

    cached = {}

    class DummyProcessor:
        def __init__(self, config):
            assert config.use_paddle is False
            assert config.clean_text_only is True

        def process(self, image_bytes):
            assert image_bytes == b"screen"
            return "Read from screen"

    monkeypatch.setattr(server, "_has_paddleocr", True)
    monkeypatch.setattr(server, "_has_tesseract_ocr", True)
    monkeypatch.setattr(server, "process_ocr_paddleocr", lambda image_bytes: "")
    monkeypatch.setattr(server, "OCRConfig", lambda: SimpleNamespace())
    monkeypatch.setattr(server, "OCRProcessor", DummyProcessor)
    monkeypatch.setattr(server, "get_cached_ocr", lambda image_bytes: None)
    monkeypatch.setattr(
        server,
        "cache_ocr_result",
        lambda image_bytes, text, engine, time_ms: cached.update(
            {"image_bytes": image_bytes, "text": text, "engine": engine}
        ),
    )

    assert server.process_ocr_image(b"screen") == "Read from screen"
    assert cached == {
        "image_bytes": b"screen",
        "text": "Read from screen",
        "engine": "tesseract",
    }


def test_paddleocr_engine_parses_legacy_ocr_output():
    from paddleocr_engine import PaddleOCREngine

    class LegacyOCR:
        def ocr(self, img_array, cls=False):
            assert cls is False
            return [
                [
                    [[[0, 0], [100, 0], [100, 20], [0, 20]], ("First line", 0.91)],
                    [[[0, 30], [120, 30], [120, 50], [0, 50]], ("Second line", 0.87)],
                ]
            ]

    engine = object.__new__(PaddleOCREngine)
    engine.ocr = LegacyOCR()

    texts, scores, polys = engine._run_predict(None, return_polys=True)

    assert texts == ["First line", "Second line"]
    assert scores == [0.91, 0.87]
    assert polys[0][0] == [0, 0]


def test_ocr_postprocessing_preserves_math_operators():
    from ocr_utils import OCRProcessor

    processor = object.__new__(OCRProcessor)

    assert processor._post_process_text("Question: What is 2 + 2?") == "Question: What is 2 + 2?"
    assert processor._post_process_text("if (a || b) return a | b;") == "if (a || b) return a | b;"
    assert processor._post_process_text("mask |= bit;") == "mask |= bit;"
    assert processor._post_process_text("x <= y && y >= z") == "x <= y && y >= z"


def test_fast_screen_provider_selects_vision_capable_env_provider(monkeypatch):
    import server

    monkeypatch.setenv("OPENROUTER_API_KEY", "test-openrouter-key")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("FAST_SCREEN_MODEL", raising=False)
    monkeypatch.delenv("VISION_MODEL", raising=False)

    cfg = server._select_fast_screen_provider_config()

    assert cfg.provider == "openrouter"
    assert cfg.api_key == "test-openrouter-key"
    assert cfg.model == "openai/gpt-4o-mini"


def test_fast_screen_provider_rejects_text_only_session_without_env_fallback(monkeypatch):
    import server

    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("FAST_SCREEN_MODEL", raising=False)
    monkeypatch.delenv("VISION_MODEL", raising=False)
    server.session_configs["text-only"] = {
        "ai_provider": "groq",
        "ai_api_key": "test-groq-key",
        "ai_model": "llama-3.3-70b-versatile",
        "ai_base_url": "",
    }

    try:
        assert server._select_fast_screen_provider_config("text-only") is None
    finally:
        server.session_configs.pop("text-only", None)


def test_fast_vision_image_preparation_compresses_large_png():
    import server

    Image = pytest.importorskip("PIL.Image")
    import io

    img = Image.effect_noise((2400, 1400), 80).convert("RGB")
    raw = SimpleNamespace()
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    raw.bytes = buf.getvalue()

    prepared, image_format = server._prepare_image_for_fast_vision(raw.bytes)

    assert image_format == "jpeg"
    assert prepared
    assert len(prepared) < len(raw.bytes)


def test_fast_screen_vision_streams_from_image_without_ocr(monkeypatch):
    import server

    events = []

    class DummyProvider:
        async def generate_stream(self, messages):
            image_url = messages[1]["content"][1]["image_url"]["url"]
            assert image_url.startswith("data:image/")
            yield "Direct screen answer"

    monkeypatch.setattr(
        server,
        "_select_fast_screen_provider_config",
        lambda session_id=None: server.UserProviderConfig(
            provider="openai",
            api_key="test-key",
            model="gpt-4o-mini",
            base_url="https://api.openai.com/v1",
        ),
    )
    monkeypatch.setattr(server, "create_provider_from_config", lambda cfg: DummyProvider())
    monkeypatch.setattr(
        server,
        "broadcast_sync",
        lambda message, session_id=None: events.append((message, session_id)),
    )

    ok = asyncio.run(
        server.stream_vision_to_llm(
            "ignored",
            b"\x89PNG\r\n\x1a\nnot-a-real-png-but-fallback-is-ok",
            session_id="fast-screen",
        )
    )

    assert ok is True
    assert any(message.get("reset") for message, _ in events)
    assert any(message.get("text") == "Direct screen answer" for message, _ in events)
    assert any(message.get("complete") for message, _ in events)


def test_fast_screen_vision_sends_formatted_replacement_for_coding(monkeypatch):
    import server

    events = []
    raw_answer = (
        "Problem Restatement\nRemove duplicates from a sorted array.\n\n"
        "Clean Code\n"
        "#include \nstd::vector removeDuplicates(std::vector& nums) { return nums; }\n\n"
        "Edge Cases\nEmpty array.\n\n"
        "Time Complexity\nO(n).\n\n"
        "Space Complexity\nO(1)."
    )

    class DummyProvider:
        async def generate_stream(self, messages):
            yield raw_answer

    monkeypatch.setattr(
        server,
        "_select_fast_screen_provider_config",
        lambda session_id=None: server.UserProviderConfig(
            provider="openai",
            api_key="test-key",
            model="gpt-4o-mini",
            base_url="https://api.openai.com/v1",
        ),
    )
    monkeypatch.setattr(server, "create_provider_from_config", lambda cfg: DummyProvider())
    monkeypatch.setattr(
        server,
        "broadcast_sync",
        lambda message, session_id=None: events.append((message, session_id)),
    )

    ok = asyncio.run(
        server.stream_vision_to_llm(
            "ignored",
            b"\x89PNG\r\n\x1a\nnot-a-real-png-but-fallback-is-ok",
            user_prompt="Remove duplicates from a sorted array.",
            session_id="fast-screen",
        )
    )

    replacements = [message for message, _ in events if message.get("replace")]
    assert ok is True
    assert replacements
    assert "```" not in replacements[-1]["text"]
    assert "#include\nstd::vector removeDuplicates(std::vector& nums)" in replacements[-1]["text"]
    assert "vector<int> removeDuplicates(vector<int>& nums)" not in replacements[-1]["text"]
    assert any(message.get("complete") for message, _ in events)


def test_resume_name_extraction_does_not_use_section_header():
    import server

    text = """
SCHOLASTIC ACHIEVEMENTS
B.Tech Engineering Science, IIT Hyderabad
TECHNICAL SKILLS
Python, C++, TypeScript
"""

    profile = server.extract_structured_resume_profile(text)

    assert profile["name"] == ""


def test_resume_name_extraction_skips_common_resume_headers():
    import server

    text = """
Core Competencies
Python Java React
Career Objective
To build reliable AI systems.
"""

    profile = server.extract_structured_resume_profile(text)

    assert profile["name"] == ""
