# AI Response Quality

The Interview AI assistant follows ChatGPT-style response principles for high-quality, professional answers.

## Response Principles

### 1. No Instruction Repetition
- Gets straight to the point
- Doesn't repeat the question back
- Avoids preamble like "Sure, I'd be happy to help..."

### 2. Context-Aware Responses
- Considers your resume and background
- Tailors answers to your experience level
- References relevant skills you have

### 3. Proper Formatting
- Uses headings for organization
- Bullet points for lists
- Code blocks for programming answers
- Tables when comparing options

### 4. Complete Coverage
- Never skips parts of questions
- Addresses all sub-questions
- Provides comprehensive answers

### 5. Professional Tone
- Clear and conversational
- Easy to understand
- Appropriate for interview context

---

## Getting Code Answers

The coach mode detects programming help requests.

### Request Examples
```
"Implement a C++ function to merge two sorted linked lists."
"Write C++17 code for Dijkstra's shortest path using a priority queue."
"In C++, implement an LRU cache with O(1) get/put operations."
```

### Tips for Better Code Answers
- Include language name (e.g., "C++", "Python")
- Mention constraints (memory limits, complexity requirements)
- Specify if you want function only: "Function only, no main."
- Request comparisons: "Compare 2 approaches before coding"

### Code Output Includes
- Brief structured explanation
- Key considerations as bullet points
- Fenced code block with syntax highlighting
- Time & Space complexity summary

---

## Model Routing

The system intelligently routes questions to appropriate AI models:

| Question Type | Recommended Model | Why |
|---------------|-------------------|-----|
| Behavioral | GPT-4 | Nuanced human scenarios |
| Technical | Claude/GPT-4 | Deep reasoning |
| Coding | GPT-4/Claude | Code quality |
| Quick facts | GPT-3.5/Groq | Fast responses |

---

## Resume Integration

Your resume is embedded and used for context:

1. **RAG (Retrieval-Augmented Generation)**
   - Resume chunks stored in FAISS
   - Relevant sections retrieved per question
   - Context injected into prompts

2. **Contextual Answers**
   ```
   Question: "Tell me about a project you led"
   → System retrieves project experience from resume
   → AI provides answer referencing YOUR actual projects
   ```

---

## Configuration

### Environment Variables
```bash
# Default model
DEFAULT_LLM=openai/gpt-4o-mini

# Image generation (optional)
ENABLE_IMAGE_GEN=1
OPENAI_API_KEY=sk-...
OPENAI_IMAGE_MODEL=gpt-image-1
```

### Prompt Templates
Located in `config/prompts.yaml` (if using modular prompts).

---

## Image Generation (Experimental)

When questions request visuals (diagram, flowchart, architecture):

1. System detects visualization keywords
2. Generates conceptual illustration via DALL-E
3. Displays inline in chat

### Trigger Keywords
- diagram
- architecture
- flowchart
- timeline
- graph
- wireframe

### Disable
```bash
ENABLE_IMAGE_GEN=0
```
