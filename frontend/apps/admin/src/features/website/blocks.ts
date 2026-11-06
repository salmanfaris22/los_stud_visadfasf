/** Describes each editable landing-page block so one generic editor can render them all. */
export type FieldDef = { key: string; label: string; type?: "text" | "textarea" | "image" | "select"; options?: string[]; placeholder?: string };
export type BlockDef = { key: string; label: string; description: string; fields: FieldDef[]; list?: { key: string; label: string; fields: FieldDef[] } };

const ICONS = ["play", "check", "video", "chart", "award", "users", "book", "star", "rocket", "shield"];

export const BLOCKS: BlockDef[] = [
  { key: "hero", label: "Hero", description: "The first thing visitors see.", fields: [
    { key: "badge", label: "Badge" }, { key: "title", label: "Headline" }, { key: "highlight", label: "Highlighted word(s) in the headline" },
    { key: "subtitle", label: "Sub-headline", type: "textarea" }, { key: "cta_text", label: "Main button text" }, { key: "cta_link", label: "Main button link" },
    { key: "secondary_text", label: "Second button text" }, { key: "secondary_link", label: "Second button link" }, { key: "image_url", label: "Hero image (optional)", type: "image" },
  ] },
  { key: "stats", label: "Stats", description: "Animated counters under the hero.", fields: [], list: { key: "items", label: "Numbers", fields: [{ key: "value", label: "Value", placeholder: "12k+" }, { key: "label", label: "Label" }] } },
  { key: "features", label: "Features", description: "Why learn with you.", fields: [{ key: "title", label: "Section title" }], list: { key: "items", label: "Features", fields: [{ key: "icon", label: "Icon", type: "select", options: ICONS }, { key: "title", label: "Title" }, { key: "body", label: "Text", type: "textarea" }] } },
  { key: "how", label: "How it works", description: "Steps from enrolling to certificate.", fields: [{ key: "title", label: "Section title" }], list: { key: "steps", label: "Steps", fields: [{ key: "title", label: "Title" }, { key: "body", label: "Text", type: "textarea" }] } },
  { key: "testimonials", label: "Testimonials", description: "Scrolling student quotes.", fields: [], list: { key: "items", label: "Quotes", fields: [{ key: "name", label: "Name" }, { key: "role", label: "Role" }, { key: "quote", label: "Quote", type: "textarea" }, { key: "avatar_url", label: "Photo", type: "image" }] } },
  { key: "faqs", label: "FAQ", description: "Questions & answers accordion.", fields: [], list: { key: "items", label: "Questions", fields: [{ key: "q", label: "Question" }, { key: "a", label: "Answer", type: "textarea" }] } },
  { key: "cta", label: "Call to action", description: "Band before the footer.", fields: [{ key: "title", label: "Title" }, { key: "subtitle", label: "Text", type: "textarea" }, { key: "button_text", label: "Button text" }, { key: "button_link", label: "Button link" }] },
  { key: "footer", label: "Footer", description: "Contact details and links.", fields: [
    { key: "about", label: "About", type: "textarea" }, { key: "email", label: "Email" }, { key: "phone", label: "Phone" }, { key: "address", label: "Address" },
    { key: "instagram", label: "Instagram URL" }, { key: "youtube", label: "YouTube URL" }, { key: "linkedin", label: "LinkedIn URL" },
  ] },
];
