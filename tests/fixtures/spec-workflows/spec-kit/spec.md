# Feature Specification: Reading session

**Feature Branch**: `001-reading-session`
**Status**: Draft

## User Scenarios & Testing

### User Story 1 - Review a specification (Priority: P1)

A developer reads the plan, follows linked requirements and updates a task.

**Independent Test**: The saved Git diff contains only the intended edit.

### Acceptance Scenarios

1. **Given** a Markdown spec, **When** a heading is selected, **Then** its section is revealed.

## Requirements

- **FR-001**: The editor MUST preserve untouched Markdown bytes.
- **FR-002**: The editor MUST allow [reviewing tasks](tasks.md#phase-1-review).

## Success Criteria

- **SC-001**: A reader can find and complete a task without opening raw source.
