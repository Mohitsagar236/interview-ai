import asyncio
import json
import os
import sys

import pytest


sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from question_classifier import classify_interview_question
from streaming_fixes import clean_streamed_response


ABOUT_SELF_QUESTION = "Tell me about yourself."
RESUME_GROUNDED_QUESTION = "Tell me about your internship experience."
PRECISIONPATH_QUESTION = "Explain PrecisionPath AI."
GENERAL_TECHNICAL_QUESTION = "Explain Docker to a beginner."
PROCESS_THREAD_QUESTION = "Difference between process and thread."
BROWSER_FLOW_QUESTION = "What happens when you type google.com in a browser?"
CODING_QUESTION = "Find the largest element in an array."
PALINDROME_QUESTION = "Check if a string is a palindrome."
VIRTUAL_FUNCTION_QUESTION = "Write C++ code to explain virtual functions."
TWO_SUM_QUESTION = "Solve Two Sum."
SYSTEM_DESIGN_QUESTION = "Design WhatsApp."
HALLUCINATION_QUESTION = "Which company did I intern at Microsoft for?"
FIVE_YEARS_QUESTION = "I see you have 5 years of experience. Tell me about it."
LANGUAGES_QUESTION = "Which programming languages do I know?"


def sample_resume_profile():
    return {
        "name": "Avery Candidate",
        "education": ["B.Tech in Computer Science at State University"],
        "skills": {
            "programming_languages": ["Python", "C++"],
            "frameworks": ["React", "FastAPI"],
            "ml_ai": ["scikit-learn"],
            "databases": ["PostgreSQL"],
            "tools": ["Docker"],
        },
        "projects": [
            "PrecisionPath AI: medical imaging analysis platform for CT and MRI diagnostic support.",
            "Built an interview preparation app with OCR and AI answer routing.",
        ],
        "internships": ["Software Engineering Intern at DataWorks building FastAPI services."],
        "achievements": ["Won a campus hackathon for an AI productivity tool."],
        "certifications": [],
        "courses": ["Distributed Systems"],
        "leadership": ["Led a four-person project team."],
    }


def sample_resume_chunks():
    return [
        "Education: B.Tech in Computer Science at State University.",
        "Skills: Python, C++.",
        "Projects: PrecisionPath AI is a medical imaging analysis platform for CT and MRI diagnostic support.",
        "Internships: Software Engineering Intern at DataWorks building FastAPI services.",
    ]


@pytest.mark.parametrize(
    "question,expected_type,needs_resume,needs_general_ai",
    [
        (ABOUT_SELF_QUESTION, "resume_hr", True, False),
        (RESUME_GROUNDED_QUESTION, "resume_specific", True, False),
        (PRECISIONPATH_QUESTION, "resume_specific", True, False),
        (GENERAL_TECHNICAL_QUESTION, "technical", False, True),
        (PROCESS_THREAD_QUESTION, "technical", False, True),
        (BROWSER_FLOW_QUESTION, "technical", False, True),
        (CODING_QUESTION, "coding", False, True),
        (PALINDROME_QUESTION, "coding", False, True),
        (VIRTUAL_FUNCTION_QUESTION, "coding", False, True),
        (TWO_SUM_QUESTION, "coding", False, True),
        (SYSTEM_DESIGN_QUESTION, "system_design", False, True),
        (HALLUCINATION_QUESTION, "unsupported_resume_claim_check", True, False),
        (FIVE_YEARS_QUESTION, "unsupported_resume_claim_check", True, False),
        (LANGUAGES_QUESTION, "resume_specific", True, False),
    ],
)
def test_requirement_13_classifier_routes_named_questions(
    question, expected_type, needs_resume, needs_general_ai
):
    result = classify_interview_question(question)

    assert result == {
        "question_type": expected_type,
        "needs_resume": needs_resume,
        "needs_general_ai": needs_general_ai,
        "confidence": result["confidence"],
    }
    assert 0 <= result["confidence"] <= 100


def test_requirement_13_resume_context_is_only_selected_for_resume_grounded_questions():
    import server

    profile = sample_resume_profile()
    chunks = sample_resume_chunks()

    resume_context = server.build_context(
        RESUME_GROUNDED_QUESTION,
        profile,
        {},
        classify_interview_question(RESUME_GROUNDED_QUESTION)["question_type"],
        resume_chunks=chunks,
    )

    assert resume_context
    assert "Structured resume profile facts" in resume_context[0]
    assert any("DataWorks" in block for block in resume_context)

    for question in [
        GENERAL_TECHNICAL_QUESTION,
        PROCESS_THREAD_QUESTION,
        BROWSER_FLOW_QUESTION,
        CODING_QUESTION,
        PALINDROME_QUESTION,
        VIRTUAL_FUNCTION_QUESTION,
        TWO_SUM_QUESTION,
        SYSTEM_DESIGN_QUESTION,
    ]:
        classification = classify_interview_question(question)
        assert classification["needs_resume"] is False
        assert (
            server.build_context(
                question,
                profile,
                {},
                classification["question_type"],
                resume_chunks=chunks,
            )
            == []
        )


def test_requirement_13_exact_resume_questions_use_only_supported_resume_facts():
    import server

    profile = sample_resume_profile()
    chunks = sample_resume_chunks()

    for question, expected_fact in [
        (ABOUT_SELF_QUESTION, "State University"),
        (RESUME_GROUNDED_QUESTION, "DataWorks"),
        (PRECISIONPATH_QUESTION, "PrecisionPath AI"),
        (LANGUAGES_QUESTION, "Python"),
    ]:
        classification = classify_interview_question(question)
        context = server.build_context(
            question,
            profile,
            {},
            classification["question_type"],
            resume_chunks=chunks,
        )
        joined_context = "\n".join(context)
        assert expected_fact in joined_context
        assert "Microsoft" not in joined_context
        assert "5 years" not in joined_context
        assert "300%" not in joined_context

    language_context = "\n".join(
        server.build_context(
            LANGUAGES_QUESTION,
            profile,
            {},
            classify_interview_question(LANGUAGES_QUESTION)["question_type"],
            resume_chunks=chunks,
        )
    )
    assert "C++" in language_context
    assert "Java" not in language_context


def test_requirement_13_claim_check_context_and_prompt_refuse_missing_resume_facts():
    import server

    profile = sample_resume_profile()
    chunks = ["Internships: Software Engineering Intern at DataWorks building FastAPI services."]

    classification = classify_interview_question(HALLUCINATION_QUESTION)
    context = server.build_context(
        HALLUCINATION_QUESTION,
        profile,
        {},
        classification["question_type"],
        resume_chunks=chunks,
    )

    assert context[0] == "Claim check result: the requested claim was not found in the available resume facts."

    system, user = server._build_interview_prompt(
        HALLUCINATION_QUESTION,
        context,
        classification["question_type"],
    )

    assert "Search only the provided resume facts/context" in system
    assert "Never invent missing experience" in system
    assert "not found in the resume context" in user
    assert "DataWorks" in user
    assert "Microsoft" in user


def test_requirement_13_experience_duration_claim_is_not_verified_without_resume_support():
    import server

    classification = classify_interview_question(FIVE_YEARS_QUESTION)
    context = server.build_context(
        FIVE_YEARS_QUESTION,
        sample_resume_profile(),
        {},
        classification["question_type"],
        resume_chunks=sample_resume_chunks(),
    )

    assert context[0] == "Claim check result: the requested claim was not found in the available resume facts."
    system, user = server._build_interview_prompt(
        FIVE_YEARS_QUESTION,
        context,
        classification["question_type"],
    )
    assert "Never invent missing experience" in system
    assert "not found in the resume context" in user


def test_requirement_13_prompt_contracts_for_resume_technical_coding_and_system_design():
    import server

    resume_system, resume_user = server._build_interview_prompt(
        RESUME_GROUNDED_QUESTION,
        ["Internships: Software Engineering Intern at DataWorks building FastAPI services."],
        "resume_specific",
    )
    assert "first person" in resume_system
    assert "using only supported resume facts" in resume_user
    assert "Relevant candidate context" in resume_user

    technical_system, technical_user = server._build_interview_prompt(
        GENERAL_TECHNICAL_QUESTION,
        [],
        "technical",
    )
    assert "Do not use resume context unless" in technical_system
    assert technical_user.startswith(f"Technical interview question: {GENERAL_TECHNICAL_QUESTION}")

    browser_system, browser_user = server._build_interview_prompt(
        BROWSER_FLOW_QUESTION,
        [],
        "technical",
    )
    assert "Do not use resume context unless" in browser_system
    assert "DNS" in browser_user
    assert "TCP/TLS" in browser_user
    assert "HTTP request/response" in browser_user
    assert "browser rendering" in browser_user

    for question in [CODING_QUESTION, PALINDROME_QUESTION, TWO_SUM_QUESTION]:
        coding_system, coding_user = server._build_interview_prompt(
            question,
            [],
            "coding",
        )
        assert "Do not use resume context" in coding_system
        assert "Always use fenced markdown code blocks with a language tag" in coding_system
        assert "fenced markdown block tagged `cpp`" in coding_user
        assert "The code must compile and must not be compressed into one line" in coding_user
        assert "Problem restatement" in coding_user
        assert "Time complexity" in coding_user
        assert "Space complexity" in coding_user

    virtual_system, virtual_user = server._build_interview_prompt(
        VIRTUAL_FUNCTION_QUESTION,
        [],
        "coding",
    )
    assert "Do not use resume context" in virtual_system
    assert "fenced markdown block tagged `cpp`" in virtual_user
    assert "required headers" in virtual_user
    assert "pointer, reference, or smart pointer" in virtual_user

    design_system, design_user = server._build_interview_prompt(
        SYSTEM_DESIGN_QUESTION,
        [],
        "system_design",
    )
    assert "Do not use resume context unless explicitly requested" in design_system
    assert "persistent WebSocket connections" in design_user
    assert "queues" in design_user
    assert "media storage" in design_user
    assert "database schema" in design_user
    assert "horizontal scaling" in design_user
    assert "end-to-end encryption" in design_user

    instagram_system, instagram_user = server._build_interview_prompt(
        "Design Instagram Stories.",
        [],
        "system_design",
    )
    assert "Do not use resume context unless explicitly requested" in instagram_system
    assert "WhatsApp" not in instagram_user
    assert "group chat handling" not in instagram_user
    assert "Signal Protocol" not in instagram_user
    assert "actual product in the question" in instagram_user

    notification_system, notification_user = server._build_interview_prompt(
        "Design a notification system so that it scales.",
        [],
        "system_design",
    )
    assert "Do not use resume context unless explicitly requested" in notification_system
    assert "group chat handling" not in notification_user
    assert "end-to-end encryption" not in notification_user
    assert "actual product in the question" in notification_user


def test_requirement_13_interview_answer_style_avoids_coaching_labels_by_default():
    import server

    system, user = server._build_interview_prompt(
        ABOUT_SELF_QUESTION,
        ["Name: Avery Candidate", "Education: B.Tech in Computer Science at State University"],
        "resume_hr",
        coaching_mode=False,
    )
    combined = f"{system}\n{user}"

    assert "first person" in combined
    assert "direct interview answer" in combined
    for banned in [
        "Key phrases to use",
        "Suggested answer structure",
        "Actionable talking points",
        "Suggested Key Phrases",
    ]:
        assert banned not in combined


def test_requirement_13_formatting_helper_expands_compressed_coding_answer():
    tokens = [
        "Approach: scan once.",
        "```cpp",
        "#include <bits/stdc++.h>using namespace std;int largest(vector<int>& a){int best=a[0];for(int x:a){best=max(best,x);}return best;}",
        "```",
        "Time: O(n). Space: O(1).",
    ]

    result = clean_streamed_response(tokens, enable_formatting=True)

    assert result.count("```") == 2
    assert "```cpp\n#include <bits/stdc++.h>\nusing namespace std;" in result
    assert "\nint largest" in result
    assert "\n    int best=a[0];" in result
    assert "\n    for(int x:a)" in result
    assert "Time: O(n). Space: O(1)." in result
    assert "\n\n\n" not in result


def test_requirement_13_provider_errors_are_sanitized():
    import server

    raw = "[ERROR: Groq rate_limit_exceeded status 429 {\"debug\":\"provider payload\"}]"
    safe = server.sanitize_provider_error_text(raw)

    assert safe != raw
    assert "[ERROR" not in safe
    assert "Groq" not in safe
    assert "rate_limit_exceeded" not in safe
    assert "429" not in safe


def test_requirement_13_question_classified_debug_message_contract(monkeypatch):
    import server

    events = []

    async def fake_ensure_ai_initialized():
        server.ai_initialized = True

    async def fake_generate_ai_response(messages):
        assert messages[0]["role"] == "system"
        assert messages[-1]["role"] == "user"
        yield "Docker packages applications with dependencies into portable containers."

    async def capture_broadcast(message, session_id=None):
        events.append(("async", message, session_id))

    def capture_broadcast_sync(message, session_id=None):
        events.append(("sync", message, session_id))

    monkeypatch.setattr(server, "ai_initialized", True)
    monkeypatch.setattr(server, "ensure_ai_initialized", fake_ensure_ai_initialized)
    monkeypatch.setattr(server, "generate_ai_response", fake_generate_ai_response)
    monkeypatch.setattr(server, "broadcast", capture_broadcast)
    monkeypatch.setattr(server, "broadcast_sync", capture_broadcast_sync)
    monkeypatch.setenv("ENABLE_MODEL_ROUTING", "false")
    monkeypatch.setenv("ENABLE_DUPLICATE_DETECTION", "false")
    monkeypatch.setenv("ENABLE_POSTPROCESSING", "false")
    monkeypatch.setenv("ENABLE_ENHANCED_CONFIDENCE", "false")
    monkeypatch.setenv("ENABLE_CONFIDENCE_SCORING", "false")
    monkeypatch.setenv("AUTO_RETRY_LOW_CONFIDENCE", "false")

    asyncio.run(
        server.stream_llm(
            "",
            GENERAL_TECHNICAL_QUESTION,
            out_type="coach",
            mode="coach",
            context_type="transcription",
            session_id="req13",
        )
    )

    classified = next(message for _, message, _ in events if message["type"] == "question_classified")
    assert classified["data"]["question_type"] == "technical"
    assert classified["data"]["needs_resume"] is False
    assert classified["data"]["needs_general_ai"] is True
    assert {
        "question_type",
        "needs_resume",
        "needs_general_ai",
        "confidence",
        "legacy_question_type",
        "legacy_confidence",
        "complexity",
        "suggested_model",
        "tags",
    }.issubset(classified["data"])

    reset = next(
        message
        for kind, message, _ in events
        if kind == "sync" and message["type"] == "coach" and message.get("reset")
    )
    assert reset["text"] == ""
    assert reset["contextType"] == "transcription"
    assert "Interview Question" in reset["contextLabel"]

    completion_messages = [
        message
        for _, message, _ in events
        if message["type"] == "coach" and message.get("complete") is True
    ]
    assert len(completion_messages) == 1

    text_messages = [
        message["text"]
        for _, message, _ in events
        if message["type"] == "coach" and message.get("text")
    ]
    assert text_messages == ["Docker packages applications with dependencies into portable containers."]


def test_requirement_13_broadcast_helpers_mirror_text_to_data(monkeypatch):
    import server

    sent = []

    class FakeWebSocket:
        async def send(self, payload):
            sent.append(json.loads(payload))

    async def run_broadcast_checks():
        server.ui_clients["req13-broadcast"] = FakeWebSocket()
        try:
            await server.broadcast({"type": "coach", "text": "hello"}, session_id="req13-broadcast")
            server.broadcast_sync({"type": "coach", "text": "world"}, session_id="req13-broadcast")
            await asyncio.sleep(0)
        finally:
            server.ui_clients.pop("req13-broadcast", None)

    asyncio.run(run_broadcast_checks())

    assert sent == [
        {"type": "coach", "text": "hello", "data": "hello"},
        {"type": "coach", "text": "world", "data": "world"},
    ]


def test_requirement_13_duplicate_auto_coach_suppression_is_silent(monkeypatch):
    import server
    import time

    events = []

    async def capture_broadcast(message, session_id=None):
        events.append((message, session_id))

    monkeypatch.setattr(server, "broadcast", capture_broadcast)
    monkeypatch.setattr(server, "auto_coach_enabled", True)
    monkeypatch.setattr(server, "coach_in_progress", False)
    monkeypatch.setattr(server, "last_coach_question", "")
    monkeypatch.setattr(server, "last_coach_time", 0.0)
    monkeypatch.setattr(server, "partial_text", "Explain Docker?")
    monkeypatch.setattr(server, "extract_last_question", lambda _: "Explain Docker?")
    monkeypatch.setattr(
        server,
        "recent_questions",
        [(server._normalize_question("Explain Docker?"), time.time())],
    )

    asyncio.run(server.maybe_trigger_auto_coach())

    assert events == []
    assert server.coach_in_progress is False
