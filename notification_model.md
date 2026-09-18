# Notification Model — Communication Department Hub

> **Status: Discussion record — not final notification specification**
>
> This document preserves the current discussion about notifications, actions, Needs Attention, activity, reminders, escalation, delivery channels, preferences, grouping, deduplication, incident handling, localization, and mobile behavior.
>
> The concepts below are architectural directions only. Exact notification categories, mandatory alerts, email behavior, reminder timing, quiet hours, escalation rules, delivery providers, and MVP boundaries are still under discussion.

---

# 1. Notification, Action, and Activity Are Different

The system should distinguish:

```text
ACTION / INBOX
Something requires me to do something.

NOTIFICATION
Something happened that I should know about.

ACTIVITY
A historical record of what happened.
```

Examples:

```text
ACTION REQUIRED

National Day Post
Approval requested from you.

[Review]
```

```text
NOTIFICATION

Sara mentioned you in Campaign #42.
```

```text
ACTIVITY

Instagram post published successfully
at 18:00.
```

Combining all three into one notification stream would create noise.

---

# 2. Needs Attention Is a Fourth Concept

A system or workflow problem may need resolution without being a normal assigned action.

Example:

```text
LinkedIn account disconnected.
```

Possible model:

```text
ACTION REQUIRED
Assigned responsibility requiring a person

NEEDS ATTENTION
Problem blocking/degrading the system or workflow

NOTIFICATION
Useful informational update

ACTIVITY
Complete historical event stream
```

Examples:

```text
Approval request
→ ACTION REQUIRED
```

```text
Instagram token expired
→ NEEDS ATTENTION
```

```text
Sara commented on your task
→ NOTIFICATION
```

```text
Sara uploaded Version 4
→ ACTIVITY
```

---

# 3. Notifications Should Originate From Events

Avoid feature code directly creating arbitrary text messages.

Prefer:

```text
EVENT
  ↓
Notification Policy
  ↓
Who should receive it?
  ↓
What kind of message?
  ↓
Which channels?
  ↓
Create notifications
```

Example source event:

```text
APPROVAL_REQUESTED

actor:
Sara

target:
Release Package #81

approver:
Mohammed

campaign:
National Day
```

The notification system interprets structured events.

---

# 4. Events and Notifications Remain Separate

An event describes what happened.

A notification decides who needs to know about it.

Example:

```text
POST_PUBLISHED
```

may remain visible in Activity even if a Manager disabled publication-success notifications.

Principle:

> Events describe reality. Notifications decide who needs to hear about that reality.

---

# 5. Do Not Notify Everyone About Everything

Recipient selection should be deliberate.

Potential relationships:

```text
task creator
assignee
campaign owner
manager
followers/watchers
mentioned users
```

Example policy:

```text
TASK_COMPLETED

Notify:
Task creator
Campaign owner if task is critical

Do not notify:
Completing employee
Entire department
Admin
```

---

# 6. Notifications Should Follow Responsibility

Principle:

> Notify the person who can act, not everyone who might be interested.

Examples:

```text
Caption invalid
→ Content author
```

```text
OAuth token expired
→ Manager/Admin with integrations.manage
```

```text
System backup failed
→ Admin
```

This follows failure ownership.

---

# 7. Importance Levels

Possible classification:

| Level | Meaning | Example |
|---|---|---|
| Info | Useful update | Comment added |
| Action | User needs to act | Approval requested |
| Warning | Problem may affect work | Token expiring |
| Critical | Immediate operational/security risk | Major outage/security incident |

Critical should remain rare.

---

# 8. Category and Priority Are Different

Examples:

```text
ACTION REQUIRED
Priority: Normal
```

Routine approval.

```text
ACTION REQUIRED
Priority: High
```

Emergency public correction.

Likewise:

```text
WARNING
Priority: Low
```

Storage nearing threshold.

```text
WARNING
Priority: High
```

Integration expiring before a major campaign.

Keep:

```text
category
```

separate from:

```text
priority
```

---

# 9. Notification Center

Possible UI:

```text
NOTIFICATIONS

All | Action | Attention | Mentions
```

Example feed:

```text
ACTION REQUIRED
National Day Reel
Mohammed requested your revision.
[Open]

MENTION
Sara mentioned you in Campaign #28.
[View comment]

WARNING
LinkedIn needs reconnection before
tomorrow's scheduled publication.
[Reconnect]

INFO
Your Instagram post published successfully.
[View]
```

---

# 10. Action Required Should Also Be Prominent Elsewhere

Do not hide operational responsibilities under a bell icon.

Home may show:

```text
YOUR ACTIONS

3 approvals
2 requested revisions
1 overdue task
```

Manager:

```text
NEEDS YOUR ATTENTION

4 approvals
1 failed publication
1 disconnected account
```

---

# 11. Read State and Workflow State Are Separate

Opening a notification must not complete the underlying responsibility.

Example:

```text
Notification:
READ
```

while:

```text
Approval Request:
PENDING
```

Only the real workflow action changes the workflow state.

---

# 12. Lifecycle States

Notification:

```text
UNREAD
READ
ARCHIVED
DISMISSED
```

Action Item:

```text
OPEN
COMPLETED
CANCELLED
EXPIRED
```

Needs Attention:

```text
OPEN
ACKNOWLEDGED
RESOLVED
```

These should remain distinct.

---

# 13. Acknowledgment for Critical Warnings

Example:

```text
CRITICAL

External publishing has been paused
because suspicious account activity
was detected.

[Acknowledge]
```

Then:

```text
Acknowledged by:
Mohammed — 02:13
```

The issue stays open until resolved.

---

# 14. Grouping

Avoid one notification per repetitive action.

Bad:

```text
Sara uploaded file 1.
Sara uploaded file 2.
...
```

Better:

```text
Sara uploaded 15 files
to National Day Campaign.
```

Similarly:

```text
5 new comments in
National Day Campaign
```

---

# 15. Deduplication

Repeated health checks should not create duplicate warnings.

Bad:

```text
09:00 warning
09:15 warning
09:30 warning
...
```

Better:

```text
Needs Attention:
LinkedIn requires reconnection

First detected:
09:00

Last checked:
12:45
```

---

# 16. Update Existing Attention Items

Example:

```text
NAS unavailable
```

creates one Attention Item.

Further failures update the same issue.

When resolved:

```text
Attention Item
→ RESOLVED
```

Optional informational notice:

```text
NAS connection restored.
```

---

# 17. Reminders Are Different From Notifications

Notification:

```text
EVENT
→ immediate information
```

Reminder:

```text
OPEN ACTION
+
TIME CONDITION
→ re-surface unresolved work
```

Example:

```text
Approval requested
10:00
```

No response later:

```text
Reminder:
Approval still waiting.
```

---

# 18. Reminder Jobs Should Cancel Automatically

If approval is completed before scheduled reminders:

```text
cancel remaining reminder jobs
```

This prevents stale reminders.

---

# 19. Escalation Policies

Example:

```text
Approval waiting 12 hours
→ remind approver

24 hours
→ remind again

48 hours
→ escalation
```

Another:

```text
Integration disconnected T-24h
→ Manager warning

Still disconnected T-1h
→ High-priority warning

Publish time reached
→ Needs Attention + blocked job
```

---

# 20. Escalation Does Not Always Mean Notify the Boss

Possible sequence:

```text
same user
      ↓
designated substitute
      ↓
manager
```

Escalation should follow workflow policy.

---

# 21. User Preferences Within Organizational Policy

Possible user preferences:

```text
Comments:
In-app only

Mentions:
In-app + email

Task assigned:
In-app + email

Publication success:
In-app only
```

Hierarchy:

```text
ADMIN NOTIFICATION POLICY
        ↓
TEAM / MANAGER POLICY
        ↓
USER PREFERENCES
```

Lower levels cannot suppress mandatory alerts defined above them.

---

# 22. Mandatory Notifications

Potential mandatory categories for responsible users:

```text
Account role changed
MFA disabled
Official account disconnected
Critical publication failure
Security incident
Emergency override used
Backup failure over threshold
```

Mandatory means the intended recipient cannot mute it.

It does not mean everyone receives it.

---

# 23. Delivery Channels

Initial channels may be:

```text
IN_APP
EMAIL
```

Future:

```text
PUSH
SMS
```

Architecture:

```text
Notification
      ↓
Delivery Policy
      ↓
 ┌────┼────┐
 ▼    ▼    ▼
InApp Email Push
```

---

# 24. In-App Should Be the Primary Channel

Ordinary work should primarily live inside the Hub.

Example notification:

```text
Mohammed requested changes to
National Day Post.
```

can deep-link directly to the affected work item.

Email becomes a secondary channel.

---

# 25. Email Should Not Mirror Every Notification

Avoid dozens of notification emails every day.

Email may be useful for:

```text
direct assignment
approval request
important mention
high-priority failure
digest
```

Routine updates remain in-app.

---

# 26. Digests

Possible daily summary:

```text
Daily Communication Hub Summary

3 tasks completed
2 new comments
4 publications succeeded
1 item needs your review

[Open Hub]
```

Manager summary:

```text
TODAY

6 scheduled publications
4 pending approvals
2 overdue tasks
1 integration warning
```

---

# 27. Urgent Events Should Not Wait for a Digest

Example policy:

```text
Routine info
→ digest

Scheduled publication failed
→ immediate

Security alert
→ immediate
```

Possible delivery modes:

```text
IMMEDIATE
DIGEST
IN_APP_ONLY
SUPPRESSED
```

---

# 28. Quiet Hours

Example:

```text
Quiet hours:
22:00–07:00
```

Ordinary external alerts may be delayed.

Critical notifications may still be delivered according to organizational policy.

---

# 29. Future Work-Schedule Awareness

Future routing may account for:

```text
leave
weekends
shifts
delegation
```

Example:

```text
Manager on leave
→ route approval to delegated approver
```

---

# 30. Deep Links

Avoid:

```text
Something changed.

[Open Dashboard]
```

Prefer:

```text
Sara requested your review
on Image 3.

[Open Image 3 Review]
```

Useful target data:

```text
target_type
target_id
target_subcontext
comment_id
version_id
approval_request_id
```

---

# 31. Enough Context, Not Too Much

Good notification:

```text
Mohammed requested changes to
"National Day Instagram Reel"

Comment:
"Replace image 2."

[Review Changes]
```

Avoid embedding entire discussions into notifications.

---

# 32. Sensitivity-Aware Notifications

Sensitive material should not leak through email or lock-screen previews.

Instead of:

```text
CONFIDENTIAL CAMPAIGN:
...
```

use:

```text
You have a new high-priority review
in Communication Hub.

[Open Securely]
```

Notification templates should support sensitivity-aware rendering.

---

# 33. Push Notifications Need the Same Sensitivity Rules

Mobile lock screens may expose message text.

Sensitive content classification may decide between:

```text
full preview
```

and:

```text
generic secure notification
```

---

# 34. Localization

Notification business logic should not hard-code text.

Use templates.

Example:

```text
event:
APPROVAL_GRANTED

template:
notification.approval_granted
```

Then render in:

```text
Arabic
English
```

according to user preference.

---

# 35. Time Localization

Dates and times should display according to organizational/user timezone and locale while preserving one canonical underlying timestamp.

---

# 36. Notification Template History

For audit-sensitive notifications, preserve what the user actually received.

Possible approaches:

```text
rendered title/body
```

or:

```text
template version
+
render data
```

---

# 37. Realtime Delivery and Persistence Are Separate

Persist important notifications first.

Realtime can then tell the UI:

> A new durable notification exists.

If the user is offline, the notification remains available next login.

---

# 38. Toasts and Notifications Are Different

Toast:

```text
✓ Draft saved.
```

Ephemeral.

Notification:

```text
Mohammed requested changes.
```

Durable.

Do not create permanent notifications for obvious self-confirming actions.

---

# 39. Do Not Notify Users About Their Own Actions by Default

Example:

```text
Sara completes task
```

Sara usually does not need:

```text
You completed the task.
```

Potentially notify other responsible parties instead.

Significant external actions may justify confirmation.

---

# 40. Mentions

`@Sara` should reliably create a notification.

The notification should link directly to the source comment.

If the comment is edited later, the historical notification may remain while reflecting that the source changed.

---

# 41. Following / Watching

Future feature:

```text
Follow this campaign
```

Receive selected updates without being assigned.

This should be opt-in and configurable.

Not required for MVP.

---

# 42. Aggregate Child Job Events

For a five-platform publish, avoid five success notifications.

Prefer:

```text
Publication completed on 5 channels.
```

If one fails:

```text
Published to 4 of 5 channels.

LinkedIn needs attention.

[View Publication]
```

---

# 43. Notify on Stable Parent Workflow State

Child updates may remain in Activity.

Create a meaningful user notification when the parent workflow reaches:

```text
SUCCEEDED
PARTIAL_FAILURE
FAILED
```

This reduces noise.

---

# 44. Incident Grouping

If a platform outage causes hundreds of job failures, create one incident rather than hundreds of alerts.

Example:

```text
INCIDENT

Database connectivity issue

Affected:
300 background operations

First detected:
14:03

Current status:
Recovering
```

---

# 45. Root-Cause Alerts

Example:

```text
Instagram credential expired
```

may block eight scheduled jobs.

Prefer:

```text
Primary Attention Item:

Instagram connection expired

Affected:
8 scheduled publications

[Reconnect]
```

instead of nine urgent notifications.

---

# 46. Security Routing

Security notifications may route differently.

Example:

```text
Admin role changed
```

Recipients:

```text
security/admin users
affected user
```

Routing can depend on:

```text
role
relationship to event
security responsibility
```

---

# 47. Delivery Confirmation for Critical Alerts

For critical events, track delivery infrastructure:

```text
In-app created ✓
Email accepted ✓
Push accepted ✓
```

This does not prove a human read it, but confirms channel delivery.

---

# 48. Read Receipts Should Not Become Surveillance

Ordinary notifications do not need managerial read tracking.

Use explicit acknowledgment when a workflow genuinely requires it.

```text
Read
```

is mostly personal UI state.

```text
Acknowledged
```

is an intentional workflow action.

---

# 49. Notification Delivery Jobs

Notification and delivery are separate.

```text
Notification #100
      │
      ├── InApp Delivery
      ├── Email Delivery
      └── Future Push Delivery
```

If email fails, the in-app notification still exists.

---

# 50. Notification Data Model

Conceptual model:

```text
Notification

id
recipient_user_id

type
category
priority

title
body

source_event_id

target_type
target_id

created_at

read_at
archived_at

group_key
dedupe_key
sensitivity
```

Delivery records:

```text
NotificationDelivery

notification_id

channel
status

attempt_count

sent_at
failed_at

provider_message_id
```

---

# 51. Action Items Should Be Separate

Concept:

```text
ActionItem

id
type
assigned_to
target
due_at
status
created_from_event
```

Examples:

```text
APPROVE_CONTENT
REVISE_CONTENT
RECONNECT_INTEGRATION
RESOLVE_FAILED_PUBLICATION
```

Notifications inform users about the action.

The Action Item is the durable responsibility.

---

# 52. Needs Attention Records

Concept:

```text
AttentionItem

id

category
severity

root_cause

affected_entities

owner / responsible role

status

first_detected_at
last_detected_at
resolved_at
```

This supports aggregation and root-cause handling.

---

# 53. Connected Model

```text
EVENT
What happened?

ACTION ITEM
What must someone do?

ATTENTION ITEM
What problem needs resolution?

NOTIFICATION
Who should be informed?

ACTIVITY
Historical view of events
```

---

# 54. Dedupe and Group Keys

Example:

```text
dedupe_key:
INTEGRATION-17-REAUTH_REQUIRED
```

Repeated checks update existing state instead of creating duplicate messages.

---

# 55. User-Friendly Preference Categories

Possible settings:

```text
NOTIFICATIONS

Tasks
Assignments               Email + In-app
Due reminders             In-app

Approvals
Approval requests         Email + In-app
Approval results          In-app

Comments
Mentions                  Email + In-app
Other comments            In-app

Publishing
Failures                   Email + In-app
Success                    In-app

System
Critical alerts           Required
```

Do not expose technical internal event names to users.

---

# 56. Admin Notification Policy

Possible Admin configuration:

```text
NOTIFICATION POLICY

Security alerts
Mandatory                ON
Email                    ON
Push                     ON

Publishing failures
Mandatory for Managers   ON

Approval reminders
After                    12 hours

Escalation
After                    24 hours
```

Team policies and user preferences operate within Admin boundaries.

---

# 57. Mass Notifications Should Be Intentional

`Notify all employees` should be a deliberate broadcast capability with:

- proper permission
- preview
- confirmation
- audit

It should not happen accidentally through ordinary notification rules.

---

# 58. Broadcast Announcements Are a Separate Product Feature

Example:

```text
Department Announcement

"Tomorrow's event has moved to 10:00."

Audience:
All Communication employees
```

This is intentional communication, not a system-generated event notification.

It may reuse delivery infrastructure underneath.

---

# 59. Notification Analytics Should Improve the System

Useful metrics:

```text
Number of unresolved action items
Average time to resolve attention items
Notifications generated by category
Frequently muted optional categories
Email delivery failure rate
```

Avoid turning notification behavior into employee productivity scoring.

---

# 60. Notification System Health

Possible Admin view:

```text
NOTIFICATION HEALTH

In-app
✓ Healthy

Email
✓ Healthy

Push
Not configured

Failed deliveries today
3

Queued
12
```

Delivery failures feed system health monitoring.

---

# 61. Correlation IDs

Related items should share a common correlation identifier.

Example:

```text
PUB-882
```

could connect:

```text
Attention item
Action item
Manager notification
Admin notification
Email delivery
```

---

# 62. Prevent Recursive Notification Loops

Do not allow:

```text
Notification delivery failed
→ notification about failure
→ delivery fails
→ another notification
→ ...
```

Channel failure handling must avoid recursive alert creation.

---

# 63. Notification Policy Changes Should Be Auditable

Example:

```text
Mohammed changed Approval Reminder
12h → 6h
```

Heavy versioning may not be needed initially, but policy changes should be traceable.

---

# 64. Some Reminder Rules Belong to Workflow Policies

Example:

```text
Approval Policy

Reminder after:
12h

Escalate after:
24h
```

belongs with approval workflow.

Whereas:

```text
Email delivery enabled
```

belongs with notification infrastructure.

---

# 65. Mobile Notification Design

Mobile notifications should have:

```text
clear title
one-line context
primary action
deep link
```

Example:

```text
Approval requested

National Day Reel
Due today

[Review]
```

---

# 66. Home Dashboard Should Summarize

Home may show:

```text
YOUR WORK

Actions              4
Needs Attention      1
Unread Mentions      2
```

Then users open the relevant queue.

Avoid duplicating the full notification feed on Home.

---

# 67. Conceptual Architecture

```text
                         SYSTEM EVENT
                              │
                              ▼
                    NOTIFICATION POLICY
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
 Recipient Resolution    Classification       Group/Dedupe
         │                    │                    │
         └────────────────────┼────────────────────┘
                              ▼
                ┌──────────────────────────┐
                │                          │
          ACTION / ATTENTION          NOTIFICATION
                │                          │
                │                  Delivery Policy
                │                          │
                │                 ┌────────┼────────┐
                │                 ▼        ▼        ▼
                │              In-App    Email    Push
                │
                ▼
          Workflow remains open
          until actually resolved

Everything
     ↓
Activity / Audit where appropriate
```

Reminders:

```text
Open Action / Attention
          │
          ▼
Background Job Scheduler
          │
          ▼
Reminder / Escalation Event
          │
          ▼
Notification Policy
```

---

# 68. Recommended MVP

Start with:

```text
IN-APP NOTIFICATIONS
Primary channel

EMAIL
Selected important categories
```

Primary concepts:

```text
Actions
Needs Attention
Notifications
Activity
```

Initial categories:

```text
Task assignment
Approval requested
Changes requested
Direct mentions
Upcoming deadlines
Publishing failure
Integration problem
Important publishing success
Security events for appropriate users
```

Include grouping, deduplication, reminder cancellation, and deep links early.

---

# 69. Core Principle

> **A notification should have a reason to interrupt somebody.**

If it does not:

- put it in Activity
- include it in a digest
- show it on the relevant dashboard

rather than making the notification bell light up.

Notifications are not the source of truth.

The source of truth remains the underlying:

```text
Task
Approval
Job
Connected Account
Attention Item
etc.
```

Reading or deleting a notification must never delete the underlying responsibility.

---

# 70. Still Unresolved

We still need to decide:

- Exact notification categories
- Mandatory alert rules
- Email provider
- Push notification provider
- Digest schedule
- Quiet-hours behavior
- Escalation timing
- Acknowledgment requirements
- Notification retention
- Grouping/deduplication rules
- Sensitivity classifications
- Localization details
- Notification template architecture
- Mobile push scope
- Broadcast announcement design
- Which user preferences are configurable
- Which security alerts cannot be muted

This document preserves the notification-model discussion only. It is not yet the final notification architecture.
