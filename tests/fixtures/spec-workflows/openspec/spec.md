# Reading capability

## ADDED Requirements

### Requirement: Preserve source

The system SHALL preserve unedited Markdown source.

#### Scenario: Reviewing a change

- **WHEN** a reader updates a task
- **THEN** unrelated source bytes remain unchanged

## MODIFIED Requirements

### Requirement: Follow related documents

The system SHALL support [relative task links](tasks.md#1-review).
