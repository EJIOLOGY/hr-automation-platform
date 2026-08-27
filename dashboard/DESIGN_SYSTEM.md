# InterTech HR Operations Dashboard — Agent Implementation Guide

## Purpose

This file is the authoritative implementation guide for coding agents working inside the `dashboard/` directory.

Before implementing or modifying any dashboard feature, follow the rules in this file.

The dashboard is a **PWA** and follows a locked **WhatsApp Desktop-inspired three-section architecture**:

1. **Primary Section** — navigation / brand rail
2. **Secondary Section** — conversation/list workspace
3. **Tertiary Section** — active conversation workspace

The structure and visual language are locked.

Do not redesign, reinterpret, or replace the established UI architecture unless explicitly instructed.

---

# 1. NON-NEGOTIABLE DESIGN RULES

## 1.1 Preserve the WhatsApp Desktop structure

The dashboard recreates the WhatsApp Desktop three-section interaction model.

Do not replace it with:

- a conventional SaaS sidebar
- a dashboard-with-cards layout
- a top-navigation layout
- a four-column layout
- a hamburger-first mobile layout
- an unrelated admin-template structure

The three sections are independently identifiable:

```text
PRIMARY     SECONDARY                 TERTIARY
Navigation  Conversation/List         Active workspace
Rail        Workspace                 Conversation
```

---

# 2. PRIMARY SECTION

The Primary Section is the leftmost navigation rail.

### Locked navigation order

```text
Analytics
Conversations
Escalations
HR Requests
```

There must be exactly four primary navigation items.

Do not add:

- Employees
- HR Officers
- Reports
- Settings
- Notifications
- Tickets
- Cases
- Audit Logs
- FAQ
- Profile
- any additional navigation item

unless explicitly instructed.

### Account area

The HR officer account area remains at the bottom of the Primary Section.

Do not turn the account area into a fifth navigation item.

---

# 3. SECONDARY SECTION

The Secondary Section retains the WhatsApp-style conversation/list structure.

It contains the conversation/list workspace and its associated controls.

Do not restructure this section into a generic data table unless explicitly instructed.

### Locked changes

#### New-message notification

Use:

```text
INFO = #3F80E0
```

Use the semantic token:

```text
bg-info
```

Do NOT hard-code:

```text
bg-[#3F80E0]
```

#### Top-right "+" button

Use the Corporate Blue Gradient.

#### "All" filter

Use the soft HR/brand gradient.

Do not introduce a new colour.

---

# 4. TERTIARY SECTION

The Tertiary Section is the active conversation workspace.

The conversation remains the centre of the HR operation.

### Employee messages

Employee/inbound messages:

```text
#FFFFFF
```

Use the message token:

```text
bg-message-employee
```

### HR messages

HR/outbound responses use the soft HR gradient.

Use:

```text
bg-brand-hr
```

The HR response must remain visually light.

Do NOT use the saturated Corporate Blue Gradient as the message bubble background.

The visual weight should remain comparable to WhatsApp's light outgoing message treatment.

---

# 5. BRAND COLOUR SYSTEM

The dashboard uses two principal brand gradients.

## 5.1 Corporate Blue Gradient

### Purpose

Primary InterTech brand treatment.

Use for:

- Primary Section branding
- Primary buttons
- Major brand actions
- Important branded UI surfaces
- Secondary Section "+"
- prominent branded controls

### Token

```css
--brand-blue-gradient
```

Tailwind utility:

```text
bg-brand-blue
```

### Locked stops

```text
#0057B8 → #2498E3
```

---

# 6. BLUE → TEAL GRADIENT

This is a secondary brand gradient.

It is intentionally:

```text
BLUE → TEAL
```

It is NOT an ordinary teal gradient.

### Token

```css
--brand-blue-teal-gradient
```

Tailwind utility:

```text
bg-brand-blue-teal
```

### Locked stops

```text
#0878CF → #19B5AE
```

### Appropriate use

Use selectively for:

- secondary brand treatments
- analytics
- insight-oriented UI
- selected data visualizations
- future advanced dashboard surfaces
- secondary branded emphasis

Do not use this gradient indiscriminately.

---

# 7. LIGHT HR RESPONSE GRADIENT

This is the soft gradient used specifically for the HR response treatment.

### Locked stops

```text
#EAF5FF → #E2F7F4
```

### Token

```css
--message-hr-gradient
```

### Tailwind utility

```text
bg-brand-hr
```

### Use for

- HR response message bubbles
- "All" filter active background where specified
- other explicitly approved soft branded states

Do not substitute the saturated Corporate Blue Gradient.

---

# 8. SEMANTIC COLOUR SYSTEM

Semantic colours communicate **state**, not brand identity.

Do not use semantic colours as decorative replacements for brand gradients.

## 8.1 INFO — CURRENTLY ACTIVE

```text
#3F80E0
```

Token:

```css
--info
```

Tailwind:

```text
bg-info
text-info
border-info
ring-info
```

### Current dashboard use

The INFO colour is actively used for:

- Secondary Section new-message notification
- informational indicators
- informational badges
- approved information states

When an implementation requires an informational state, use the semantic token.

Do not hard-code `#3F80E0`.

---

# 9. SUCCESS

```text
#16A66A
```

Token:

```css
--success
```

Tailwind:

```text
bg-success
text-success
border-success
```

### Intended use

Use only for genuine successful/completed states, such as:

- completed
- resolved
- successful
- confirmed

Do not use SUCCESS merely because green looks visually attractive.

---

# 10. WARNING

```text
#E6A21A
```

Token:

```css
--warning
```

Tailwind:

```text
bg-warning
text-warning
border-warning
```

### Intended use

- pending
- attention required
- caution
- requires review

Do not use WARNING for decorative highlights.

---

# 11. ERROR / DANGER

```text
#DC4B4B
```

Token:

```css
--danger
```

Tailwind:

```text
bg-danger
text-danger
border-danger
```

### Intended use

- failed operations
- rejected requests
- critical errors
- destructive states

Do not use ERROR/DANGER for ordinary inactive or disabled elements.

---

# 12. NEUTRAL

```text
#687586
```

Token:

```css
--neutral
```

Tailwind:

```text
text-neutral
border-neutral
```

### Intended use

- neutral status
- inactive metadata
- non-actionable information
- secondary state indicators

---

# 13. SEMANTIC COLOUR DECISION RULE

When implementing a feature, determine whether the colour communicates:

### Brand identity

Use:

```text
Corporate Blue Gradient
Blue → Teal Gradient
Light HR Gradient
```

### System state

Use:

```text
INFO
SUCCESS
WARNING
DANGER
NEUTRAL
```

Never invent a new colour simply because an existing token "doesn't look right."

If an existing token genuinely cannot satisfy the requirement, stop and request a design decision.

---

# 14. SURFACE SYSTEM

The dashboard is primarily a light interface.

### Application background

```text
#F7F9FC
```

Token:

```css
--background
```

### Main foreground

```text
#172033
```

Token:

```css
--foreground
```

### Card

```text
#FFFFFF
```

Token:

```css
--card
```

### Panel

```text
#FFFFFF
```

Token:

```css
--panel
```

### Muted panel

```text
#F7F8FA
```

Token:

```css
--panel-muted
```

### Border

```text
#E3E8EE
```

Token:

```css
--border
```

Do not introduce arbitrary gray values without a specific reason.

---

# 15. TYPOGRAPHY

Use the global typography tokens.

Do not introduce a new font family for an individual component.

Preferred stack:

```text
Inter
→ system-ui
→ -apple-system
→ BlinkMacSystemFont
→ Segoe UI
→ sans-serif
```

Typography should remain consistent with the established WhatsApp-inspired interface.

---

# 16. MESSAGE TOKENS

Use semantic message tokens instead of hard-coded colours.

### Employee

```text
bg-message-employee
text-message-employee-foreground
```

### HR

```text
bg-brand-hr
text-message-hr-foreground
```

Do not implement:

```text
bg-[#FFFFFF]
```

or:

```text
bg-[#EAF5FF]
```

inside components when an appropriate token already exists.

---

# 17. GRADIENT USAGE RULE

Prefer the predefined utility classes:

```text
bg-brand-blue
bg-brand-blue-teal
bg-brand-hr
```

Do not repeatedly write:

```css
linear-gradient(...)
```

inside individual components.

Do not create component-specific gradient variations unless explicitly approved.

---

# 18. NO MAGIC COLOURS

Avoid:

```tsx
bg-[#123456]
text-[#123456]
border-[#123456]
```

when a design token already exists.

Avoid arbitrary colour values in JSX/TSX.

If a new colour is required, add it to the global design system only after explicit approval.

---

# 19. COMPONENT IMPLEMENTATION RULE

Before creating a component, determine:

1. Which dashboard section owns it?
2. What is its functional purpose?
3. Is its colour brand-based or semantic?
4. Which existing token applies?
5. Which existing WhatsApp UI pattern does it correspond to?
6. Does the component alter the locked three-section structure?
7. Does it introduce a new visual pattern?

If the answer to #6 or #7 is yes, do not proceed without explicit instruction.

---

# 20. RESPONSIVE DESIGN

The dashboard is **laptop/tablet-first**.

The important working range is approximately:

```text
800px – 1080px
```

The three-section structure should remain usable throughout this range.

Do not collapse the dashboard into a hamburger-first mobile interface at 800px.

Responsive changes must preserve:

- Primary Section
- Secondary Section
- Tertiary Section
- conversation-centric workflow

Mobile-specific behaviour should be introduced only where required and without changing the desktop/tablet design language.

---

# 21. PWA RULES

The dashboard is a PWA.

Do not introduce caching that can persist:

- JWTs
- employee information
- conversations
- HR requests
- escalations
- HR documents
- API responses
- authenticated dashboard data

Offline functionality must never make live HR information appear available when the application is disconnected.

Live HR operations require network connectivity.

---

# 22. SECURITY RULE

This is an HR application.

Treat employee and HR information as sensitive application data.

Never:

- log employee message content unnecessarily
- persist authentication tokens in localStorage
- cache authenticated API responses
- cache employee conversations
- cache HR documents
- expose sensitive data through URLs
- introduce client-side persistence without explicit approval

---

# 23. EXISTING DESIGN TAKES PRIORITY

When implementing a feature:

```text
Existing locked design
        ↓
Existing design tokens
        ↓
Existing component patterns
        ↓
New feature requirement
```

Do not reverse this order.

A new feature must fit the existing design system.

The design system must not be changed merely to accommodate an implementation shortcut.

---

# 24. DO NOT OVER-ENGINEER

For each task:

- implement only what was requested
- reuse existing components
- reuse existing tokens
- reuse existing patterns
- avoid unnecessary dependencies
- avoid unrelated refactoring
- avoid redesigning existing components
- avoid changing locked layouts

Do not modify unrelated sections while implementing a feature.

---

# 25. BEFORE MODIFYING ANY EXISTING COMPONENT

Inspect the current implementation first.

Never assume:

- file paths
- component names
- props
- state management
- API structure
- authentication flow
- existing CSS classes
- existing token names

Use the current repository as the source of truth.

---

# 26. CHANGE CONTROL

The following are LOCKED unless explicitly changed by the project owner:

### Structure

```text
Primary → Secondary → Tertiary
```

### Navigation

```text
Analytics
Conversations
Escalations
HR Requests
```

### Primary brand

```text
#0057B8 → #2498E3
```

### Secondary brand

```text
#0878CF → #19B5AE
```

### INFO

```text
#3F80E0
```

### Employee message

```text
#FFFFFF
```

### HR message

```text
#EAF5FF → #E2F7F4
```

### Application background

```text
#F7F9FC
```

Do not change these values during ordinary feature implementation.

---

# 27. QUICK TOKEN REFERENCE

| Token | Value / Treatment | Primary Purpose |
|---|---|---|
| `bg-brand-blue` | `#0057B8 → #2498E3` | Primary brand |
| `bg-brand-blue-teal` | `#0878CF → #19B5AE` | Secondary brand |
| `bg-brand-hr` | `#EAF5FF → #E2F7F4` | HR response / soft branded state |
| `bg-info` | `#3F80E0` | Information / new-message indicator |
| `bg-success` | `#16A66A` | Successful/completed |
| `bg-warning` | `#E6A21A` | Pending/attention |
| `bg-danger` | `#DC4B4B` | Error/critical |
| `text-neutral` | `#687586` | Neutral metadata/state |
| `bg-background` | `#F7F9FC` | Application background |
| `bg-card` | `#FFFFFF` | Cards |
| `bg-panel` | `#FFFFFF` | Dashboard panels |
| `bg-message-employee` | `#FFFFFF` | Employee message |
| `bg-brand-hr` | Light blue/teal gradient | HR response |

---

# 28. IMPLEMENTATION EXAMPLES

## Correct

```tsx
<div className="bg-brand-blue">
```

```tsx
<span className="bg-info text-info-foreground">
  3
</span>
```

```tsx
<div className="bg-brand-hr">
  HR response
</div>
```

```tsx
<div className="bg-message-employee">
  Employee message
</div>
```

## Incorrect

```tsx
<div className="bg-[#0057B8]">
```

when `bg-brand-blue` is appropriate.

```tsx
<span className="bg-[#3F80E0]">
```

when `bg-info` is appropriate.

```tsx
<div className="bg-blue-500">
```

when the approved InterTech token should be used.

```tsx
<div className="bg-green-500">
```

simply because the element represents a successful state.

---

# 29. FEATURE IMPLEMENTATION CHECKLIST

Before considering a dashboard feature complete, verify:

- [ ] Correct dashboard section identified.
- [ ] Existing component implementation inspected.
- [ ] Existing design tokens reused.
- [ ] No unnecessary colours introduced.
- [ ] No hard-coded colours where tokens exist.
- [ ] WhatsApp-inspired structure preserved.
- [ ] Three-section architecture preserved.
- [ ] Navigation structure unchanged.
- [ ] Typography unchanged.
- [ ] Icons/icon style unchanged.
- [ ] Responsive behaviour preserves the dashboard architecture.
- [ ] Sensitive HR data is not unnecessarily persisted.
- [ ] PWA security rules remain intact.
- [ ] No unrelated files/components modified.
- [ ] TypeScript passes.
- [ ] Lint passes.
- [ ] Production build passes.

---

# 30. FINAL AGENT RULE

When implementing any dashboard feature:

> **Do not invent the design. Use the locked InterTech design system and existing WhatsApp-inspired dashboard patterns.**

If the requested feature does not have an explicitly defined visual treatment:

1. identify the closest existing approved pattern;
2. reuse its tokens and structure;
3. keep the implementation visually consistent;
4. do not introduce a new colour, gradient, component pattern, navigation item, or layout;
5. ask for a design decision only when the existing system genuinely cannot accommodate the feature.

The objective is a **consistent, premium InterTech HR Operations PWA**, not a collection of independently styled features.