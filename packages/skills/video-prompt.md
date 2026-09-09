# Video Prompt

Build image-to-video prompts for exactly one authored shot, never an entire scene. Use the approved shot keyframe as visual truth. Include only the shot's setting fragment, initial state, one dominant action, one material state change at most, final handoff state, camera, and timed beats. Exclude scene summaries, alternate actions, later consequences, and unrelated scene assets. Keep the final prompt under 3,600 UTF-8 bytes; if it exceeds 4,000 characters or bytes, require a text-provider compaction pass before Flow dispatch.
