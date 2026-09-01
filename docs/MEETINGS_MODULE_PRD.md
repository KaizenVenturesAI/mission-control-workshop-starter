# Optional Meetings Module

Status: reference scaffold

The meetings surface is optional. It should not be configured for a recipient until they provide owned recording, calendar, transcript, storage, retention, and consent requirements.

## Intended Shape

- Ingest approved meeting artifacts from recipient-owned systems.
- Normalize title, time, participants, source provenance, decisions, risks, and action items.
- Require human review before CRM updates or outbound follow-up.
- Preserve audit trails and source permissions.

## Production Decisions

- approved source systems and account owners
- retention policy for raw audio/video/transcripts
- consent and access model
- durable storage provider
- summarization provider and data-use terms
- CRM linkage rules

Provider documentation links are intentionally omitted from this canonical starter. Add recipient-approved integration references inside the client repository only after connector selection.
