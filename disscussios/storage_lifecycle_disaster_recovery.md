# Storage Lifecycle and Disaster Recovery — Communication Department Hub

> **Status: Discussion record — not final storage/recovery specification**
>
> This document preserves the current discussion about storage lifecycle, asset versions, multiple storage locations, backups, NAS usage, snapshots, archive policy, retention, restore procedures, and disaster recovery.
>
> The concepts below are architectural directions only. Exact retention periods, backup destinations, recovery targets, NAS configuration, cloud providers, restore procedures, and production policies are still under discussion.

---

# 1. Storage, Backup, Archive, Sync, Snapshots, RAID, and Trash Are Different

| Concept | Purpose |
|---|---|
| Primary storage | Where the current working file lives |
| Replica / copy | Another copy for availability or access |
| Sync | Keeps locations aligned |
| Snapshot | Point-in-time state for quick rollback |
| Backup | Independent recovery copy |
| Archive | Long-term retained material |
| RAID | Protects against some drive failures |
| Trash / recycle bin | Protects against simple accidental deletion |

Important rule:

> Replication improves availability. Versioning/snapshots improve rollback. Independent backups provide recovery.

These are different protections and should not be treated as interchangeable.

---

# 2. File Lifecycle

A real asset may move through a lifecycle such as:

```text
             UPLOAD
                │
                ▼
          INCOMING
                │
        Validate / Process
                │
                ▼
             ACTIVE
                │
        ┌───────┴────────┐
        │                │
        ▼                ▼
     WORKING          APPROVED
        │                │
        └────────┬───────┘
                 ▼
              RELEASED
                 │
                 ▼
             RETAINED
                 │
          after campaign
                 ▼
              ARCHIVED
                 │
         retention expires
                 ▼
               TRASH
                 │
          retention window
                 ▼
               PURGED
```

User-facing states may be simpler, for example:

```text
Working
Approved
Published
Archived
Trash
```

---

# 3. Asset and File Are Not the Same Thing

One logical asset may have several physical representations.

Example:

```text
ASSET
National Day Hero Photo
       │
       ├── Original
       │      v1
       │
       ├── Edited version
       │      v2
       │
       ├── Instagram derivative
       │
       ├── Web derivative
       │
       └── Thumbnail
```

Potential data concepts:

```text
Asset
AssetVersion
AssetDerivative
```

Users think in terms of logical assets.

Storage holds concrete file versions and derivatives.

---

# 4. One Storage Provider Is Not Enough as a Long-Term Model

A single field such as:

```text
storage_provider
storage_key
```

is useful early, but it becomes too limited once one asset version exists in several places.

A stronger model is:

```text
Asset
   │
   ▼
Asset Version
   │
   ├── Storage Location #1
   │      Supabase
   │
   ├── Storage Location #2
   │      NAS
   │
   └── Storage Location #3
          Backup
```

Possible model:

```text
AssetVersion

id
asset_id
version_number
checksum
size
mime_type
created_at
```

and:

```text
AssetLocation

asset_version_id

provider
location_key

copy_type
status

verified_at
checksum_verified
```

Example:

```text
Asset Version 7

Location A
Provider: Supabase
Type: ACTIVE
Status: VERIFIED

Location B
Provider: NAS
Type: ARCHIVE
Status: VERIFIED

Location C
Provider: Backup
Type: RECOVERY
Status: VERIFIED
```

---

# 5. Authoritative Copies

When multiple copies exist, the system should know which copy is authoritative.

Possible location roles:

```text
PRIMARY
REPLICA
ARCHIVE
BACKUP
DERIVATIVE
```

Example during cloud-only phase:

```text
Original master
Authority: Supabase
```

Later:

```text
Original master
Authority: NAS
```

The logical asset identity does not change.

---

# 6. Cloud-Only Production Still Needs an Independent Backup Strategy

Database backups and media-object backups are separate concerns.

The system contains two broad recovery domains:

```text
APPLICATION STATE
Database

MEDIA STATE
Storage objects
```

Both require recovery plans.

A provider-level database backup should not automatically be assumed to protect the actual uploaded media objects.

---

# 7. Independent Object Backup

The architecture should eventually support exporting/copying storage objects independently.

Conceptually:

```text
                  CLOUD PLATFORM
               ┌──────┴──────┐
               │             │
           Database        Storage
               │             │
               ▼             ▼
          DB Backup      Object Backup
               │             │
               └──────┬──────┘
                      ▼
             Independent Copy
```

The independent copy may later live in:

- another cloud location
- an encrypted external backup
- the NAS
- another off-site destination

---

# 8. Database Recovery and File Recovery Should Be Independent

Example:

```text
12:00
Database says Asset #500 exists

12:05
Asset #500 file deleted accidentally

12:30
Database continues normally
```

Recovering one missing asset should not require rolling the entire database back and losing unrelated work.

The architecture should therefore support restoring individual assets independently.

---

# 9. Point-in-Time Database Recovery Is Mainly for Database Disasters

Typical database-recovery scenarios include:

```text
Bad migration
Accidental table deletion
Application bug corrupts records
Large accidental database update
```

Database recovery and asset recovery should be designed as separate but coordinated systems.

---

# 10. Delete Needs a Lifecycle

Do not immediately remove important media from storage when a user clicks Delete.

Preferred behavior:

```text
Employee clicks Delete
        ↓
Move logical asset to Trash
        ↓
Hidden from normal library
        ↓
Retained for configured period
        ↓
Permanent purge only after policy allows
```

Possible lifecycle:

```text
ACTIVE
  ↓
TRASHED
  ↓
30 / 60 / 90 days
  ↓
PURGE_ELIGIBLE
  ↓
PURGED
```

Exact periods are still undecided.

---

# 11. Archive, Trash, Purge, and Backup Expiry Are Different

## Archive

Keep long-term but remove from active working storage.

## Trash

Deletion intended but still recoverable.

## Purge

Remove from active storage after policy allows.

## Backup Expiry

Old backup copies eventually age out according to backup-retention rules.

These should not be treated as one operation.

---

# 12. Campaign Closeout Can Trigger Archival

Example:

```text
Saudi National Day 2027
Campaign completed
```

Possible closeout workflow:

```text
CAMPAIGN CLOSEOUT
        ↓
Verify final deliverables
        ↓
Verify approved originals
        ↓
Generate checksums
        ↓
Archive originals to NAS
        ↓
Verify NAS copies
        ↓
Keep web previews in cloud
        ↓
Remove unnecessary working copies
```

This ties storage lifecycle to business workflow.

---

# 13. Retention Policies

A campaign or asset class may have a retention policy.

Example:

```text
Campaign:
National Day 2027

Retention policy:
Standard Communications Archive
```

A policy may eventually define:

```text
Working files:
retain X days after campaign

Final approved assets:
retain X years

Published derivatives:
retain X years

Raw footage:
retain X period

Audit metadata:
retain longer
```

Exact durations must come from organizational needs, not guesses.

---

# 14. Permanent / No-Auto-Purge Assets

Some assets may need long-term or permanent preservation.

Examples:

```text
Organization logo masters
Historical campaigns
Major events
Official speeches
Annual reports
Brand templates
Founding material
```

Possible policy:

```text
Retention:
PERMANENT
```

or:

```text
No automatic purge
```

---

# 15. Originals and Derivatives Need Different Protection

Example:

```text
Original 4K footage
50 GB
```

Generated derivatives:

```text
Proxy
700 MB

Web preview
100 MB

Thumbnail
400 KB
```

Potential classes:

```text
ORIGINAL
Must protect strongly

MASTER
Must protect strongly

PUBLISHED OUTPUT
Important

PROXY / PREVIEW
Regeneratable

THUMBNAIL
Regeneratable

TEMPORARY
Disposable
```

Not every derivative requires the same backup strength.

---

# 16. Do Not Overprotect Regeneratable Files

Files such as:

```text
thumbnail.jpg
temporary proxy
AI intermediate file
cache
```

may be regeneratable.

Premium backup capacity should be focused on originals, masters, final outputs, approvals, and other irreplaceable data.

---

# 17. Checksums

Important files should have checksums.

Example:

```text
video001.mov
        ↓
SHA-256 / equivalent checksum
        ↓
Asset Version
```

When copied:

```text
Supabase → NAS
```

verify:

```text
source checksum
=
destination checksum
```

This lets the application distinguish:

```text
Copy completed
```

from:

```text
Copy verified intact
```

---

# 18. Storage Health in the Asset Record

Possible asset view:

```text
STORAGE

Cloud working copy
✓ Available

NAS archive
✓ Verified

Off-site backup
✓ Protected

Last verification
18 Sep 2026
```

Or:

```text
NAS archive
⚠ Verification failed
```

Storage degradation can surface as a Needs Attention item.

---

# 19. NAS Snapshots

A future NAS can provide point-in-time snapshots for rapid rollback.

Conceptually:

```text
UGREEN NAS
     │
    Btrfs
     │
     ├── Live files
     │
     └── Snapshots
```

Snapshots are useful for accidental deletion and unwanted changes.

They do not replace an independent backup.

---

# 20. Snapshots Are Fast Recovery, Not Full Disaster Recovery

Example:

```text
Delete Campaign/
```

Potential recovery:

```text
Open Snapshot
      ↓
Restore previous folder state
```

This can be much faster than restoring hundreds of gigabytes from an off-site backup.

---

# 21. NAS + Snapshots Are Still Not Enough

Scenarios such as:

```text
theft
fire
flood
complete storage-pool failure
ransomware
admin compromise
```

may defeat both live data and local snapshots.

An independent/off-site recovery copy is still needed.

---

# 22. Long-Term Direction: 3-2-1 Style Protection

A useful direction is:

```text
COPY 1
Working / primary

COPY 2
Independent local or alternate storage

COPY 3
Off-site recovery copy
```

Conceptually:

```text
              COMMUNICATION ASSET
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
      CLOUD         NAS       OFF-SITE
     working      archive       backup
```

Exact roles may change over time.

---

# 23. The NAS May Become Primary Production Storage

If the NAS becomes the primary original-media store, it is no longer “the backup.”

It becomes production storage.

Example:

```text
NAS
Primary original media
      │
      ├── local snapshots
      │
      └── independent off-site backup
```

---

# 24. Suggested Transition Stages

## Phase A — Early Development

```text
Supabase DB
Supabase Storage
```

## Phase B — Initial Production

```text
Supabase DB
    +
DB backup strategy

Supabase Storage
    +
independent object backup
```

## Phase C — NAS Arrives

```text
Cloud
  │
  └── NAS replica/archive

NAS:
Btrfs snapshots
```

## Phase D — Mature Hybrid System

```text
Cloud hot tier
NAS original/archive tier
Independent off-site recovery tier
```

with automated verification and tested restores.

---

# 25. Avoid Uncontrolled Two-Way Sync

Unrestricted:

```text
Cloud ↔ NAS
```

creates conflict questions.

Examples:

```text
Cloud:
file deleted

NAS:
file still exists
```

or:

```text
NAS:
file manually replaced

Cloud:
old version
```

A safer design is explicit lifecycle operations.

Examples:

```text
ARCHIVE_TO_NAS
RESTORE_FROM_NAS
```

---

# 26. The Application Should Own Asset Movement

Example:

```text
Employee clicks:
Archive Campaign
```

Then:

```text
Application
      ↓
creates transfer jobs
      ↓
copies files
      ↓
verifies checksums
      ↓
records locations
      ↓
only then changes lifecycle state
```

This keeps application state aligned with physical storage.

---

# 27. Manual NAS Changes Will Still Happen

Even with application-managed movement, people may modify files manually.

A future reconciliation process may compare:

```text
expected NAS state
vs
actual NAS state
```

Possible result:

```text
⚠ Asset 882 expected on NAS but missing.
```

This should detect discrepancies rather than silently rewrite application records.

---

# 28. Recovery Point Objective (RPO)

RPO asks:

> How much recent work can we afford to lose?

Example:

```text
RPO = 24 hours
```

means up to one day's changes may be lost.

```text
RPO = 15 minutes
```

requires much stronger recovery architecture.

Exact targets must be decided before production.

---

# 29. Recovery Time Objective (RTO)

RTO asks:

> How long can the system be unavailable?

Example:

```text
RTO = 24 hours
```

is a very different engineering problem from:

```text
RTO = 30 minutes
```

Cost and complexity should follow business requirements.

---

# 30. Different Data Can Have Different Recovery Priorities

Possible relative priorities:

| Data | Relative Priority |
|---|---|
| User/permission DB | Very high |
| Approval/audit records | Very high |
| Scheduled publications | High |
| Final media masters | High |
| Raw event footage | High |
| Working drafts | Medium |
| Generated thumbnails | Low |
| Caches | Very low |

Recovery policy does not need to be identical for every data class.

---

# 31. Disaster Scenarios

Recovery playbooks should eventually cover scenarios such as:

```text
One employee deleted a file
Whole campaign folder deleted
Database table corrupted
Bad deployment damages data
Social credentials lost
Cloud project unavailable
NAS drive fails
Entire NAS fails
Ransomware encrypts NAS files
Office loses internet
Office equipment stolen/destroyed
Cloud account compromised
Administrator accidentally deletes project
```

---

# 32. Accidental File Deletion Recovery Order

Possible recovery order:

```text
1. Application Trash
        ↓
2. File/version history
        ↓
3. NAS snapshot
        ↓
4. Independent backup
```

Use the fastest and least destructive method first.

---

# 33. Ransomware Recovery

Possible flow:

```text
Detect incident
      ↓
Disconnect/isolate NAS
      ↓
Stop synchronization
      ↓
Pause archive jobs
      ↓
Determine clean recovery point
      ↓
Restore from clean snapshot if safe
      ↓
or independent protected backup
      ↓
Verify restored files
      ↓
Reconnect application
```

Do not allow corrupted/encrypted files to propagate outward during recovery.

---

# 34. Database Recovery

Possible flow:

```text
Pause writes
      ↓
Determine corruption point
      ↓
Select recovery point
      ↓
Restore database
      ↓
Reconcile external systems/jobs
      ↓
Verify assets still correspond
      ↓
Resume service
```

Complete application recovery requires more than restoring Postgres alone.

---

# 35. Database Restore Can Create External-State Conflicts

Example:

```text
18:00
Instagram post published

18:05
Database corrupted

Restore database to 17:55
```

Restored database says:

```text
Publication never happened
```

Reality says:

```text
It did
```

Blindly rerunning the job could create duplicates.

Recovery therefore needs a reconciliation phase.

---

# 36. Recovery Mode

Serious recovery should not immediately resume automation.

Possible mode:

```text
MAINTENANCE / RECOVERY MODE

External publishing       PAUSED
Automation engine         PAUSED
Outbound email            PAUSED
NAS sync                  PAUSED
Users                     READ-ONLY
```

Admin resumes components deliberately after verification.

---

# 37. Restore Order

Possible recovery order:

```text
1. Core infrastructure/configuration

2. Database
   ├── Users
   ├── Permissions
   ├── Work Items
   ├── Approvals
   └── Asset metadata

3. Storage objects

4. Secrets/integrations

5. Background jobs

6. Reconciliation

7. External automation

8. Normal user access
```

The exact runbook will be defined later.

---

# 38. Configuration Backups Matter

Recovery must account for:

```text
environment configuration
OAuth app configuration
webhook settings
storage bucket configuration
RLS policies
database migrations
automation policies
NAS sync configuration
```

Where possible, infrastructure and policy definitions should live in version-controlled code.

---

# 39. Secret Recovery

Recovering data without recovering encryption keys or secret-management configuration may leave integrations unusable.

Critical key material therefore needs its own protected recovery process.

Keys should not simply be stored next to encrypted backups.

---

# 40. Backup Monitoring

Admin should eventually be able to see:

```text
Last successful DB backup
Last successful asset backup
Last NAS snapshot
Last off-site replication
Amount of data protected
Backup age
Backup failures
```

Example:

```text
RECOVERY HEALTH

Database backup
✓ 2h ago

Cloud media backup
✓ 5h ago

NAS snapshot
✓ 47m ago

Off-site backup
⚠ 29h ago

Restore test
✓ 32 days ago
```

Old or failed backups should surface as Needs Attention.

---

# 41. Restore Testing

Principle:

> Backups are assumptions. Tested restores are evidence.

Possible process:

```text
Take backup
      ↓
Restore to isolated test environment
      ↓
Check database
      ↓
Check random assets
      ↓
Verify checksums
      ↓
Record successful recovery test
```

The exact testing frequency should match the importance of the system.

---

# 42. Storage Dashboard

Possible Admin view:

```text
STORAGE OVERVIEW

Cloud Active Assets
1.8 TB

NAS Archive
7.3 TB

Off-site Backup
8.1 TB

────────────────────────────

Protection

Assets with 3 verified copies     82%
Assets with 2 verified copies     16%
Assets with only 1 copy            2% ⚠

────────────────────────────

Recovery

Last DB backup            ✓
Last NAS snapshot         ✓
Last off-site backup      ✓
Last restore test         ✓
```

This provides more operational value than only showing free disk space.

---

# 43. Capacity Planning

The application should eventually track storage growth.

Example:

```text
January   +180 GB
February  +230 GB
March     +410 GB
```

Possible forecast:

```text
Estimated NAS full:
11 months
```

Retention policy and derivative cleanup should feed capacity planning.

---

# 44. Archived Assets Should Remain Searchable

Example:

```text
Campaign
Ramadan 2027

Status:
Archived

Files:
18 archived assets

[Restore / Retrieve]
```

If an asset is not immediately cloud-accessible:

```text
Available in archive.
Request retrieval.
```

This may create:

```text
RESTORE_FROM_ARCHIVE job
```

---

# 45. Tiered Storage

Possible conceptual tiers:

```text
HOT
Immediately available online

WARM
NAS / office storage

COLD
Long-term backup/archive
```

The UI should abstract this complexity.

Example:

```text
File status:
Archived

[Make Available]
```

---

# 46. Publishing Staging Has Its Own Lifecycle

External social platforms may require a temporary accessible URL.

Possible flow:

```text
approved source asset
      ↓
temporary publishing derivative
      ↓
external platform retrieves it
      ↓
publication succeeds
      ↓
temporary staging object expires
```

Originals and final masters remain preserved separately.

---

# 47. Temporary Storage Cleanup

Temporary data may include:

```text
previews
staging uploads
failed exports
temporary ZIPs
AI intermediate files
publishing copies
```

These should support expiration:

```text
TEMPORARY

expires_at:
2026-09-20 18:00
```

Cleanup jobs can remove eligible temporary objects.

---

# 48. Retention Holds

The architecture should leave room for:

```text
DO_NOT_PURGE
```

on assets, campaigns, or records.

Example:

```text
Asset ordinarily expires:
1 Oct

Hold:
ACTIVE
```

Automated cleanup must skip held data.

---

# 49. User Deletion Must Not Delete Organizational Assets

If Ahmed leaves:

```text
Ahmed account archived
```

his files remain.

A useful distinction is:

```text
Created by Ahmed
```

rather than:

```text
Personally owned by Ahmed
```

Organizational work remains owned by the organization.

---

# 50. Disaster Recovery Documentation Must Exist Outside the Hub

If the Hub itself is unavailable, recovery instructions cannot exist only inside it.

A protected external runbook should eventually explain:

```text
Who has authority
Where backups are
How to enter recovery
How to restore
How to verify
Who to contact
How to resume operations
```

Secret values themselves should still be managed securely.

---

# 51. Manual Business-Continuity Fallback

The department must still be able to communicate if the Hub is unavailable.

Possible emergency path:

```text
Hub unavailable
      ↓
Authorized Manager
      ↓
Official platform directly
      ↓
Record action afterward
```

After recovery:

```text
Import/reconcile emergency publication
```

The Communication Hub must not become a single point of operational paralysis.

---

# 52. Conceptual Storage Architecture

```text
                    LOGICAL ASSET
                         │
                    ASSET VERSION
                         │
          ┌──────────────┼──────────────┐
          │              │              │
        CLOUD           NAS        RECOVERY COPY
          │              │              │
      active/hot      archive       independent
      previews        originals       off-site
      staging         snapshots       retained
          │              │              │
          └──────────────┼──────────────┘
                         │
                  Verification Layer
                    Checksums/status
                         │
                         ▼
                   Asset Lifecycle

Incoming
   ↓
Working
   ↓
Approved
   ↓
Released
   ↓
Retained
   ↓
Archived
   ↓
Trash
   ↓
Purged
```

Surrounding controls:

```text
Retention Policies
Backup Policies
Snapshots
Restore Procedures
Recovery Tests
Disaster Runbooks
Needs Attention
```

---

# 53. Key Architectural Changes From This Discussion

Two major changes should be preserved:

## 1. One Asset Version Can Exist in Multiple Storage Locations

The model should not assume only one storage provider.

## 2. Storage Lifecycle and Recovery State Should Be Known by the Application

The Hub should eventually know not only that:

```text
video.mp4 exists
```

but also that:

```text
The approved original exists in cloud storage,
has a checksum-verified archive copy on the NAS,
has an independent recovery copy,
was last verified recently,
and is retained according to policy.
```

That turns the Media Library into a serious asset-management system rather than only a file browser.

---

# 54. Still Unresolved

We still need to decide:

- Exact cloud backup target
- Object backup frequency
- Database backup frequency
- RPO
- RTO
- Retention periods
- Trash duration
- Permanent-retention categories
- NAS filesystem/configuration
- Snapshot schedule
- Off-site backup provider
- Backup encryption
- Recovery-test frequency
- Storage tier rules
- Archive retrieval behavior
- Capacity thresholds
- Retention-hold permissions
- Reconciliation rules for manual NAS changes
- Which data classes receive the strongest protection

This document preserves the storage-lifecycle and disaster-recovery discussion only. It is not yet the final storage or recovery architecture.

___
## The simple architecture

Instead of putting every poster/video/document inside Supabase Storage, we could use:

```
                         COMMUNICATION HUB
                                │
                    ┌───────────┴───────────┐
                    │                       │
                  VERCEL                 SUPABASE
                  Web App                Database
                    │                       │
                    │                       ├─ Users
                    │                       ├─ Work Items
                    │                       ├─ Campaigns
                    │                       ├─ Permissions
                    │                       ├─ Approvals
                    │                       └─ Asset metadata
                    │
                    ▼
               GOOGLE DRIVE
               Shared Drive
                    │
          ┌─────────┼──────────┐
          ▼         ▼          ▼
       Posters    Videos    Documents
```

Google provides a full Drive API for applications to create, upload, retrieve, move, list, and download files. It supports resumable uploads specifically for larger files or unreliable connections, which fits videos much better than treating every upload as one small request. [Google for Developers](https://developers.google.com/workspace/drive/api/guides/create-file?utm_source=chatgpt.com)

So this is technically very realistic.

## I would use a Google **Shared Drive**, not someone's personal Drive

This is the important part.

Don't build:

```
Ahmed's Google Drive
      ↓
Communication Hub files
```

because now Ahmed effectively owns your department's storage.

Instead, if you use Google Workspace, create something like:

```
Google Workspace

Shared Drive:
Communication Department
```

Files in a Shared Drive belong to the organization rather than to an individual user, and the storage comes from the organization's pooled storage. [Google for Developers](https://developers.google.com/workspace/drive/api/guides/about-shareddrives?authuser=2&utm_source=chatgpt.com)

For example:

```
Communication Department
│
├── Campaigns
│   ├── Ramadan 2027
│   └── National Day 2027
│
├── Brand Assets
│
├── Videos
│
├── Photography
│
└── Archive
```

The Hub doesn't necessarily need to expose this folder structure directly to employees; it's just the underlying physical storage.

Google Shared Drives require supported Google Workspace editions rather than a normal personal Gmail account. [Google for Developers](https://developers.google.com/workspace/drive/api/guides/manage-shareddrives?utm_source=chatgpt.com)

So if by "buy cloud storage" you mean **Google Workspace storage for the organization**, that is much more appropriate than buying Google One storage on one employee's personal account.

---

## How would we connect our website?

Something like this.

Admin opens:

```
Settings
→ Integrations
→ Storage

Google Drive
[Connect]
```

Then:

```
Admin clicks Connect
        ↓
Google OAuth
        ↓
Admin authorizes the Hub
        ↓
Communication Hub receives authorization
        ↓
Select Shared Drive
        ↓
"Communication Department"
        ↓
CONNECTED ✓
```

Google Drive uses OAuth 2.0 for application authorization, and its API supports Shared Drives and their permissions. [Google for Developers](https://developers.google.com/workspace/drive/api/guides/about-sdk?utm_source=chatgpt.com)

Then our database might contain:

```
Asset #AST-882

Title:
National Day Main Video

Campaign:
National Day 2027

Work Item:
WRK-184

Storage Provider:
GOOGLE_DRIVE

Drive File ID:
1aBcdEf...

MIME:
video/mp4

Size:
2.8 GB

Uploaded by:
Sara

Version:
4
```

But the actual:

```
2.8 GB video
```

lives in Google Drive.

---

# What happens when Sara uploads a file?

In the Hub she clicks:

```
[Upload Media]

national-day-final.mp4
```

Conceptually:

```
Browser
   │
   │ Ask Hub to begin upload
   ▼
Vercel backend
   │
   │ Authorize Google Drive operation
   │ Create resumable upload session
   ▼
Google Drive
   ▲
   │
   │ actual large-file upload
   │
Browser
```

For large videos, I would deliberately use Drive's **resumable upload** flow. Google recommends resumable uploads for files larger than 5 MB or where connection interruption is likely. [Google for Developers](https://developers.google.com/workspace/drive/api/guides/manage-uploads?authuser=19&utm_source=chatgpt.com)

Then when Google responds:

```
File ID:
1abcxyz...
```

we save that ID in Supabase.

So:

```
SUPABASE
knows what the file means

GOOGLE DRIVE
holds the bytes
```

That separation is very clean.

---

# Opening and downloading works too

Suppose Ahmed opens:

```
National Day Final Video
```

Our app knows:

```
drive_file_id = 1abcxyz
```

and can retrieve/download the binary file through the Drive API. Google explicitly supports downloading ordinary binary/blob files such as images, PDFs, and videos. [Google for Developers](https://developers.google.com/workspace/drive/api/guides/manage-downloads?authuser=2&utm_source=chatgpt.com)

So the Media Library could still look exactly like the Hub we designed:

```
National Day Main Video

[Preview]

Campaign
National Day 2027

Version
4

Size
2.8 GB

Uploaded by
Sara

Used in
Instagram
YouTube
X

[Download]
```

The employee doesn't really need to care that Google Drive is underneath it.

---

# Could employees still access the Shared Drive normally?

Yes.

That's one nice advantage.

You could have both:

```
Communication Hub
        │
        ▼
Google Drive
```

and:

```
Employee
        │
        ▼
Google Drive app / desktop
```

if you want.

Google Drive already has its own roles and permissions for Shared Drives and files. [Google for Developers](https://developers.google.com/workspace/drive/api/guides/ref-roles?utm_source=chatgpt.com)

But I would be careful here.

Remember our **source-of-truth discussion**.

If employees constantly manually rename/delete/move files directly in Google Drive, our Hub may say:

```
Video exists
```

while Google Drive says:

```
deleted
```

So I would probably establish a rule like:

> Hub-managed storage folders should normally be managed through the Hub.

Maybe a separate area can remain available for ordinary team file sharing.

---

# Could Google Drive become our temporary bridge to the NAS later?

Yes — and this is the part I like.

We could go:

### Version 1

```
Vercel
Supabase
Google Shared Drive
```

Then buy the NAS later.

### Transition

```
                       ASSET SYSTEM
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
        Google Drive                  UGREEN NAS
          Cloud                         Office
```

We add another `AssetLocation`.

Example:

```
Asset Version 4

Location #1
Google Drive
ACTIVE

Location #2
UGREEN NAS
ARCHIVE
```

Then the app doesn't care that storage has changed.

Eventually:

```
Google Drive
active / remote / collaboration

NAS
large originals / RAW video / archive
```

Or later Google Drive could be reduced further if another cloud-object-storage system fits us better.

That's exactly why our earlier `AssetLocation` architecture was a good idea.

---

# Would I choose Google Drive instead of Supabase Storage?

For **Version 1**, both approaches are valid, but they solve slightly different problems.

I would think about them like this:

||Supabase Storage|Google Shared Drive|
|---|---|---|
|Normal app uploads|Excellent|Yes|
|Posters/images|Excellent|Excellent|
|Large videos|Yes|Yes, including resumable upload|
|Human file browsing outside Hub|Basic|**Excellent**|
|Normal office collaboration|Limited|**Excellent**|
|Familiar to staff|Maybe|**Very familiar**|
|Organizational folders/sharing|Yes through our app|**Built in**|
|Tight application object-storage behavior|**Excellent**|Good, but Drive-specific|
|Future NAS transition|Yes|Yes|
|Employees use files outside Hub|Less convenient|**Very convenient**|

So if your immediate problem is:

> “We desperately need one shared place today for posters, videos and documents, and employees need to access them easily even before our Hub is finished,”

then **Google Workspace + Shared Drive is actually a sensible purchase**.

It solves an immediate organizational problem while we develop the Hub.

And later we connect the Hub to it through the Drive API instead of throwing that investment away.

The architecture might therefore become:

```
VERSION 1

                    Communication Hub
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
         Vercel        Supabase      Google Drive
          App          Data/Auth        Files
                                          │
                                          ▼
                                   Shared Drive
                                   Communication
                                   Department
```

And later:

```
VERSION 2+

                    Communication Hub
                           │
                    Asset Service
                           │
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
       Google Drive    UGREEN NAS    Future Storage
         remote        originals       backup/archive
```

So, yes: **completely possible, connectable, and potentially a very practical transitional architecture for your project.**