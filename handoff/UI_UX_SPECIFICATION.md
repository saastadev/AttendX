# Complete production UI system — employee & admin surfaces

Description
You're right. The uploaded version already has the correct portal structure and the GitHub/Repo & Environments section at the bottom; that context should be preserved, not replaced.
I would refine that exact prompt, keeping its original requirements, and strengthen it with the richer premium interaction system you asked for. The important point is: add depth without losing the original engineering constraints.
Below is the refined version you can paste directly into the portal.

TITLE: feat(ui): elevate every screen to premium production quality
PRIORITY: High
TYPE: Refinement + Completion

What already exists — build on it, don't rebuild it
All 24 routes are scaffolded and render: auth (login/signup/forgot/reset), dashboard, attendance + check-in, leave + apply, cases, copilot, notifications, profile + sessions, recognition, performance, onboarding, admin (users, settings), HR (directory, employees, insights, leaves), manager (team, approvals).
A neumorphic design system with a real elevation scale (soft-UI shadow pairs, 5 depth levels) already exists in the shared stylesheet — use it, extend it, don't invent a parallel system.
Tenant white-labeling is LIVE: the app reads each tenant's brand color and repaints the whole UI's accent through CSS custom properties when a user logs in. Every screen must continue deriving its accent from those tokens. Never hardcode a brand color.
Semantic color tokens already exist for success/warning/danger/info states.
Existing components, patterns, layouts and visual primitives should be reused wherever they already solve the problem. Improve and standardize them instead of creating unnecessary duplicates.

NON-NEGOTIABLE UI DIRECTION
MOBILE-FIRST. UI-FIRST. NO EXCEPTIONS.
The product must be designed and implemented from the mobile experience outward.
390px is the PRIMARY DESIGN TARGET — not a secondary breakpoint.
Do NOT:
Design desktop first and make it responsive afterward.
Build desktop sidebar/header layouts first and squeeze them onto mobile.
Treat mobile as a smaller version of desktop.
Hide broken desktop components on mobile.
Shrink desktop tables, cards, spacing, typography or navigation patterns into mobile.
Consider mobile complete simply because the page technically fits at 390px.
Prioritize desktop visual effects over mobile usability or performance.
DO:
Start every screen at 390px.
Establish hierarchy, spacing, typography, navigation, controls, forms, cards, states and interactions at mobile width first.
Make interactions thumb-friendly and one-handed.
Use minimum 44×44px touch targets.
Design for real field usage: phones, poor lighting, quick interactions and intermittent connectivity.
Use 100dvh, not 100vh.
Respect env(safe-area-inset-*).
Validate scrolling, sticky elements, bottom navigation, sheets, dialogs, forms, tables and long content at mobile dimensions.
Only after mobile is complete should the layout progressively expand to tablet and desktop.
Desktop is an expansion of the mobile product — NOT the source of truth.

Required implementation order for EVERY screen
1. Mobile UI → 2. Mobile states → 3. Mobile interactions → 4. Motion/effects → 5. Dark mode → 6. Tablet → 7. Desktop
Do not move to the next screen until the mobile experience is complete.

PREMIUM VISUAL EXPERIENCE
The target is not simply "better styling."
The target is a premium, funded SaaS product with a deliberate visual language that feels dimensional, tactile, responsive and trustworthy.
The interface should feel:
Rich, dimensional, alive, tactile, polished, fast and intentional.
The visual system should combine:
Neumorphism
Glassmorphism
Controlled 3D depth
Layered surfaces
Consistent lighting
Purposeful motion
Micro-interactions
Meaningful transitions
Responsive state changes
These are complementary systems.
Do not replace the existing neumorphic foundation. Extend it.

NEUMORPHISM + GLASSMORPHISM
Neumorphism — physical foundation
Use the existing neumorphic system for:
Main surfaces
Cards
Inputs
Buttons
Controls
Dashboard modules
Content panels
Primary interactive surfaces
Use the existing 5-level elevation system.
Do not create arbitrary shadows or independent elevation systems.
Glassmorphism — floating layer
Use glass selectively for:
Navigation
Floating navigation
Bottom sheets
Modals
Command palette
Floating controls
Contextual overlays
Sticky/floating surfaces
Selected premium hero areas
Use:
Controlled transparency
Backdrop blur
Subtle borders
Layered depth
Proper contrast
Strict rule
Do not make everything glass.
Neumorphism communicates:
"This belongs to the physical interface surface."
Glassmorphism communicates:
"This layer is floating above the interface."
The two systems must reinforce hierarchy rather than compete with each other.

LIGHTING & DEPTH
Maintain one fixed top-left light source across the entire application.
This applies to:
Neumorphic shadows
Highlights
Cards
Buttons
3D elements
Floating surfaces
Glass surfaces
Interactive components
No random shadows.
No inconsistent lighting directions.
No screen-specific shadow styles.
Inconsistent lighting is specifically prohibited because it makes soft UI look unfinished.

3D ELEMENTS & DEPTH
Introduce subtle, premium 3D elements where they improve hierarchy or experience.
Appropriate areas may include:
Dashboard hero areas
Attendance/check-in experience
Recognition
Copilot
Empty states
Onboarding
Important interactive cards
Premium illustrations
Data visualization highlights
Techniques may include:
Perspective
Layered depth
Controlled translateZ
Subtle card tilt
Parallax
Floating layers
Depth-aware hover
Soft 3D illustrations
Strict limits
3D must remain:
Subtle
Fast
Readable
Mobile-safe
Accessible
Reusable
Do NOT introduce:
Gaming-style interfaces
Excessive rotation
Constant spinning
Heavy WebGL for simple UI
Large perspective distortions
Effects that block interaction
Effects that compromise 390px performance
If an effect looks impressive at 1440px but performs poorly at 390px, remove or simplify it.

MOTION & ANIMATION SYSTEM
Motion is a core part of the product experience.
The application must have one shared motion language, not independent animation styles across 24 routes.
Create reusable motion primitives for:
Page transitions
Route transitions
Component entrance
List appearance
Card expansion
Modal opening
Bottom-sheet presentation
Navigation transitions
Tab transitions
Form validation
Button interaction
Toggle changes
Loading
Success
Error
Notification/toast
Value updates
Skeleton → content
List → detail
Use:
Shared spring configuration
Consistent duration scale
Consistent easing
Consistent stagger
Consistent transform behavior
Do not invent a different animation language for each screen.

PREMIUM MICRO-INTERACTIONS
Important controls must visibly respond to user interaction.
Buttons
Subtle press/depth response
Loading transformation
Success state
Error state
Cards
Controlled elevation
Subtle hover response on desktop
Press feedback on mobile
Optional controlled perspective
Inputs
Focus transition
Validation feedback
Error transition
Success state
Toggles / Checkboxes
Smooth state transition
Controlled physical movement
Clear selected state
Navigation
Active indicator transition
Icon/state transition
Smooth selection feedback
Forms
Validation animation
Submission state
Success/error transition
Every interaction should provide clear feedback without becoming distracting.

PAGE & SHARED-ELEMENT TRANSITIONS
Navigation should feel continuous.
Where appropriate, use shared-element transitions / layoutId for:
List → detail
Employee → employee profile
Notification → notification detail
Attendance → check-in
Recognition → recognition detail
Expandable cards
Floating action → expanded panel
Prefer transformation of the same object over abruptly replacing one UI block with another.
Transitions must remain:
Fast
Predictable
Interruptible where appropriate
Mobile-safe
Accessible
Do not use long cinematic transitions that delay normal work.

DATA & STATE ANIMATION
Important values should transition naturally when they change.
Use controlled animations for:
Attendance counts
Present/absent counts
Leave balances
Performance values
KPIs
Recognition counts
Dashboard metrics
Progress indicators
Charts should support:
Initial reveal
Filter transitions
Selected-value highlighting
Smooth data updates
Do not continuously animate data.
Animation must communicate change, not distract from information.

ATTENDANCE EXPERIENCE
Attendance is a core AttendX interaction and should receive special attention.
Clock-in/out should have a clear visual state progression:
Ready → Processing → Confirmed
or:
Ready → Processing → Failed
Potential visual feedback:
Location verification
Geofence status
Camera/selfie state
Processing state
Confirmation
Timestamp update
Attendance status transition
Never visually show success until the backend confirms success.
If offline:
Queued → Syncing → Confirmed
or:
Queued → Failed
Never fake a successful clock-in.

COPILOT EXPERIENCE
The Copilot should feel premium but remain part of AttendX.
Use appropriate:
Glass surfaces
Depth
Subtle AI visual treatment
Streaming transitions
Tool-call indicators
Retrieval/citation presentation
Thinking state
Tool execution state
Response state
Potential interaction progression:
Listening → Thinking → Retrieving → Tool execution → Responding
Do not turn the Copilot into a generic "AI neon" interface.
The experience should communicate:
Intelligence + transparency + trust.

LOADING EXPERIENCE
Loading is a designed product state.
Use:
Layout-matched skeletons
Progressive reveal
Subtle shimmer where appropriate
Controlled transitions
Stable layout dimensions
Avoid:
Blank screens
Generic spinners everywhere
Layout jumps
Skeletons that do not resemble the final layout

EMPTY STATES
Empty states are a design deliverable.
Use where appropriate:
Custom illustrations
Subtle depth
Glass/neumorphic containers
Controlled animation
Clear explanation
One meaningful primary action
Examples:
No attendance history
No leave requests
No notifications
No recognition
No cases
No team members
Never use generic:
No data found
as the complete experience.

ERROR & RECOVERY STATES
Errors must communicate what happened and what the user can do next.
Use:
Clear error message
Cause where safe
Retry action
Appropriate visual feedback
Controlled error animation
Recovery confirmation
Do not use animation to hide failures.
The UI must honestly represent backend state.

SCROLL & SURFACE BEHAVIOR
Use subtle scroll-driven changes where they improve hierarchy:
Header compression
Sticky navigation elevation
Glass transformation
Section reveal
Progressive content appearance
Do not hijack native scrolling.
Do not create unnecessary scroll-jacking effects.

MOBILE PERFORMANCE
Every animation and visual effect must first pass at 390px.
Prioritize:
Smooth scrolling
Fast interaction
Low GPU usage
Minimal layout shift
Efficient rendering
Optimized images
Lazy-loaded heavy visuals
Minimal unnecessary DOM complexity
Be especially careful with:
backdrop-filter
Large blur areas
Continuous animations
3D transforms
Parallax
Animated shadows
Large SVG animations
WebGL
Premium means smooth — not maximum effects.

REDUCED MOTION
Support:
prefers-reduced-motion
When enabled:
Reduce parallax
Reduce 3D movement
Reduce large transforms
Reduce decorative animation
Preserve essential state feedback
Accessibility always takes priority over decorative motion.

VISUAL HIERARCHY
Not every element should receive the same treatment.
Primary
Strongest visual treatment:
Main CTA
Check-in/out
Important dashboard metrics
Critical status
Major success/error states
Secondary
Moderate treatment:
Cards
Filters
Navigation
Supporting actions
Tertiary
Minimal treatment:
Metadata
Secondary information
Supporting controls
Visual silence is also part of premium design.
If everything glows, floats, animates and uses glass, nothing feels important.

STRICTLY AVOID EFFECT SPAM
Do not introduce:
Random gradients
Random glow
Excessive glass
Excessive blur
Constant floating
Infinite rotation
Excessive parallax
Random 3D cards
Every button bouncing
Every card lifting
Every section animating independently
Long cinematic transitions
Effects that delay interaction
Effects that compromise accessibility
Effects that compromise mobile performance
The goal is not:
"Add more effects."
The goal is:
"Make every important interaction feel intentional, premium and alive."

REUSABLE VISUAL PRIMITIVES
Where appropriate, create reusable primitives for:
Elevation
Glass surfaces
Motion
Page transitions
Shared elements
Animated cards
Animated values
Pressable controls
Bottom sheets
Modals
Loading transitions
Success transitions
Error transitions
3D/depth elements
Do not implement 24 separate versions of the same visual behavior.

CREATIVE BOUNDARY
The UI team can innovate inside the AttendX visual system.
The following are fixed:
Mobile-first
UI-first
Neumorphic foundation
Selective glassmorphism
Consistent top-left lighting
Controlled 3D
Shared animation language
Tenant-token-driven branding
Accessibility
Performance
Production usability
Do not replace this direction with another visual trend.
Any new visual effect must answer:
Does it improve the experience?
Does it fit AttendX?
Does it work at 390px?
Does it work in dark mode?
Is it accessible?
Is it performant?
Can it be reused consistently?
If not, do not add it.

DARK MODE
Dark mode is a first-class design requirement.
Do not simply invert light mode.
For every screen:
Re-derive shadow pairs.
Verify depth.
Verify glass.
Verify borders.
Verify icons.
Verify text contrast.
Verify tenant accent.
Verify 3D elements.
Verify all interactive states.
Dark mode must be implemented alongside each screen, not after all 24 screens are finished.

SCREEN-BY-SCREEN EXECUTION
For every route:
1. Start at 390px
Audit:
Layout
Spacing
Typography
Navigation
Interactions
Overflow
Touch targets
Visual hierarchy
Missing states
2. Complete mobile UI
Use existing design-system primitives.
3. Complete all states
Loading → Empty → Error → Populated
4. Add motion and interaction
Verify:
Transitions
Micro-interactions
State changes
Appropriate depth/3D
Glass/neumorphic hierarchy
5. Verify dark mode
Immediately.
6. Test mobile interaction
Verify:
One-handed use
Touch
Scrolling
Keyboard
Sheets
Dialogs
Forms
Safe areas
Sticky elements
7. Expand
390px → Tablet → 1440px
Desktop must be an expansion of the completed mobile experience.
8. Compare related screens
Lists must feel like the same product.
Forms must feel like the same product.
Cards must feel like the same product.
Dialogs must feel like the same product.
Navigation must feel like the same product.
No screen should feel like it came from another application.

STRICT QUALITY RULE
Do not move forward because a screen "works."
Move forward only when the screen:
Looks production-ready
Works at 390px
Works in dark mode
Has complete applicable states
Has consistent motion
Has appropriate interactions
Uses the existing design system
Preserves tenant theming
Meets accessibility requirements
Has no unnecessary visual effects
Has no performance problems
Works at desktop widths
Functionality is the baseline. UI quality is the requirement.
If required backend/API/data functionality does not exist:
Do not fabricate it.
Identify:
What is missing
What API/data dependency is required
What can be completed independently

DEFINITION OF DONE
Real screenshots of EVERY ONE of the 24 routes showing:
390px mobile — REQUIRED
1440px desktop
Light mode
Dark mode
Loading where applicable
Empty where applicable
Error where applicable
Populated where applicable
Final acceptance criteria
Mobile-first implementation verified
UI-first implementation verified
390px is the primary design target
Desktop is responsive expansion of mobile
No desktop-first layouts adapted down to mobile
Existing design system preserved and extended
Neumorphism consistently applied
Glassmorphism used selectively and intentionally
Consistent elevation and top-left lighting
Controlled 3D/depth where appropriate
Shared animation system
Consistent transitions
Meaningful micro-interactions
State/value animations where appropriate
Dark mode fully designed
Accessibility verified
44×44px touch targets
Pinch-to-zoom enabled
No horizontal overflow at 390px
Loading/empty/error/populated states complete
No placeholder or unfinished screens
No fabricated data
No fake success states
Mobile performance verified
Reduced-motion behavior supported

FINAL STANDARD
A reviewer must NOT be able to tell which screen was built first and which screen was built last.
The entire application must feel like one premium product designed mobile-first — not 24 separate screens that were made responsive afterward.
The final experience should feel dimensional, tactile, alive and premium, but never excessive, gimmicky or slow.
Premium quality comes from consistency, depth, motion, hierarchy and restraint — not from adding effects everywhere.

Repo & Environments
Repo: https://github.com/saastadev/AttendX.git
Live: https://attendx-86y5.onrender.com
Stack: Next.js 16 (Turbopack, proxy.ts not middleware.ts) · React 19 · Supabase · Postgres RLS
IMPORTANT: Read node_modules/next/dist/docs/ before writing Next.js code — Next.js 16 differs from most training data.

Branch Naming
<type>/<area>-<short-slug>
Example: feat/ui-admin-dashboard
Types: feat · fix · refactor · perf · test · chore · docs
Areas: ui · api · db · ai · infra

PR Title
<type>(<area>): <imperative summary>
Example: feat(ui): elevate admin dashboard experience

PR Description — Required Sections
What & Why
Screenshots / Evidence
Real output, real screenshots. NOT "should work".
Schema or API Changes
How to Test
Exact commands
Risk & Rollback
Checklist
npx next build passes
Typecheck + lint pass
RLS isolation tested as EMPLOYEE and ADMIN, and cross-tenant
No secrets in client bundle
Loading / empty / error / populated states all handled
Works on 390px mobile
Light and dark mode verified
Motion and transitions verified
No unnecessary performance-heavy effects
Accessibility verified
PRs over ~400 lines get split. Every PR links its task ID.

Non-Negotiable Engineering Rules
1. NO FABRICATION
This codebase previously shipped an auth bypass that granted SUPERADMIN on failed login, and two test suites that passed for the wrong reason.
If something is broken, say so. Never add a fallback that fakes success.
2. Tenant Isolation
Tenant ID is ALWAYS derived server-side from the session.
Never derive it from:
Request body
Query parameter
Client state
This is the multi-tenancy boundary.
3. Negative Tests Need Positive Controls
Every negative test needs a positive control.
"Sees 0 rows of other tenant" is meaningless unless you also prove:
"Sees N rows of own tenant."
4. Service Role Key
SUPABASE_SERVICE_ROLE_KEY never reaches the browser.
