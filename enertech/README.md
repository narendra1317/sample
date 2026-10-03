# EnerTech Synergies website

The redesigned website for EnerTech Synergies Ltd. It is a fast, accessible static site
with a small PHP contact form handler. No frameworks or build dependencies.

See **[DESIGN-NOTES.md](DESIGN-NOTES.md)** for the competitor research, design rationale and
open questions for review.

## Structure

```
enertech/
├── build.mjs            # zero-dependency builder (Node 18+)
├── src/
│   ├── partials/        # layout, header, footer, CTA band
│   └── pages/           # page bodies, each with a <!--meta {...} --> JSON header
└── site/                # ⇦ deploy this folder (generated HTML + static assets)
    ├── assets/css/styles.css
    ├── assets/js/main.js
    ├── assets/img/      # optimised WebP images
    ├── assets/logos/
    ├── contact.php      # form handler (PHP 8.1+)
    ├── .htaccess        # 301s from old URLs, security headers, caching
    ├── robots.txt, sitemap.xml, 404.html
```

## Editing content

1. Edit the page in `src/pages/` (or a shared partial in `src/partials/`).
2. Run `node build.mjs`. This regenerates the HTML in `site/` and `sitemap.xml`.
3. CSS and JS are edited directly in `site/assets/`.

Template tokens: `{{root}}` (relative path to the site root), `{{icon:name}}` (inline SVG
from `build.mjs`), and `<!-- @include cta -->` (include a partial).

## Preview locally

```bash
node build.mjs
php -S localhost:8000 -t site      # or: npx serve site
```

## Deploy

Upload the contents of `site/` to the web root (Apache + PHP 8.1+). Then:

- Set `RECIPIENT` and `FROM_ADDRESS` in `contact.php`. The from-address must be a mailbox on the
  domain with SPF/DKIM configured. For reliable delivery, replace `mail()` with SMTP
  (e.g. PHPMailer + Microsoft 365).
- `contact.php` keeps a small rate-limit folder at `../.form-rate` (outside the web root). Make sure
  that path is writable, or change `RATE_DIR`.
- Check the old-URL redirects in `.htaccess` once the site is live.
