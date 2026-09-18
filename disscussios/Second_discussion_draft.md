# Second Discussion Draft — AI Controls, Automation, Storage, NAS Transition, and Multi-Platform Publishing

> **Status: Discussion record — not final architecture**
>
> This document preserves the second major architecture discussion for the Communication Department Working Hub.
>
> Nothing in this document should be treated as an agreed implementation specification yet. We are still discussing tradeoffs, policies, technical limits, security, workflow behavior, infrastructure, and MVP boundaries.

---

# 1. AI and Automation Should Be Administratively Controlled

AI and automation should not simply exist as permanently enabled features.

A central principle should be:

> **Admin and Manager users should be able to control how much AI and automation the system is allowed to use.**

The control model could be hierarchical:

```text
ADMIN POLICY
     ↓
MANAGER / TEAM POLICY
     ↓
WORKFLOW POLICY
     ↓
INDIVIDUAL ACTION
```

A lower level can be more restrictive than the level above it, but should not be able to grant itself permissions that the higher level has disabled.

Example:

```text
AI FEATURES
─────────────────────────────

AI globally enabled              ON
Content writing assistant        ON
Email drafting                   ON
Analytics summaries              ON
Automatic classification        ON

AI ACTIONS
─────────────────────────────

Allow AI to modify content       ON
Allow AI to create tasks         ON
Allow AI to send email           OFF
Allow AI to publish externally   OFF

AUTOMATION
─────────────────────────────

Automation engine                ON
Scheduled publishing             ON
Automatic reminders              ON
Automatic task creation          ON
Automatic external publishing    OFF
```

This is more useful than a single global ON/OFF switch.

---

# 2. Automation Trust Levels

A useful internal concept may be to define levels of automation.

```text
0 — Disabled

1 — Assist
    AI suggests actions.
    A human performs every action.

2 — Prepare
    AI prepares drafts/actions.
    A human confirms execution.

3 — Trusted Internal Automation
    AI and automations may perform low-risk internal actions.

4 — Approved External Automation
    Explicitly authorized external actions may execute automatically.
```

Examples:

## Level 1

> “This email appears to be a media request. Would you like me to create a task?”

## Level 2

> “I created a proposed task. Confirm?”

## Level 3

The system automatically creates and categorizes the internal task.

Higher-risk actions such as:

- Publishing publicly
- Sending official external email
- Approving content
- Deleting important media
- Modifying sensitive configuration

may remain human-controlled even if other automation is enabled.

---

# 3. Automation Rules Should Have Individual Controls

Every automation should also have its own status and audit information.

Example:

```text
AUTOMATION

"When content is approved → schedule publication"

Status:       ● Enabled

Owner:        Communications Manager
Created:      14 Sep 2026

Last run:     Successful
Next run:     —
Runs:         83
Failures:     2

[Disable]
```

This makes automation visible and reversible.

---

# 4. Initial Storage Architecture: Vercel + Supabase

The project can begin without a NAS.

A practical early architecture is:

```text
                 USERS
                   │
                   ▼
          ┌─────────────────┐
          │     VERCEL      │
          │                 │
          │ Next.js / Web   │
          │ API / UI        │
          └────────┬────────┘
                   │
                   ▼
        ┌─────────────────────┐
        │      SUPABASE       │
        │                     │
        │ Auth                │
        │ PostgreSQL          │
        │ Realtime            │
        │ Storage             │
        └─────────────────────┘
```

The important design decision is that large media should upload **directly from the browser to object storage**, rather than being proxied through the main web application.

Conceptually:

```text
User uploads large video
        ↓
Browser
        ↓
Object Storage
        ↓
Upload completes
        ↓
Database records metadata
```

This keeps the application server from becoming a bottleneck for large files.

---

# 5. Why Supabase Storage Fits the First Version

A storage system for this project needs more than simple file saving.

The platform will eventually require:

- Upload
- Download
- Move
- Copy
- Delete
- Controlled access
- Temporary links
- Large-file upload
- Version management
- Preview delivery
- File metadata
- Search relationships
- Work-item relationships

Supabase Storage is a reasonable early choice because the storage permissions can live close to the same user, role, database, and authorization model used by the rest of the application.

The first version can therefore remain relatively simple:

```text
VERCEL
Application

SUPABASE
├── Authentication
├── Database
├── Realtime
└── Storage
```

Introducing multiple storage providers too early should be avoided unless there is a clear need.

---

# 6. Storage vs. Application Features

It is important to distinguish what the storage provider does from what our application does.

## Storage Layer

```text
UPLOAD
DOWNLOAD
COPY
MOVE
DELETE
PERMISSIONS
DELIVERY
```

## Application Layer

```text
PREVIEW
VERSION HISTORY
TAGS
COMMENTS
APPROVAL
RELATIONSHIPS
SEARCH
USAGE HISTORY
CAMPAIGN ASSOCIATION
WORK ITEM ASSOCIATION
```

Example asset view:

```text
hero-video-v4.mp4

Preview
─────────────────────────
       [ Video Player ]

Version: 4
Size: 1.84 GB

Campaign:
Saudi National Day

Used in:
Instagram Reel
X Post
YouTube

Uploaded:
Ahmed — 14 Sep 2026

Versions
v1
v2
v3
v4 ← current
```

The storage provider holds the file.

The Communication Hub provides the management experience.

---

# 7. File Previewing

The Media Library should eventually provide useful previews.

Examples:

- Images → image preview
- Video → video player
- Audio → audio player
- PDF → PDF viewer
- Documents → metadata and possibly generated previews
- Large creative files → thumbnail / metadata where possible

The user should not have to download a large file merely to understand what it contains.

---

# 8. File Editing

“Edit a file” must be divided into different categories.

## Metadata Editing

Straightforward:

- Filename
- Description
- Tags
- Campaign
- Permissions
- Related work item

## Lightweight Media Editing

Potential future browser tools:

- Crop
- Rotate
- Resize
- Compress
- Simple annotations

These edits should normally create a new file version.

Example:

```text
Original
      ↓
Browser editor
      ↓
New version
      ↓
Storage
```

Version example:

```text
image-v1.jpg
image-v2.jpg
image-v3.jpg
```

rather than silently overwriting the original.

## Professional Creative Editing

Files such as:

```text
.psd
.aep
.prproj
.blend
```

should initially be:

> stored → organized → transferred → versioned → reviewed → approved → archived

The Communication Hub should not attempt to become Photoshop, Premiere, After Effects, or Blender.

---

# 9. Future NAS: UGREEN NASync DXP2800

A future NAS can become a local storage node without requiring the initial software architecture to depend on it.

Conceptually:

```text
                    COMMUNICATION HUB
                            │
             ┌──────────────┴──────────────┐
             │                             │
          CLOUD                          OFFICE
             │                             │
          Vercel                    UGREEN DXP2800
             │                             │
          Supabase                   Local storage
```

The important point is that the NAS should be introduced gradually rather than replacing cloud storage immediately.

---

# 10. Stage 1 — Cloud Only

Initial state:

```text
Vercel
   │
   ↓
Supabase
├── DB
├── Auth
└── Storage
```

Advantages:

- Remote access works immediately
- No office infrastructure dependency
- Faster development
- Easier testing
- Easier deployment
- Simpler first architecture

---

# 11. Stage 2 — Cloud + NAS Backup

When the NAS is added:

```text
                  Cloud Storage
                        │
                        │ periodic sync
                        ▼
                     NAS
```

The NAS can initially become:

- Local backup
- Archive
- Office-access storage
- Secondary copy of important media

This introduces value without forcing an immediate migration.

---

# 12. Stage 3 — Hybrid Storage

A stronger long-term model may be:

```text
                      ASSET SYSTEM
                           │
          ┌────────────────┴────────────────┐
          │                                 │
        CLOUD                              NAS
          │                                 │
Active projects                       Originals
Web previews                          RAW media
Thumbnails                            Old projects
Publishing assets                     Archives
Remote access                         Backups
```

Large original media can live on the NAS while smaller previews or working copies remain accessible through the cloud.

Example:

```text
60 GB camera recording
        ↓
NAS stores original

Generated versions:
400 MB working proxy
30 MB preview
JPEG thumbnail

        ↓
Cloud-accessible application
```

This allows remote users to review media without transferring the full original file.

---

# 13. Storage Abstraction Should Exist From Day One

One of the most important architectural decisions is:

> **The application should not assume that every file lives in Supabase.**

A generic Asset model could include:

```text
Asset

id
filename
mime_type
size
checksum

storage_provider
storage_key

preview_provider
preview_key

version
owner
campaign_id
work_item_id
```

Example now:

```text
storage_provider = SUPABASE
storage_key = media/8821/video.mp4
```

Example later:

```text
storage_provider = NAS
storage_key = /campaigns/2027/ramadan/video.mp4
```

The rest of the system continues to refer to the same asset.

The UI should not need to know where the physical file is stored.

---

# 14. Storage Provider Interface

The application should conceptually ask a storage service for the file rather than hard-coding one provider everywhere.

Example concept:

```text
AssetService.get(assetId)
```

The service then resolves whether the object is stored in:

- Supabase
- NAS
- Future S3-compatible provider
- Archive storage
- Temporary publishing storage

This makes the transition to hybrid infrastructure significantly easier.

---

# 15. Hybrid Publishing Storage

A NAS should not necessarily be exposed directly to the public internet.

For external publishing, a possible workflow is:

```text
NAS
 │
 │ approved asset
 ▼
Cloud staging storage
 │
 │ temporary accessible file
 ▼
Social platform API
 │
 ▼
Published
```

The cloud copy can later be expired or deleted depending on policy.

This gives us a useful separation:

```text
NAS
Long-term originals / archives / heavy media

Cloud
Application / previews / active working assets / publishing staging
```

---

# 16. NAS Does Not Replace Backup

A RAID configuration protects against some hardware failure scenarios, but it should not be treated as the only backup strategy.

A healthier future model is:

```text
NAS
+
Cloud
+
Independent backup
```

rather than:

```text
NAS = everything
```

The software architecture should therefore remain independent from any single physical NAS.

---

# 17. One-Button Multi-Platform Publishing

The system should support a single publishing action for approved content.

Example UI:

```text
READY TO PUBLISH
────────────────────────────────────

Saudi National Day Campaign

Approved by:
✓ Manager
✓ Communications Director

Platforms:

✓ X
✓ Instagram
✓ Facebook
✓ LinkedIn
✓ YouTube

Content validation:
✓ X valid
✓ Instagram valid
✓ Facebook valid
✓ LinkedIn valid
✓ YouTube valid


        [ PUBLISH TO 5 CHANNELS ]
```

After clicking:

```text
CONFIRM PUBLICATION

You are about to publish this content to:

X
Instagram
Facebook
LinkedIn
YouTube

This action will publish externally.

        [Cancel]   [Confirm & Publish]
```

The user experiences one button.

Internally, the backend performs multiple platform-specific operations.

---

# 18. Publishing Orchestrator

Internally, the system should use a publishing orchestration layer.

```text
                  PUBLISH BUTTON
                         │
                         ▼
               Publishing Orchestrator
                         │
       ┌─────────┬───────┼────────┬─────────┐
       ▼         ▼       ▼        ▼         ▼
       X      Instagram Facebook LinkedIn YouTube
       │         │       │        │         │
       ▼         ▼       ▼        ▼         ▼
 Platform API adapters / publishing integrations
```

Conceptually:

```text
publishToX()
publishToInstagram()
publishToFacebook()
publishToLinkedIn()
publishToYouTube()
```

The user sees one action.

The backend handles each platform independently.

---

# 19. Platform-Specific Content Variants

One master item should not necessarily force the exact same content onto every channel.

Example:

```text
MASTER CONTENT

Saudi National Day Campaign

        ↓

X
Short text + image

Instagram
Caption + carousel

LinkedIn
Longer professional copy

YouTube
Title + description + video

Facebook
Post + video
```

The Create page may therefore have tabs:

```text
MASTER
[X]
[Instagram]
[LinkedIn]
[Facebook]
[YouTube]
```

AI can help create variants, but humans should be able to review and modify them.

---

# 20. Publication Bundle

A useful concept is a **Publication Bundle**.

One approved communication item can contain multiple platform-specific variants that are approved and published together.

Example:

```text
Publication Bundle #184

Master Work Item:
Saudi National Day Campaign Post

Destinations:
X
Instagram
Facebook
LinkedIn
YouTube
```

This allows one approval workflow while preserving platform differences.

---

# 21. Preflight Check Before Publishing

Before an external publish action becomes available, the system should validate readiness.

Example:

```text
✓ Approved

✓ X character requirements
✓ Instagram media dimensions
✓ LinkedIn media ready
✓ YouTube title present
✓ Connected accounts authenticated
✓ Access tokens valid
✓ Required media uploaded
✓ Publishing permissions available

✓ READY
```

The Publish button can remain disabled while critical validation errors exist.

This should reduce preventable publishing failures.

---

# 22. Partial Publishing Failure

Multi-platform publishing must not be treated like one all-or-nothing database transaction.

Example:

```text
X             ✓ Published
Instagram     ✓ Published
Facebook      ✓ Published
LinkedIn      ✕ Failed
YouTube       ✓ Published
```

If four platforms already published successfully, they should not automatically be republished simply because one platform failed.

Instead, every destination needs its own publication record.

Example:

```text
Publication Bundle #184

X
✓ Published
Remote ID: 89271...

Instagram
✓ Published
Remote ID: 18372...

Facebook
✓ Published

LinkedIn
⚠ Failed
Reason: token expired

YouTube
✓ Published
```

The UI should offer:

```text
[Retry LinkedIn]
```

instead of:

```text
[Publish Everything Again]
```

This prevents duplicate posts.

---

# 23. Publication Data Model

A publication record may eventually contain fields similar to:

```text
work_item_id
publication_bundle_id
platform
account_id
status
remote_post_id
published_at
attempt_count
last_error
```

This becomes the connection point for:

- Publishing status
- Retry logic
- Audit history
- Remote post references
- Analytics collection
- Error monitoring

---

# 24. Manual, Scheduled, and Automated Publishing Should Use the Same Engine

The application should not build three separate publishing systems.

Manual publishing:

```text
Human clicks Publish
        ↓
Publishing Orchestrator
```

Scheduled publishing:

```text
Calendar reaches 18:00
        ↓
Publishing Orchestrator
```

Automation:

```text
Approval completed
        ↓
Publishing Orchestrator
```

Same engine.

Different trigger.

This keeps behavior consistent and reduces duplicate implementation.

---

# 25. AI and Automation Policy Connects to Publishing

Admin policy may contain controls such as:

```text
Publishing Automation

Manual publishing                  ON
Scheduled publishing               ON
Publish immediately after approval OFF
AI-initiated publishing            OFF
```

A manager can make the team more restrictive where allowed.

Employees should not be able to override organizational policy.

---

# 26. Combined Conceptual Architecture

The three discussions — AI controls, storage, and publishing — connect together.

```text
                         ADMIN POLICY
                              │
                AI / AUTOMATION CONTROL
                              │
                              ▼
                       WORK PIPELINE
                              │
                         APPROVAL
                              │
                       PRE-FLIGHT CHECK
                              │
                ┌─────────────┴──────────────┐
                │                            │
             PUBLISH                      STORAGE
                │                            │
       Platform adapters             Storage abstraction
                │                            │
     ┌──────────┼──────────┐        ┌────────┼────────┐
     │          │          │        │        │        │
 Instagram      X      LinkedIn  Supabase   NAS    Future
```

---

# 27. Important Principles Preserved From This Discussion

1. AI use must be controllable.
2. Automation must be controllable.
3. Higher-level policy limits lower-level permissions.
4. Automation should be auditable and reversible.
5. Human confirmation should remain available for risky external actions.
6. The first storage architecture can be cloud-only.
7. Large media should upload directly to storage.
8. Storage should be abstracted from the rest of the application.
9. A future NAS should be introduced gradually.
10. A NAS should not become the only backup.
11. Large originals and web previews may eventually live in different storage tiers.
12. The UI should not care where an asset physically lives.
13. One button should be able to publish approved content to multiple selected channels.
14. Each platform should still have its own publishing adapter.
15. Platform-specific content variants should be supported.
16. Publishing should run a readiness/preflight check.
17. Each platform publication should have an independent status.
18. Failed platforms should be retried individually.
19. Manual, scheduled, and automated publishing should use the same underlying publishing engine.
20. AI should assist workflows without silently gaining authority beyond configured policy.

---

# 28. Still Unresolved

We have **not yet agreed** on:

- Exact AI trust levels
- Which AI actions may run automatically
- Which external actions always require confirmation
- Exact storage limits
- Exact Supabase plan
- Exact NAS role
- NAS sync strategy
- Cloud retention strategy
- File lifecycle rules
- Backup policy
- Disaster recovery policy
- Media transcoding architecture
- Supported social networks in MVP
- API credential ownership
- OAuth/token renewal behavior
- Social platform rate-limit handling
- Publishing retry policy
- Approval rules for multi-platform bundles
- Whether edits after approval always trigger reapproval
- Exact Manager vs Admin authority
- MVP scope
- Final technology stack

This file exists only to preserve the current discussion before we continue into additional blind spots and architecture questions.
