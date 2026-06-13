# Release Process Report — DocumentServer (#145)

## Summary

The proposed process is well-reasoned. Rather than restructuring it, this report answers the three open questions, surfaces one internal contradiction worth resolving, and incorporates feedback from the community discussion.

---

## One Internal Contradiction Worth Resolving

The prose says: *"build a release candidate 2 days before the final."*
The example table shows: `Week 1: 9.3.2-rc.1 → Week 2: 9.3.2` — a full 7 days.

Recommendation: **commit to 1 week** (matching the example). Two days leaves almost no runway for CI + container builds + a manual smoke test.

---

## Open Questions

### 1. Does the beta/RC split make sense?

**No — drop the beta stage.** As raised in discussion: in this context beta and RC signal the same thing. The semantic distinction has value when downstream API consumers need to know "API is frozen now" — but for a closely coordinated team, that's communicated directly. The added stage creates process overhead without a clear payoff.

**Recommended pre-release model for feature releases:**

```
Week 1: 9.4.0-rc.1   (feature-complete; community testing begins)
Week 3: 9.4.0-rc.2   (fixes only; final stabilisation)
Week 5: 9.4.0
```

RC has one clear meaning: feature-complete, only regression and data-loss fixes land from here.

### 2. Do we freeze merges?

**No global freeze — release happens on a branch.** As confirmed in discussion, the branch-based model achieves stability without stalling unrelated work:

1. Cut `release/9.4` from `main` at rc.1
2. `main` continues normal development
3. Fixes reach the release branch via cherry-pick or targeted PR — no direct commits
4. Only critical fixes land on the release branch; each requires two reviewer approvals

No impact on normal team flow.

### 3. How do we handle QA?

The current placeholder (`_to be decided_`) is the biggest gap — it's the one item that can block a tag indefinitely if undefined. The simplest model that actually gets executed:

**Patch release QA (~30 min):**
- [ ] CI green on release branch — no exceptions, ever
- [ ] Core flow verified: open file → edit → save → export
- [ ] No open P0/P1 issues in the release milestone
- [ ] Sign-off: *Tested by: _____ | Date: _____*

**Feature release QA (extends patch gate):**
- [ ] Tested on latest Chrome + Firefox
- [ ] Mobile: iOS Safari + Android Chrome (open + basic edit)
- [ ] CHANGELOG reviewed and accurate

The sign-off line makes QA a named human commitment rather than a checkbox that silently passes.

---

## Release Captain / Co-Pilot

Proposed in discussion and worth adopting from the start. For each release, nominate:

- **Captain** — owns the release end-to-end: drives the checklist, signs off QA, tags the release
- **Co-pilot** — assists if the captain is blocked; shadow-learns the process

Rotate the role across the team. This ensures:

- No single person holds all the release knowledge
- The checklist stays accurate — whoever runs it next will find and fix gaps
- The process becomes well-documented enough to automate (a checklist five different people have executed is far easier to script than one only one person has ever run)

Add to the PR template:

```
- [ ] Release captain: @_____
- [ ] Release co-pilot: @_____
```

---

## PR Template Updates

The existing template is good. Three additions complete it:

1. **Release preparation**: add captain/co-pilot assignment lines (above)
2. **Release preparation**: add `- [ ] Confirm merge window: critical-fix-only from rc.1`
3. **QA**: replace the placeholder with the tiered checklist above

---

## Automation Roadmap

Starting manual is the right call — the first release will expose gaps no spec can anticipate.

| Phase | What |
|-------|------|
| **Now** | PR template + stage definition + captain/co-pilot rotation — all manual |
| **Next** | GitHub Action: auto-create release PR with checklist when `release/x.y` branch is pushed |
| **Later** | Auto version bump on schedule; auto-tag on release PR merge |

---

## Summary of Recommendations

| Topic | Recommendation |
|-------|---------------|
| Prose/table contradiction | Commit to 1-week RC window (not 2 days) |
| Beta/RC split | Drop beta; use RC only (`rc.1 → rc.2 → final`) |
| Merge freeze | Release branch only; `main` keeps moving |
| QA gate | Replace placeholder with tiered checklist + named sign-off |
| Release ownership | Captain/co-pilot rotation per release |
| Automation | Manual first; automate release PR creation next |
