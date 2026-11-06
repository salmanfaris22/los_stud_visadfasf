# Transit UI redesign (2026-11-05)

## Why
The old UI was the stock dark shadcn look with indigo→fuchsia gradients. It read as a template.
Jeffry wants a unique, more advanced, Dribbble-quality look that the client finds attractive.
He picked **Transit map** and **light mode by default** (dark toggle stays).

## Concept
The academy is a transit network.
- Every course is a **line** with its own colour and a round **line badge** (initials), like metro line bullets.
- Lessons are **stations**. The certificate is the **last stop**.
- A learner always sees where they are on each line and what the next stop is.
- Live classes read like a **departures board** (time first, status on the right).
The line drawing is the one bold element. Everything around it stays quiet: white signage, ink text, one yellow for actions.

## Tokens
| Token | Light ("day") | Dark ("night service") |
|---|---|---|
| background | #F4F5F7 | #0E1424 |
| card | #FFFFFF | #151C2F |
| ink / foreground | #15171E | #EDF0F7 |
| muted text | #5E6470 | #98A1B8 |
| primary (pencil yellow, fills only) | #FFC72C | #FFCB3D |
| primary foreground | ink | ink |
| focus ring | ink | yellow |

Line colours (course palette): red #E5372C, blue #1F6FEB, green #10A35A, orange #F07C1B, purple #8B55E0, teal #0EA5A0, pink #E2489C, sky #28A9E1.
A course's colour comes from a hash of its id, so it is the same on every page.

Yellow is never used for text on light backgrounds; `text-primary` resolves to a readable ink/amber in light mode.

## Type
Mona Sans (variable, `wdth` 75–125). Headings use the **Expanded** width (125) at 700–800 with tight tracking.
Body and UI use normal width at 400–600. Numbers use tabular figures. Sentence case everywhere, no all-caps labels.

## Shape
Radius has hierarchy: page sections 28px, cards 20px, inputs 12px, buttons are pills.
Soft two-layer shadows in light mode; borders carry depth in dark mode.

## Surfaces
- **Website**: hero headline + an animated route (Watch → Build → Get reviewed → Certified) that draws once on load.
  Courses show as lines. How-it-works is a real sequence, so it is drawn as numbered stations. Yellow CTA block, ink footer.
- **Student portal**: sidebar with a sliding active marker, ⌘K search, mobile bottom bar.
  Home = greeting, "Next stop" card, task counters, "Your lines" (one track per course, filled to progress), departures.
  Course page = line map from the real playlist + vertical route list. Watch page = dark stage player + route playlist.
- **Admin**: ink "control room" sidebar, ⌘K command menu, dashboard bento (review queue first, KPI tiles,
  activity chart, departures, course lines filled to average progress).
- **Auth**: form on the left, an animated route map on the right.

## Motion
One orchestrated moment per surface (hero route draw, line fills on the portal home).
Motion that answers an action (nav marker slide, dialogs) is fine. Reduced motion shows the final state.

## Approaches considered
| Approach | Trade-off | Picked |
|---|---|---|
| Restyle shared kit + rebuild key screens by hand | Every page changes, features keep working, no backend change | ✅ |
| Rebuild all ~45 pages one by one | Slowest, highest risk of breaking flows | |
| Swap to a new component library | Big churn for no visual gain | |

## Builder's calls
- No backend/API changes. Only real API data is shown (no invented stats).
- CMS `primary_color` still overrides the yellow; its text colour is picked for contrast automatically.
- e2e selectors are kept where possible; tests that check old copy are updated.
