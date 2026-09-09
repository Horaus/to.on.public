# Script Adaptation

Adapt a premise, prose source, or brief into a production screenplay whose generated clips form one causal, emotionally legible film. The output is not a list of attractive moments. Every scene changes the situation; every shot inherits and hands off visible state.

## Runtime architecture

- For 30–45 seconds, build a compact arc: hook, orientation, pressure, choice, consequence/payoff. Aim for roughly 5–8 complete provider-sized shots.
- For 45–60 seconds, allow one additional escalation or reaction exchange. Aim for roughly 7–10 shots.
- For 60–90 seconds, give the lead a clear want, at least two pressure turns, a meaningful choice, consequence, and final emotional image. Aim for roughly 9–15 shots.
- Plan on the routed provider duration ladder. A 4/6/8/10-second render unit must contain enough evolving behavior, reaction, or camera progression to earn its full duration.
- Do not stretch a two-second idea across an eight-second shot. Do not fragment one readable action into credit-wasting micro-shots.

## Scene construction

A scene organizes story change; it is never a provider render unit. A scene may contain several shots. Open a new scene for a meaningful change in location, time, objective, central conflict, or resulting story state—not because a duration quota was reached.

Each scene must define:

1. Entry state: who is present, what each character knows/wants, prop ownership/state, geography, light, and emotional pressure inherited from the previous scene.
2. Objective: what the viewpoint character wants before the scene ends.
3. Conflict: the visible obstacle, opposing want, risky choice, or missing information.
4. Escalation: what makes the current tactic fail or become more costly.
5. Dramatic turn: a discovery, reversal, decision, action, or consequence that changes the situation.
6. Exit state: the exact character, information, prop, geography, and emotional state the next scene inherits.

Do not cut to a new scene merely to change the background. Change location/time only when it improves the dramatic progression or is required by the source.

## Shot grammar and continuity

- A shot organizes visible action and is the provider render unit. Define its exact initial state, one dominant action, at most one material state transformation, and exact final state.
- Split a shot when it contains two independent physical transformations. Never ask one generated clip to perform an entire scene's chain of actions.
- Make the final state of Shot N physically compatible with the initial state of Shot N+1. Treat this boundary contract as the source of truth for character, prop, geography, travel direction, light, weather, and damage state.
- Give every shot one dramatic function: establish, pressure, choice, reaction, reveal, consequence, or payoff.
- Start with geography before complex interaction. Preserve the 180-degree line, eyelines, screen direction, entrances/exits, hand and prop ownership, wardrobe, lighting logic, and character positions.
- Record screen direction explicitly: subject position, gaze target, direction of travel, and relevant foreground/background relationship.
- A new shot size or angle must reveal information, increase pressure, expose a choice, or register a consequence. Decorative coverage is not a reason to cut.
- Use wide shots to establish geography or changed spatial stakes; medium shots for blocking, choices, and exchanges; close-ups for new information or reactions that cause the next action; inserts only for causally important props.
- Default to a locked camera. Permit at most one motivated move in a short shot. State the shot size, angle, height/support, move, and dramatic reason.
- End each shot with a handoff: motion, look, sound, line, decision, reveal, or consequence. The next shot must explicitly receive it. Avoid sequences of interchangeable beauty shots.
- Divide the shot into contiguous timed beats covering its full duration. Each beat contains one observable action, camera behavior, speech mode, speaker, line purpose, and exact line or deliberate silence.

## Dialogue system

Choose exactly one speech mode per beat:

- `dialogue`: audible in the story world; another present character could hear it.
- `inner_monologue`: private thought tied to the viewpoint character; other characters cannot hear it.
- `narration`: an external or retrospective voice that compresses context, adds irony, or supplies a point of view the image cannot efficiently show.
- `silent`: behavior, reaction, ambience, or sound effect carries the beat.

For every non-silent beat, name the stable speaker and the line's dramatic purpose: pursue, conceal, challenge, deflect, reveal, decide, reframe, or react. Maintain a voice bible for recurring speakers: vocabulary, sentence length/rhythm, confidence, humor, politeness, emotional defenses, and verbal habits.

Dialogue rules:

- Lines pursue an objective or alter relationship/information state. They are not captions for visible actions.
- Prefer subtext, hesitation, interruption, specific detail, and reaction over exposition.
- Avoid generic fragments such as “Wait!”, “Look!”, “Got it.”, or “Let's go” unless prior context gives the phrase unique meaning.
- Keep words performable within the timed beat. Let an exchange breathe across consecutive shots rather than packing multiple emotional turns into one line.
- Inner monologue reveals conflict, doubt, or a private decision; it must not narrate obvious movement.
- Narration adds compression, framing, contrast, or irony; it must not duplicate dialogue or inner thought.
- The visual sequence must remain understandable with audio off. Audio adds character, causality, emotion, or compressed context.

## Required production assets

- Every story has exactly one primary subject in `characters`, marked `role: main` and `required: true`.
- Create a `main_character` requirement for the primary subject and requirements for recurring supporting subjects, locations, and identity-bearing or story-critical props.
- Every scene declares its complete resolved setting, physical props, visible subject state, and required reference ids. These are generation inputs, not a change list.
- Every production character needs a locked 3:4 identity image and a separate 3:4 detail sheet before storyboard generation.
- `assetDelta` is used only for a visible transformation of an existing character, prop, or location state: a visual variant of the same base requirement. The first scene normally has no delta.
- Every shot declares the smallest complete reference subset needed for its keyframe. Split overloaded action instead of omitting a visible asset.

## Rejection checks

Reject or rewrite a plan when:

- adjacent shots do not share a clear state handoff;
- a character or prop teleports, changes hands/state, or reverses screen direction without setup;
- dialogue can be swapped between characters without changing its voice;
- speech mode or speaker identity is ambiguous;
- narration, thought, and dialogue repeat the same information;
- the camera changes without dramatic motivation;
- a reaction has no triggering action, or an action has no visible consequence;
- the total planned duration, timed beats, and provider render units disagree.
- a shot prompt restates the whole scene or asks for more than one dominant action/state transformation.
