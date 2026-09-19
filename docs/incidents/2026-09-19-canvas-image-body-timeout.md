# 2026-09-19 Canvas image edit response-body investigation

## Confirmed evidence (Asia/Shanghai)
- Node image-M8hnBULU_9ecvHyxz6D0H -> task 78842fe4-67b9-4afe-b4d4-58ddae4e63ef.
- Node image-pqkuhMFeEckPvu88inGbb -> task 81d9de78-14de-459a-85bd-0189ec7d4830.
- Rabbit channel hr5VKuKJKirZ1-sdRZPY5, gpt-image-2, POST /v1/images/edits.
- Both: 2720x1536, medium, n=1, b64_json, png; one 178008-byte JPEG reference.
- First: 00:05:38 request -> 00:06:14 HTTP 200 application/json response headers (36292ms) -> 00:15:38 internal transport TimeoutError (600001ms).
- Second: 00:06:25 request -> 00:07:10 HTTP 200 application/json headers (44707ms) -> 00:16:25 internal TimeoutError (600000ms).
- Container log at both deadlines: System API proxy response body failed; Image task step deferred with matching task ID.
- Successful comparison e8533665-bbde-43b7-924c-3a7e75059b86: headers 34348ms; internal response 52617ms.

## What is NOT established
HTTP200 headers do not establish successful image generation or full response receipt. Prior diagnostic records cannot distinguish zero-byte wait, partial body stall, incorrect framing or slow transfer. No evidence establishes ID mismatch. No automatic resubmission or timeout change is justified by these facts alone.

## Missing observation repaired
The actual JSON proxy read is instrumented (not a second clone). It preserves byte order and throws the original error. Records first-byte arrival, total bytes, elapsed/idle time, content length/type, complete/error, underlying cause code and whether the request signal was aborted. No body bytes are logged, no per-chunk persistence, no added request deadline/retry. Outside authenticated Canvas trace scopes the original arrayBuffer path is unchanged.

## Tests
Exact byte preservation, original socket error with partial byte count, zero-byte timeout, partial stream stalled until request abort, logger failure isolation. Integration through proxy suite; full suite results recorded in delivery.
