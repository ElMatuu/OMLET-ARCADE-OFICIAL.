# Security Policy

## Reporting a vulnerability

Do not publish exploit details, credentials, personal data or production tokens in public issues. Report suspected vulnerabilities privately to the repository owner through GitHub's private vulnerability reporting feature when available.

## Development rules

- Never commit secrets, API keys, passwords, signing keys or real user data.
- Use environment variables for local configuration and provide only placeholder values in examples.
- Validate and authorize every server-side operation; never trust client-supplied roles, balances or ownership.
- Apply rate limits, secure session handling, input validation and output encoding before public launch.
- Treat user-generated content and uploaded media as untrusted.

## Current status

PLAYVERSE has working backend foundations for authentication, profiles, social interactions, chat, presence and other features, but it is not production-ready. Do not use real credentials, sensitive personal information or production user data until a documented security review, deployment hardening, backup/restore validation, abuse-response process and real-device acceptance testing have been completed.
