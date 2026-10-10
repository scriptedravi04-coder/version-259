# Relocate Admin Action Buttons to Enforcement Tab

## Title & Summary
This change streamlines the Admin Users Table by removing the **Show on Home**, **KYC & Authenticity Audit (Lightbulb)**, and **Delete Profile** action buttons from the table row, relocating them into a dedicated, clean management section within the user's **Enforcement** tab in the User Details panel.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The user confirmed the following decisions during Phase 1 clarification:
> - **Buttons to Relocate**: **Show on Home**, **Delete Profile**, and **Lightbulb (Audit)**.
> - **Target Location**: Inside the **Enforcement tab** within the User Details view (`UserEnforcementPanel.jsx`).
> - **Execution Timing**: Do not modify code yet; wait for the user's explicit "start" command.

- **Confirmed Decision 1**: The User Table's `ACTION` column will retain the **Edit Creator Profile (Pencil)** and **Ban / Unban** quick actions, while the heavier management actions (Home Pick toggle, Audit dialog trigger, and Delete/Remove) move into the dedicated details screen.
- **Confirmed Decision 2**: In the **Enforcement tab**, the relocated actions will be organized in a clear, card-based section (e.g., "Account Management & Discovery") with proper authorization guards, confirmation modals, and visual states.

---

## 1. Overview & Core Concept

- **What It Does**: Cleans up the dense `ACTION` column in the Admin Users list table and centralizes high-impact account controls (Featured Home listing, Live Grounded AI/KYC audit, and permanent account deletion) inside the user's individual **Enforcement** view.
- **Target Audience**: Platform Administrators & Super Admins managing creators and brands on Ybex.
- **Key Value**: 
  - Prevents accidental deletion or misconfigured homepage featuring directly from a crowded table.
  - Keeps the main table uncluttered and responsive.
  - Provides administrators with full user context and verification history before executing audits, changing homepage visibility, or initiating account deletion.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Users Table View (`AdminUsersTab.jsx`)**:
   - The table displays user rows cleanly without oversized multi-button clusters in the `ACTION` column.
   - Clicking on a user row opens the full **User Details** view (`UserEnforcementPanel.jsx`).
2. **User Details — Enforcement Tab**:
   - Admin navigates to or opens the **Enforcement** tab.
   - Beside the existing Warning / Suspend forms, admin sees:
     - **Discovery & Featuring Card**: A toggle button showing current status (`Show on Creator Home` vs `Featured on Home (Active)`), matching the 4-creator limit.
     - **Authenticity & KYC Audit Card / Button**: Triggers the interactive Live Grounded KYC & Authenticity Audit modal for this user.
     - **Permanent Deletion Zone**: Distinct red card or button with confirmation to remove/delete the profile safely.

### Visual Styling & Component Hierarchy
- Consistent with Ybex admin theme: DM Sans typography, soft rounded corners (`rounded-2xl`, `rounded-3xl`), elevated cards (`bg-white border border-gray-100 shadow-sm`), and clear color accents:
  - Violet (`#7C3AED`) for Discovery / Home features.
  - Indigo for Authenticity & KYC Audit.
  - Red / Amber for Deletion and disciplinary actions.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Removal from Table vs. Duplication**
  - *Chosen Approach*: Complete removal of Home Pick, Audit Bulb, and Delete from the table row as requested.
  - *Why*: Eliminates table row clutter and ensures destructive or curation actions are performed intentionally with full profile context in view.
- **Decision 2: Placement within Enforcement Tab**
  - *Chosen Approach*: Position the relocated controls neatly below or alongside the current Enforcement Action card, clearly categorized so disciplinary tools (Warning, Suspend, Ban) and profile management tools (Audit, Home Feature, Delete) remain coherent.
- **Decision 3: Passing State & Handlers**
  - *Chosen Approach*: Pass `homePicks`, `toggleHomePick`, `setAuditModalTarget`, and `handleRemoveCreator` props from `AdminUsersTab` into `UserEnforcementPanel`, preserving all existing APIs, toasts, and audit logs.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    AdminUsersTab.jsx                        │
│                                                             │
│  ┌───────────────────────┐       ┌───────────────────────┐  │
│  │   Users Table Row     │       │ User Details Overlay  │  │
│  │   • Edit (Pencil)     │──────▶│ (UserEnforcementPanel)│  │
│  │   • Ban / Unban       │       └───────────┬───────────┘  │
│  └───────────────────────┘                   │              │
└──────────────────────────────────────────────┼──────────────┘
                                               ▼
                              ┌─────────────────────────────────┐
                              │         Enforcement Tab         │
                              │                                 │
                              │  [1] Enforcement Actions:       │
                              │      - Warning / Suspend        │
                              │                                 │
                              │  [2] Profile Curation & Audit:  │
                              │      - Show on Home Toggle (🏠) │
                              │      - Grounded Audit (💡)     │
                              │                                 │
                              │  [3] Danger Zone:               │
                              │      - Delete Profile (🗑️)     │
                              │                                 │
                              │  [4] Violation History          │
                              └─────────────────────────────────┘
```

### Component & Handler Mapping
- **`Show on Home`**: Leverages existing `toggleHomePick(userId, !active)` API (`/api/admin/creator-home-picks`), enforcing maximum 4 creators limit.
- **`Bulb (Audit)`**: Sets `auditModalTarget` with complete profile metadata (pan_number, handle, platform, category, followers) to launch the `LiveGroundedAuditCard` modal.
- **`Delete Profile`**: Invokes `handleRemoveCreator(user)` which executes the soft-delete/bin protocol with audit logging.
- **State Preservation**: All actions maintain real-time sync with Supabase and the local store without reloading the entire users list.
