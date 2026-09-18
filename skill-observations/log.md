# Skill Observation Log

Status key: OPEN = pending review; ACTIONED / DECLINED include a resolution date.

### Observation 1: Bound document reads before design work

**Status:** OPEN
**Date:** 2026-09-18
**Session context:** Repository review followed by a three-direction visual decision gate.
**Skill:** task-observer
**Type:** open-source
**Phase/Area:** Usage efficiency

**Issue:** Combining several large specification reads caused output truncation and repeated reads, consuming a substantial share of the available usage before the visual deliverable.
**Suggested improvement:** Inventory sizes first, read the authoritative scope in bounded chunks, and use heading-guided sections for deeper context documents. Avoid wrapping long command output in serialized result objects.
**Principle:** Bound each retrieval to the decision it supports and the tool's actual output budget.
