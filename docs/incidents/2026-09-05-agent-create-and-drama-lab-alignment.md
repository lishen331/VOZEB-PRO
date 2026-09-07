# Create Agent and Drama Lab: Confirmed Requirements

Date: 2026-09-05  
Status: Confirmed, pending implementation  
Scope: Create Agent and Drama Lab only. Canvas, accounts, roles, and the user system are out of scope.

## Problems

1. Create intelligent mode can plan video when the user explicitly wants an image. The user cannot inspect the invoked Skill, planned output, or final prompt.
2. Drama Lab storyboard extraction failures lack evidence, retry, and recheck actions.
3. Drama Lab active tasks crowd sidebar navigation, fail to appear immediately, and completed/cancelled tasks remain visible.
4. After functional fixes, document how Agent context and historical media references preserve a subject such as the same cat.

## First principle: attachment is not output

Image, video, audio, and text are input media. They do not decide the output. An attached image must never automatically convert a request to image-to-video.

Intelligent mode must first interpret the current semantic intent, then consider inputs, selected Skill capabilities, and model capabilities.

| Input and user intent | Correct task |
| --- | --- |
| Text: generate a cat ecommerce hero image | text-to-image |
| Text: write ecommerce title and selling points | text-to-text |
| Image + text: make this a white-background ecommerce image | image-and-text-to-image |
| Image + text: make a five-second product video | image-and-text-to-video |
| Image only: explain why this image task failed | multimodal understanding to text |
| Video only: explain why this video task failed | multimodal understanding to text |
| Video only: extend it by three seconds | video-to-video |

Image-only and video-only requests can be analysis, diagnosis, explanation, or normal chat. Input modality is context, not an output instruction.

## Skill capability contract

A Skill is not a single image or video output label. It is an allowed capability set. One Skill may support text, image, video, or multiple input/output combinations.

The system must persist and validate input-modality plus output-modality combinations rather than only an image/video tag. An ecommerce Skill may permit:

```ts
[
  { inputs: ["text"], outputs: ["image"] },
  { inputs: ["image", "text"], outputs: ["image"] },
  { inputs: ["text"], outputs: ["video"] },
  { inputs: ["image", "text"], outputs: ["video"] },
  { inputs: ["image", "text"], outputs: ["text"] }
]
```

- User semantics decides the desired output for this request.
- The Skill decides whether that input/output combination is allowed.
- The model decides whether it can execute the combination.
- Attachments provide reference, understanding, or editing input; they do not imply output type.

Current risk: the planner can return `image`, `video`, `audio`, or `text`, but server-side task creation does not enforce a Skill input/output contract. The repair must fail closed on the server, not only depend on frontend wording or planner prompts.

## Intelligent-mode rules

1. Identify semantic intent first: chat/analysis, text, image, video, audio, edit, or continuation.
2. Identify explicit inputs: text, images, video, audio, attachments, and permitted historical assets.
3. Form the candidate task, such as text-to-image, image-and-text-to-image, image-and-text-to-video, video-and-text-to-video, or multimodal-understanding-to-text.
4. Validate the candidate against the selected Skill capability matrix and model capability.
5. Execute only when intent is clear and capability-compatible.
6. When intent is ambiguous, ask whether the user wants text, image, video, or another result. Do not silently submit a generation.
7. When intent, Skill capability, or model capability conflicts, show a confirmation/resolution dialog. Never silently change the deliverable.

Examples:

- User wants video but Skill/model supports only image: offer a compatible Skill/model, remove the incompatible Skill, or cancel. Do not silently generate an image.
- User wants image but planner decides video: reject that plan server-side and show the conflict. Do not queue video.
- A multi-capability Skill supports both image and video: use current user semantics, never its name or existing attachments.

## Create execution transparency

After submission, show a collapsible execution card between the user message and result. It must display:

1. Actually invoked Skill(s).
2. Determined input/output combination, for example `reference image + instruction -> image`.
3. Model.
4. Final prompt summary, with full prompt available for inspection.
5. Actual reference images/history assets sent to the task.
6. Task state, actual error, cancel, retry, and recheck actions.

The picker may clear after send, but the historical message/run must retain actual used Skills. The card exposes auditable decisions and parameters, not internal chain-of-thought.

## Context and subject consistency

Same-subject consistency is neither permanent model memory nor guaranteed behavior. The flow is:

1. The planner receives conversation summary and recent context.
2. With explicit semantic instructions such as continue, same subject, variant, or modify, it may select eligible successful conversation assets.
3. The server resolves the real historical media and sends it to the downstream model as a reference.
4. The model combines the reference with current text, increasing consistency.

The execution card must disclose historical-material reuse and the exact asset. Users can remove it; history must not become invisible input.

## Drama Lab task panel

The sidebar must have two independent scroll areas:

```text
Sidebar
|- Upper area: episode/storyboard navigation (independent scroll)
`- Lower area: running / failed / awaiting-check tasks (independent scroll)
   |- actual state and error
   |- cancel
   |- retry
   `- recheck
```

Rules:

1. After creation succeeds, immediately upsert a task into the current project's feed. Polling reconciles later state only.
2. The active feed shows only running, failed, and awaiting-check items. Completed/cancelled tasks leave it and remain in history.
3. The task area has bounded space and its own scrollbar. Growing tasks must not displace navigation.
4. Cancel uses the Drama Lab workflow's own behavior.
5. Retry resumes a failed Drama Lab workflow step; it must not reuse the generic Create Agent retry API.
6. Recheck synchronizes an existing upstream task ID only. It never submits another generation request.

## Drama Lab storyboard extraction

HTTP 202 proves only that a workflow task was created. It does not prove extraction succeeded. Root cause must come from evidence, never screenshot-based guessing.

```text
target project and episode
-> extract-storyboards request/response
-> persisted workflow task error
-> workflow step/child task error
-> server log
-> upstream model request/response
-> JSON parsing, asset-ID validation, database persistence
```

Extraction requires real in-project `sceneId`, `characterIds`, and `propIds`. No name guessing and no phantom assets.

## Implementation and acceptance order

1. Add Skill multi-capability contracts, pass constraints to the planner, and fail-closed validate task normalization and direct-model paths.
2. Add conflict payloads and the frontend confirmation dialog.
3. Add Create execution-card persistence/display for actual Skill, task, model, prompt summary, and referenced assets.
4. Implement the Drama Lab two-zone scrolling sidebar, instant task insertion, active-task filtering, and dedicated retry/recheck.
5. Obtain actual logs and repair the concrete storyboard-extraction root cause.
6. Verify in real UI: text-to-text, text-to-image, image-and-text-to-image, image-and-text-to-video, video diagnosis, video continuation, ambiguous intent, capability conflict, Drama Lab task creation/failure/retry/recheck/extraction.
7. Write a separate user-facing note for Agent context, Skills, historical-media reuse, and task execution.

## Explicit non-goals

- Do not treat every image/video attachment as a generation request.
- Do not restrict a Skill to one output type because of its name.
- Do not expose model internal reasoning; expose only auditable decisions, parameters, and execution facts.
- Do not use the generic Create Agent retry API for Drama Lab workflows.
- Do not change Canvas, account, role, or user-system behavior.
