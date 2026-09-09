# Short Drama Video

Technical production contract. Combine it with `narrative-performance` for the creative/content layer; do not copy either skill document into a provider prompt.

## story

- Build one dramatic question around a lead with a specific want, a visible obstacle, escalating pressure, a meaningful choice, and a consequence caused by that choice.
- Treat hook, context, pressure, choice, action, and payoff as narrative functions, not mandatory scene boundaries. Keep continuous time, place, objective, and pressure in the same scene.
- Give recurring characters distinct voices through worldview, vocabulary, rhythm, directness, humor, and emotional defense. Dialogue must pursue, conceal, challenge, reveal, decide, reframe, or react; it must not caption visible movement.
- Prefer specific behavior, subtext, interruption, hesitation, and consequential reactions over generic explanatory lines. The sequence must remain understandable without audio.
- Make each character's choices and reactions arise from a distinct worldview and emotional defense. The final image should pay off a prior choice rather than merely stop the action.

## prompt

- Design provider-neutral coverage only after the screenplay is locked. Each shot owns one necessary setup, pressure, choice, action, reaction, reveal, consequence, or payoff.
- Give every screenplay action, dialogue and sound cue one cross-type `sequenceOrder`, `semanticRole`, and explicit hard dependencies. A refusal depends on its proposal, an answer on its question, a reaction on its trigger, and a consequence on its cause. Never recover this ordering later inside a provider prompt.
- Treat cue IDs and dependency edges as immutable compiler input. Split coverage by cue reference without rewriting exact dialogue, speaker ownership, event meaning or causal order.
- Split discovery, deliberation, physical manipulation, dialogue turn, and consequence when they cannot read as one continuous action. Never compress an entire scene into one provider render.
- Author exact opening state, one dramatic function, one dominant visible action, at most one material state transformation, motivated camera, performable speech, contiguous timed beats, and exact final handoff.
- Treat each generated clip as one continuous camera setup. Never encode a cut, shot/reverse-shot, alternating angles, or a second framing inside the same provider render.
- Give each action cue exactly one owner shot and exactly one timed action beat. Carry earlier action cue IDs as completed state; forbid later shots from staging, previewing, or repeating their final effect.
- Derive requested duration from active content before fitting the provider duration ladder. A simple physical action without dialogue normally occupies no more than 3.5 seconds; fill a longer provider clip with causal setup, listener reaction, or a cuttable aftermath, never slowed or repeated action.
- Let speech and physical business overlap when neither cue depends on the other. Serialize them only when a declared dependency requires the viewer to hear or see one first.
- Treat a provider slot as capture capacity, not automatic edit duration. Mark any unavoidable residual tail as cuttable and end the edit at the authored active-content boundary.
- Keep structured shot fields concise and non-redundant. Budget dialogue to fit its authored duration and assign one explicit delivery.
- Treat scene prose, story function, dramatic purpose, entity tables, reference manifests, provider settings, and this skill text as authoring or validation data—not runtime video-prompt prose.
- Compile one shot contract into one concise prompt. The approved keyframe carries identity, wardrobe, setting, composition, lighting, geography, and opening prop placement.
- A runtime prompt contains only the exact opening action state when needed, dominant action, performance/timing, camera, exact spoken line and delivery, final handoff, and a short no-invention constraint.

## keyframe

- Encode the exact opening state: visible cast, identity, wardrobe, composition, geography, gaze, prop ownership, lighting, screen direction, and the instant before the dominant action begins.
- Attach the smallest complete reference subset needed for that frame. Do not include an off-screen character or unrelated scene asset.
- Generate one clean frame only. Dialogue, timing, later actions, consequences, subtitles, speech bubbles, and runtime provider settings do not belong in the image.

## video

- The video compiler, not the skill markdown, turns approved structured shot fields into provider-neutral runtime instructions.
- Use one continuous setup, one dominant action, at most one material transformation, one motivated camera move at most, exact speech delivery, and a cuttable final state.
- Creative specificity must already exist in authored performance, camera, pacing, and dialogue fields. Do not compensate for basic writing by appending general style prose to the provider prompt.

## review

- Review the assembled sequence, not isolated clips. Reject identity breaks, spatial discontinuity, unexplained prop/hand changes, unmotivated camera changes, speech ambiguity, missing cause/reaction, or clips that cannot inherit and hand off state.
- Reject repeated action→pause→line timing shapes across different dramatic functions, excessive residual holds, and escalation that changes dialogue pressure without increasing visual pressure or coverage.
- Block a sequence when a response precedes its trigger, a result precedes its cause, or a required viewer-information cue appears after the decision that depends on it. Return the failure to screenplay or shot compilation; do not repair it in provider compilation.
- Confirm dialogue belongs to its speaker, visual storytelling works with audio muted, and audio adds character, causality, emotion, or useful compression rather than repeating the image.
