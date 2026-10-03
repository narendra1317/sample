# EnerTech Synergies website redesign: design notes for review

Prepared for review by the EnerTech team. This document covers the competitor research,
the design direction, the content changes and the decisions we need from you.

---

## 1. Competitor research (12 sites)

| # | Company | HQ | What works (adopted) | What to avoid |
|---|---------|----|----------------------|---------------|
| 1 | **IDEA Ltd** (idea-ltd.co.uk) | Glasgow | Clear sector/service menus; "Start a conversation" CTA in the header; service cards with concrete bullets; a "we support clients where projects involve…" checklist | Grey placeholder hero; light-weight type loses impact |
| 2 | **Fugro** | Leiden | Full-bleed photo hero with a short, confident headline; two-column "label · paragraph" section intros; "Jump to" in-page nav; restrained palette with one accent | Investor content not relevant to an SME |
| 3 | **Xodus Group** | Aberdeen | Bold, purpose-led statement; strong brand colour use | All-caps headings hurt readability; insight tiles feel busy |
| 4 | **Kent** | London | Numbers band (employees, countries, projects); service list with arrow affordances; split image/text blocks | Heavy imagery slows the page |
| 5 | **Worley** | Sydney | Numbered lifecycle (Strategy → Engineering → Execution → Operate); project cards with tags; "Talk to a delivery expert" band | Cookie modal dominates first visit |
| 6 | **Arup** | London | Editorial serif headlines; Markets / Services / Projects / Insights information architecture | Very image- and content-heavy, which is hard for an SME to sustain |
| 7 | **Ramboll** | Copenhagen | Calm whitespace; insight-led storytelling | Little evidence of delivery on the home page |
| 8 | **Aker Solutions** | Oslo | Clean editorial layout; newsletter capture; footer stats | Carousel hero hides key messages |
| 9 | **Genesis (Technip Energies)** | London | Award badge as instant credibility; market list as a navigation device | Dated carousel and pagination |
| 10 | **AtkinsRéalis** | Montréal | Project stats (e.g. 480 / 1920 / 30) make work tangible | Neon palette is off-brand for an energy SME |
| 11 | **Aquaterra Energy** | Norwich | **The closest SME benchmark:** stats strip under the hero, accreditation logo wall, leadership team, contact form with office tabs | Angled shapes date quickly |
| 12 | **Petrofac** | London | Big headline number (1,800+ employees) | Overlapping hero text and a cluttered nav |

*(Subsea7 was also reviewed, but its site blocks automated capture.)*

### Patterns that build trust on high-performing B2B engineering sites
1. **Say what you do in under 10 words** in the hero, with a direct CTA to talk to an engineer.
2. **Proof immediately below the fold:** years, people, disciplines, certification.
3. **Sectors as the primary navigation**, each with its own page (better for SEO).
4. **Evidence over adjectives:** projects with scope, location and discipline, even when the client is confidential.
5. **Accreditation and membership logos** grouped and labelled (ISO, ICE, IStructE, OEUK…).
6. **Real people and real photos** rather than stock.
7. **One clear conversion path** on every page (CTA band, plus phone and email always visible).

---

## 2. Design direction: "Engineered clarity"

- **Palette from your logo.** Globe navy `#161a4e`, wordmark blue `#116d99`, plus the logo's
  green→teal→blue gradient used sparingly as a signature line (nav underline, card hover,
  section labels, footer bar). The logo stays on white, because its tagline doesn't read on dark backgrounds.
- **Typography.** Inter Tight (headlines), Inter (body) and IBM Plex Mono for small technical
  labels (section numbers, project title blocks). This gives a quiet engineering-drawing feel.
- **Signature details.** A faint blueprint grid on dark sections, and project cards styled like
  drawing title blocks (Client / Location / Discipline), using EnerTech's own lifting and
  structural drawings as artwork.
- **Accessibility.** AA contrast, keyboard-navigable menus, skip link, visible focus states, and
  reduced-motion support.
- **Performance.** No frameworks; about 13 KB of CSS and JS when compressed; WebP images (2.5 MB in total across the site);
  lazy loading; explicit image sizes to avoid layout shift.

---

## 3. Information architecture

| Old site | New site |
|---|---|
| Home (sector blurbs repeated 3×) | **Home**: hero → stats → who we are → 6 sectors → lifecycle → 9 disciplines → projects → digital partners → testimonial → accreditations → news → CTA |
| 6 sector pages (repeated CSR text on 3 of them) | **6 sector pages** + sectors overview, each with on-page nav, services, relevant projects and related sectors |
| About, Values, Meet the Team, CSR, Careers | **About** (story, milestones, MD message, vision & mission, PASSION values, team, associations), **Sustainability & community**, **Careers** |
| Projects Gallery (placeholder images, broken case studies) | **Projects** (filterable cards + scope register) |
| — | **Capabilities** (9 disciplines, services, software, quality) |
| News, Contact | **News** (featured + archive), **Contact** (validated form, map, details) |

Old URLs (`oilgas.php`, `aboutus.php`, …) are **301-redirected** to the new pages in `.htaccess`
so existing Google rankings and links are preserved.

---

## 4. Content improvements made

- Removed the triple repetition on the home page, and the CSR text that was pasted onto
  Oil & Gas, Green Technologies and Digital.
- Corrected typos and inconsistencies: "REnerTech", "ASKELOS" → Akselos, "Assest", "FABRICTORS",
  "Chartered ship", "Navis Manager" → Navisworks Manage, and "regional offices across the UK"
  (only Aberdeen is listed).
- Updated "Green Sustainable Technologies" to **Energy Transition** and "Skilled Workforce Placements" to
  **Workforce Solutions** (these are the terms buyers search for). The original names are kept as sub-labels.
- Turned the long "Design & Engineering" bullet list into individual project cards and a scope register.
- Added a milestones timeline built from your news posts.
- Rewrote copy in plain British English with shorter sentences and active voice.

### Issues found on the current live site (fixed by the redesign)
- Featured case studies (Hydrogen Village Trial, Pembrokeshire Demonstration Zone, System
  Evaluation Life Extension) **return "Not Found"**.
- Several project gallery items show a **"no image"** placeholder.
- The LinkedIn link points to **"rag-engineers-ltd"**, and image file names reference "RAG", which look like leftovers
  from a previous template.
- One news article (Onshape, 3 Mar 2025) ends with **"Lorem ipsum"** placeholder text.
- Four photos are iStock previews that still carry the **iStock watermark** (not used in the redesign).
- The footer copyright says © 2025 (the new footer updates automatically).

---

## 5. Decisions needed from EnerTech

1. **LinkedIn URL.** Please confirm the company page (a placeholder is currently used).
2. **Projects.** Can we name any clients, or add numbers (tonnage, schedule, duration)? Are there any
   site photos we can use? Specific numbers are the biggest trust lever we can add.
3. **Pembrokeshire, Hydrogen Village and SELE projects.** Are these genuine EnerTech projects? They are
   excluded until confirmed.
4. **Team.** We'd like headshots, names and roles for 4–6 leaders, replacing the organogram image.
5. **Testimonials.** Can you get 2–3 more client quotes, with permission?
6. **Photo licences.** Please confirm licences for the stock photos carried over from the current site
   (hero offshore platform, sector images).
7. **Stats.** "20+ people" and "9 disciplines" are taken from the current site; please confirm or update them.
8. **Response-time promise.** Would you commit to something like "We reply within one working day"?
   It is a strong conversion booster.
9. **Hosting and email.** Please confirm the hosting is Apache/PHP 8.1+ and give us an address the contact form can send from
   (SPF/DKIM). We recommend SMTP via Microsoft 365.
10. **Legal pages.** Privacy, cookies and terms currently link to the existing pages; we'll migrate them once
    the wording is confirmed.

## 6. Suggested next phase
- Case study detail pages (challenge → solution → outcome, with photos and numbers).
- An Insights section (technical articles on decarbonisation, LCOH and life extension) for SEO.
- An embedded 3D or point-cloud viewer on the Laser Scanning page (e.g. a NavVis IVION share link or
  a `<model-viewer>` GLB) to show the capability live.
- Analytics (privacy-friendly, e.g. Plausible) and a cookie banner if any tracking is added.
- An optional headless CMS (e.g. Decap) so the team can post news without a developer.
