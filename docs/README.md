# The OSIRIS wiki

What each page is for, and when you would want it. A wiki is not a set of
pages; it is a set of pages and a way in.

## If you are deploying it

| Page | What it answers |
|------|-----------------|
| [../BUILD.md](../BUILD.md) | How do I build each client, the database and the migrations, and what is the first run? |
| [../DOCKER.md](../DOCKER.md) | How do I self-host it, what do the two probes mean, and which keys does the code actually read? |
| [../CI_CD_SETUP.md](../CI_CD_SETUP.md) | What does the pipeline do, which secrets does it need, and how does a release get made? |
| [../SECURITY.md](../SECURITY.md) | How do I report a vulnerability, and what is expected of an operator? |

## If you are operating it

| Page | What it answers |
|------|-----------------|
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | It is broken. What broke, and what do I do? |
| [../DOCKER.md](../DOCKER.md#the-two-probes) | Is this instance able to serve? What is the registry doing? |
| [LICENSES.md](LICENSES.md) | What do the sources' terms oblige me to, and what is share-alike? |

## If you are changing it

| Page | What it answers |
|------|-----------------|
| [ADDING-A-TOOL.md](ADDING-A-TOOL.md) | How do I add a tool, and what must every tool have? |
| [../GOAL.md](../GOAL.md) | What is this project for, what are the rules it follows, and where does the work stand? |
| [../PROGRESS.md](../PROGRESS.md) | What has been done, and what is verified against what? |
| [GAP-ANALYSIS.md](GAP-ANALYSIS.md) | Which of the plan's security claims does the code actually meet? |
| [RELEASE-DOCS.md](RELEASE-DOCS.md) | How is a release built and verified? |

## If you are deciding what to build next

| Page | What it answers |
|------|-----------------|
| [ROADMAP.md](ROADMAP.md) | What is next, and what was considered and rejected? |
| [../PROGRESS.md](../PROGRESS.md) | What is left, and what is the highest-value thing remaining? |

## The rules the pages keep coming back to

They are in [../GOAL.md](../GOAL.md), and they are worth reading before
changing anything:

- **Deny by default.** A capability that is not on a tool's allowlist is
  refused before anything runs.
- **Never trust the client.** State, tenant and identity are decided on
  the server.
- **Validate at every boundary.** An imported report, a decoded frame
  and an upstream response are all untrusted.
- **Record the source.** A finding that cannot name where it came from
  cannot be cleared for redistribution.
- **Fail closed, and audit the decision.** Every allow and every deny.

## The pages

Every page here is held to the code by a test: a page that names a file
that has moved, or that forgets a part of the platform a tool needs,
fails the build. A document that drifts is worse than no document,
because it is followed.

- [ADDING-A-TOOL.md](ADDING-A-TOOL.md) — the manifest, the icon, the
  allowlist, the adapter, the dispatcher, the window, the beacon, the
  card, the tests, and the checklist.
- [LICENSES.md](LICENSES.md) — every source the platform reads, its
  licence, what it obliges, and the share-alike warning.
- [ROADMAP.md](ROADMAP.md) — what exists, what is next, and what was
  considered and rejected.
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — real failure modes, each
  reproduced on a checkout, with the cause and the fix.
- [GAP-ANALYSIS.md](GAP-ANALYSIS.md) — every security claim in the
  plan, audited against the code.
- [RELEASE-DOCS.md](RELEASE-DOCS.md) — the release process, and what is
  verified before anything is published.
