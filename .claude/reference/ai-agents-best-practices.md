# AI Agents Best Practices

A guide for building autonomous agents (like the "Gallery Agent") within RawDrive.

---

## 1. Agent Architecture

### ReAct Pattern (Reasoning + Action)
RawDrive agents follow the ReAct loop:
1.  **Thought:** Analyze the user request.
2.  **Plan:** Decide which MCP Tool to call.
3.  **Action:** Execute the tool (e.g., `search_photos`).
4.  **Observation:** Read the tool output.
5.  **Response:** Synthesize final answer or repeat.

### State Management
Agents are stateless by default, but conversations have state.
*   **Conversation History:** Store the last N turns in Redis.
*   **Memory:** Isolate memory by `session_id` and `user_id`. Do NOT leak context between sessions.

---

## 2. Tool Usage Strategy

### Granularity
*   **Atomic Tools:** `get_gallery_details`, `update_cover_photo`, `list_photos`.
*   **Avoid "God Tools":** Don't create a `manage_gallery` tool that does everything. It confuses the LLM.

### Error Handling
If a tool fails, the Agent should self-correct.
*   *Tool Output:* `Error: Gallery ID not found.`
*   *Agent Thought:* "I used the wrong ID. I should list galleries first to find the correct ID."

---

## 3. Human-in-the-Loop (HITL)

### Critical Actions
Agents must **never** perform destructive actions (Delete, Refund, Bulk Email) without explicit user confirmation.
1.  Agent proposes action: `{"tool": "delete_gallery", "args": {...}}`
2.  UI renders "Confirm?" button.
3.  User clicks "Yes".
4.  System executes tool.

---

## 4. System Prompts

### Persona
"You are the RawDrive Gallery Assistant. You help photographers manage their business. You differ from a generic AI because you have access to their real data."

### Guardrails
*   **Tone:** Professional, helpful, concise.
*   **Safety:** Do not output PII found in images unless explicitly asked.
*   **Scope:** Refuse to answer questions unrelated to photography/business (e.g., "Write a poem about Trump").

---

## 5. Evaluation (Evals)

### Deterministic Tests
*   "Create a gallery named X" -> Verify DB record exists.

### LLM-as-a-Judge
*   Use a stronger model (Gemini Pro/Ultra) to grade the Agent's response trace.
*   Metrics: Accuracy, Tone, Tool Efficiency (did it loop unnecessarily?).

---

## 6. Deployment

### Streaming
Agents take time (5-30s).
*   **UI:** Must stream "thoughts" (e.g., "Searching for photos...", "Updating cover...") to keep user engaged.
*   **Mechanism:** Server-Sent Events (SSE) emitting partial tokens.
