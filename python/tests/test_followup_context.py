import asyncio
import os
import sys


sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _seed_history(server, session_id):
    server.conversation_history[session_id] = {
        "coach": [],
        "assistant": [],
        "chat": [],
        "coach_transcription": [
            {"role": "user", "content": "Explain Docker to a beginner."},
            {"role": "assistant", "content": "Docker packages apps with dependencies into portable containers."},
        ],
    }


def _patch_stream_dependencies(monkeypatch, server, captured):
    async def fake_ensure_ai_initialized():
        server.ai_initialized = True

    async def fake_generate_ai_response(messages):
        captured["messages"] = messages
        yield "Answer with context."

    async def fake_broadcast(message, session_id=None):
        captured.setdefault("events", []).append(("async", message, session_id))

    def fake_broadcast_sync(message, session_id=None):
        captured.setdefault("events", []).append(("sync", message, session_id))

    monkeypatch.setattr(server, "ai_initialized", True)
    monkeypatch.setattr(server, "ensure_ai_initialized", fake_ensure_ai_initialized)
    monkeypatch.setattr(server, "generate_ai_response", fake_generate_ai_response)
    monkeypatch.setattr(server, "broadcast", fake_broadcast)
    monkeypatch.setattr(server, "broadcast_sync", fake_broadcast_sync)
    monkeypatch.setenv("ENABLE_MODEL_ROUTING", "false")
    monkeypatch.setenv("ENABLE_DUPLICATE_DETECTION", "false")
    monkeypatch.setenv("ENABLE_POSTPROCESSING", "false")
    monkeypatch.setenv("ENABLE_ENHANCED_CONFIDENCE", "false")
    monkeypatch.setenv("ENABLE_CONFIDENCE_SCORING", "false")
    monkeypatch.setenv("AUTO_RETRY_LOW_CONFIDENCE", "false")
    monkeypatch.setenv("ISOLATE_CURRENT_QUESTION", "1")
    monkeypatch.setenv("DISABLE_HISTORY_FOR_COACH", "1")
    monkeypatch.setenv("ENABLE_FOLLOWUP_CONTEXT", "1")


def test_followup_question_includes_previous_turn_despite_isolation(monkeypatch):
    import server

    session_id = "followup-includes-history"
    captured = {}
    _seed_history(server, session_id)
    _patch_stream_dependencies(monkeypatch, server, captured)

    try:
        asyncio.run(
            server.stream_llm(
                "",
                "Can you explain it with an example?",
                out_type="coach",
                mode="coach",
                context_type="transcription",
                session_id=session_id,
            )
        )
    finally:
        server.conversation_history.pop(session_id, None)

    messages = captured["messages"]
    prior_contents = "\n".join(message.get("content", "") for message in messages[:-1])
    assert "Explain Docker to a beginner." in prior_contents
    assert "Docker packages apps with dependencies" in prior_contents


def test_standalone_question_stays_isolated_from_previous_turn(monkeypatch):
    import server

    session_id = "followup-standalone-isolated"
    captured = {}
    _seed_history(server, session_id)
    _patch_stream_dependencies(monkeypatch, server, captured)

    try:
        asyncio.run(
            server.stream_llm(
                "",
                "Explain Kubernetes to a beginner.",
                out_type="coach",
                mode="coach",
                context_type="transcription",
                session_id=session_id,
            )
        )
    finally:
        server.conversation_history.pop(session_id, None)

    messages = captured["messages"]
    prior_contents = "\n".join(message.get("content", "") for message in messages[:-1])
    assert "Docker packages apps with dependencies" not in prior_contents


def test_standalone_pronoun_design_question_stays_isolated(monkeypatch):
    import server

    session_id = "followup-pronoun-standalone-isolated"
    captured = {}
    _seed_history(server, session_id)
    _patch_stream_dependencies(monkeypatch, server, captured)

    try:
        asyncio.run(
            server.stream_llm(
                "",
                "Design a notification system so that it scales.",
                out_type="coach",
                mode="coach",
                context_type="transcription",
                session_id=session_id,
            )
        )
    finally:
        server.conversation_history.pop(session_id, None)

    messages = captured["messages"]
    prior_contents = "\n".join(message.get("content", "") for message in messages[:-1])
    assert "Docker packages apps with dependencies" not in prior_contents


def test_lld_short_prompt_is_treated_as_followup():
    import server
    from question_classifier import classify_interview_question

    assert server._is_followup_question("LLD") is True
    assert classify_interview_question("LLD")["question_type"] == "system_design"
