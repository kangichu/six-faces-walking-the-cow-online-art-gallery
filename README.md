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
├── dist/          # Gallery frontend (index.html + assets)
├── admin/         # Admin panel (index.html, script.js, style.css)
└── server/        # Flask backend
    ├── app.py
    ├── data.json  # Gallery entries
    ├── uploads/   # Uploaded images (gitignored)
    └── users.json # Admin credentials (gitignored)
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
- Upload images or link external URLs
- Change your password from the header

## Security

- JWT authentication with an auto-generated 256-bit secret (stored in `server/.jwt_secret`, gitignored)
- Rate limiting on login: 10 requests/minute, 30 requests/hour per IP
- Account lockout after 5 consecutive failures (15-minute cooldown)
- Timing-safe login to prevent username enumeration
- bcrypt password hashing

## First-time setup

On first run, `server/.jwt_secret` is generated automatically. To set your admin password, edit `server/users.json`:

```json
[
  {
    "username": "admin",
    "password_hash": "<bcrypt hash>"
  }
]
```

Generate a hash:

```bash
python -c "import bcrypt; print(bcrypt.hashpw(b'yourpassword', bcrypt.gensalt()).decode())"
```

## License

See [LICENSE.txt](LICENSE.txt).