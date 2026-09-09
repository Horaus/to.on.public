# Storyboard Prompt

Create storyboard beats from a scene summary. Each beat must include camera, subject, action, duration, continuity notes, and provider-safe visual constraints.

Treat the scene summary only as story context. Produce separate shot units; never turn the whole scene summary into one image/video instruction. Each shot must declare initial state, one dominant visible action, one material state change at most, and final state. The final state must be a valid initial state for the next shot.

For every short generated shot, return contiguous timed action beats that cover the full duration. Keep action, dialogue, and camera as separate instructions. Use a locked camera by default and at most one motivated move. Do not use generic pan-and-zoom motion.

Attach only the shot's active references while generating its complete keyframe. Object-only, solo dialogue, group interaction, and prop interaction shots must receive different minimal subsets. A character, prop, or setting that exists elsewhere in the scene is not automatically a shot input. Split overloaded actions when necessary.
