# Six Faces / Walking The Cow

A scroll-driven 3D CSS cube gallery with a Flask backend and password-protected admin panel.

Original CodePen: [https://codepen.io/luis-lessrain/pen/ZYpyoRV](https://codepen.io/luis-lessrain/pen/ZYpyoRV)

---

As you scroll down the page the cube rotates through six faces. Each face holds an image from an experiment in reverse creativity — asking AI to work against itself, break composition rules, and leave the mistakes in place.

The technical part is just the container. The frame on the wall.

For Daniel Johnston, who walked the cow first.

---

## Structure

```
├── dist/              # Gallery frontend (index.html, script.js, style.css)
├── admin/             # Admin panel (index.html, script.js, style.css)
└── server/            # Flask backend
    ├── app.py
    ├── data.json      # Gallery entries
    ├── settings.json  # Site settings — title, meta, OG (gitignored)
    ├── uploads/       # Uploaded images (gitignored)
    └── users.json     # Admin credentials (gitignored)
```

## Running locally

**Requirements:** Python 3.11+

```bash
cd server
pip install -r requirements.txt
python app.py
```

The gallery is served at `http://localhost:5000` and the admin panel at `http://localhost:5000/admin`.

## Admin panel

- Log in at `/admin` with your credentials
- Manage up to 6 **main** faces (always shown) and an unlimited **random pool**
- Upload images or link external URLs per entry
- **Site Settings** — edit the page title, meta description, Open Graph image, canonical URL, and Twitter card type; changes apply on the next gallery page load
- **Change Password** — update your admin password without touching the server

## SEO & meta tags

The gallery `<head>` includes a full set of tags populated dynamically from the settings stored on the server:

| Tag | Purpose |
|-----|---------|
| `<title>` | Browser tab / search result title |
| `meta description` | Search engine snippet |
| `og:title`, `og:description`, `og:image`, `og:url` | Facebook / LinkedIn previews |
| `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image` | Twitter / X cards |
| `<link rel="canonical">` | Canonical URL for SEO deduplication |

All values are fetched from `GET /api/settings` at page load alongside the gallery entries.

## Security

- JWT authentication with an auto-generated 256-bit secret (stored in `server/.jwt_secret`, gitignored)
- Rate limiting on login: 10 requests/minute, 30 requests/hour per IP
- Account lockout after 5 consecutive failures (15-minute cooldown)
- Timing-safe login to prevent username enumeration
- bcrypt password hashing; password change enforces a 10-character minimum

## First-time setup

On first run `server/.jwt_secret` is generated automatically and a default account is created:

| Username | Password  |
|----------|-----------|
| `admin`  | `admin123` |

**Change the password immediately** via the admin panel (header → Change Password).

To set a password manually, generate a bcrypt hash and write it to `server/users.json`:

```bash
python -c "import bcrypt; print(bcrypt.hashpw(b'yourpassword', bcrypt.gensalt()).decode())"
```

```json
[{ "username": "admin", "password_hash": "<hash from above>" }]
```

## License

See [LICENSE.txt](LICENSE.txt).