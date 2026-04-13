import os
import json
import uuid
import time
import random as _rand
import secrets
import bcrypt
from datetime import datetime, timedelta, timezone

BUILD_ID = str(int(time.time()))
from flask import Flask, request, jsonify, send_from_directory, redirect
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager, create_access_token, jwt_required, get_jwt_identity
)
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# ── paths ─────────────────────────────────────────────────────────────────────
BASE_DIR      = os.path.dirname(os.path.abspath(__file__))
DIST_DIR      = os.path.abspath(os.path.join(BASE_DIR, '..', 'dist'))
ADMIN_DIR     = os.path.abspath(os.path.join(BASE_DIR, '..', 'admin'))
UPLOAD_DIR    = os.path.join(BASE_DIR, 'uploads')
DATA_FILE     = os.path.join(BASE_DIR, 'data.json')
USERS_FILE    = os.path.join(BASE_DIR, 'users.json')
SETTINGS_FILE = os.path.join(BASE_DIR, 'settings.json')

os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {'webp', 'jpg', 'jpeg', 'png', 'gif'}
MAX_FILE_BYTES     = 10 * 1024 * 1024  # 10 MB
MAX_MAIN           = 6  # max "main" (always-shown) entries
MAX_FAILED_ATTEMPTS = 5   # lock account after this many consecutive failures
LOCKOUT_MINUTES     = 15  # duration of lockout

# ── persistent JWT secret ─────────────────────────────────────────────────────
# Generate once on first run and store locally; never fall back to a
# hard-coded string so the secret cannot be guessed if the env var is missing.
SECRET_FILE = os.path.join(BASE_DIR, '.jwt_secret')
def _load_or_create_secret():
    env_secret = os.environ.get('JWT_SECRET', '').strip()
    if env_secret and len(env_secret) >= 32:
        return env_secret
    if os.path.exists(SECRET_FILE):
        with open(SECRET_FILE, 'r') as f:
            val = f.read().strip()
        if val:
            return val
    val = secrets.token_hex(32)   # 256-bit random secret
    with open(SECRET_FILE, 'w') as f:
        f.write(val)
    print('[info] Generated new JWT secret →', SECRET_FILE)
    return val

# ── app ───────────────────────────────────────────────────────────────────────
app = Flask(__name__)
app.config['JWT_SECRET_KEY']           = _load_or_create_secret()
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=8)
app.config['MAX_CONTENT_LENGTH']       = MAX_FILE_BYTES

CORS(app, resources={r'/api/*': {'origins': '*'}})
jwt     = JWTManager(app)
limiter = Limiter(
    key_func=get_remote_address,
    app=app,
    default_limits=[],          # no global limit; apply per-route
    storage_uri='memory://',
)

# ── data helpers ──────────────────────────────────────────────────────────────
def load_data():
    if not os.path.exists(DATA_FILE):
        return []
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_data(data):
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def load_users():
    if not os.path.exists(USERS_FILE):
        return []
    with open(USERS_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_users(users):
    with open(USERS_FILE, 'w', encoding='utf-8') as f:
        json.dump(users, f, indent=2, ensure_ascii=False)

def seed_users():
    """Create default admin/admin123 on first run."""
    if not os.path.exists(USERS_FILE) or not load_users():
        hashed = bcrypt.hashpw(b'admin123', bcrypt.gensalt()).decode('utf-8')
        save_users([{'username': 'admin', 'password_hash': hashed}])
        print('[info] Seeded default user  admin / admin123')

def allowed_file(filename):
    return (
        '.' in filename
        and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS
    )

def safe_delete_image(filename):
    if not filename:
        return
    path = os.path.join(UPLOAD_DIR, os.path.basename(filename))
    try:
        if os.path.isfile(path):
            os.remove(path)
    except OSError:
        pass

def save_upload(file):
    ext      = file.filename.rsplit('.', 1)[1].lower()
    filename = f'{uuid.uuid4().hex}.{ext}'
    file.save(os.path.join(UPLOAD_DIR, filename))
    return filename

_DEFAULT_SETTINGS = {
    'site_title':       'Six Faces / Walking The Cow',
    'meta_description': 'A scroll-driven 3D cube that rotates through six faces as you move down the page.',
    'og_image':         '',
    'canonical_url':    '',
    'twitter_card':     'summary_large_image',
    # About / credit modal
    'about_label':      'Original concept',
    'about_title':      'Six Faces /\nWalking The Cow',
    'about_body':       'This gallery is built on a scroll-driven 3D CSS cube originally created by Luis Martinez on CodePen as part of the Reverse Creativity experiment — asking AI to work against itself, break composition rules, and leave the mistakes in place.\n\nFor Daniel Johnston, who walked the cow first.',
    'about_link_1_text': 'View on GitHub →',
    'about_link_1_url':  'https://github.com/kangichu/six-faces-walking-the-cow-online-art-gallery',
    'about_link_1_show': True,
    'about_link_2_text': 'Original CodePen →',
    'about_link_2_url':  'https://codepen.io/luis-lessrain/pen/ZYpyoRV',
    'about_link_2_show': True,
    'about_link_3_text': 'Reverse Creativity post →',
    'about_link_3_url':  'https://www.linkedin.com/posts/luis-martinez-lr_ai-creativity-reversecreativity-activity-7366853269517651970-zeUD',
    'about_link_3_show': True,
}

def load_settings():
    if not os.path.exists(SETTINGS_FILE):
        return dict(_DEFAULT_SETTINGS)
    with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
        stored = json.load(f)
    # Merge with defaults so new keys are always present
    return {**_DEFAULT_SETTINGS, **stored}

def save_settings(settings):
    with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
        json.dump(settings, f, indent=2, ensure_ascii=False)

# ── auth ──────────────────────────────────────────────────────────────────────
@app.route('/api/auth/login', methods=['POST'])
@limiter.limit('10 per minute; 30 per hour')
def login():
    body     = request.get_json(silent=True) or {}
    username = str(body.get('username', '')).strip()
    password = str(body.get('password', ''))

    if not username or not password:
        return jsonify({'error': 'Missing credentials'}), 400

    users = load_users()
    user  = next((u for u in users if u['username'] == username), None)

    # Always run password check to avoid timing-based username enumeration
    _dummy_hash = '$2b$12$placeholderthatnevermatchesXXXXXXXXXXXXXXXXXXXXXXXXX'
    check_hash  = user['password_hash'] if user else _dummy_hash

    # Check lockout before verifying password
    now = datetime.now(timezone.utc)
    if user:
        locked_until = user.get('locked_until')
        if locked_until:
            locked_dt = datetime.fromisoformat(locked_until)
            if now < locked_dt:
                remaining = int((locked_dt - now).total_seconds() // 60) + 1
                return jsonify({
                    'error': f'Account locked. Try again in {remaining} minute(s).'
                }), 429

    password_ok = bcrypt.checkpw(password.encode(), check_hash.encode())

    if not user or not password_ok:
        # Increment failed attempt counter
        if user:
            user['failed_attempts'] = user.get('failed_attempts', 0) + 1
            if user['failed_attempts'] >= MAX_FAILED_ATTEMPTS:
                user['locked_until'] = (
                    now + timedelta(minutes=LOCKOUT_MINUTES)
                ).isoformat()
                user['failed_attempts'] = 0
            save_users(users)
        return jsonify({'error': 'Invalid credentials'}), 401

    # Successful login — reset counters
    user['failed_attempts'] = 0
    user['locked_until']    = None
    save_users(users)

    token = create_access_token(identity=username)
    return jsonify({'access_token': token}), 200


@app.route('/api/auth/change-password', methods=['POST'])
@jwt_required()
def change_password():
    current_user = get_jwt_identity()
    body = request.get_json(silent=True) or {}
    current_pw  = str(body.get('current_password', ''))
    new_pw      = str(body.get('new_password', ''))

    if not current_pw or not new_pw:
        return jsonify({'error': 'Missing fields'}), 400
    if len(new_pw) < 10:
        return jsonify({'error': 'New password must be at least 10 characters'}), 400
    if current_pw == new_pw:
        return jsonify({'error': 'New password must differ from current'}), 400

    users = load_users()
    user  = next((u for u in users if u['username'] == current_user), None)
    if not user or not bcrypt.checkpw(current_pw.encode(), user['password_hash'].encode()):
        return jsonify({'error': 'Current password is incorrect'}), 403

    user['password_hash'] = bcrypt.hashpw(new_pw.encode(), bcrypt.gensalt()).decode('utf-8')
    save_users(users)
    return jsonify({'ok': True}), 200

# ── entries ───────────────────────────────────────────────────────────────────
@app.route('/api/entries', methods=['GET'])
def get_entries():
    data = sorted(load_data(), key=lambda e: e.get('order', 0))
    return jsonify(data), 200

@app.route('/api/gallery', methods=['GET'])
def get_gallery():
    """Returns the resolved set the gallery displays: all main entries (sorted)
    plus randomly-sampled pool entries to fill up to MAX_MAIN faces."""
    data      = load_data()
    main      = sorted([e for e in data if e.get('type', 'main') == 'main'],
                       key=lambda e: e.get('order', 0))
    pool      = [e for e in data if e.get('type', 'main') == 'random']
    remaining = max(0, MAX_MAIN - len(main))
    chosen    = _rand.sample(pool, min(remaining, len(pool))) if pool else []
    return jsonify(main + chosen), 200

@app.route('/api/entries', methods=['POST'])
@jwt_required()
def create_entry():
    data       = load_data()
    entry_type = request.form.get('type', 'main').strip()
    if entry_type not in ('main', 'random'):
        entry_type = 'main'

    if entry_type == 'main':
        main_count = sum(1 for e in data if e.get('type', 'main') == 'main')
        if main_count >= MAX_MAIN:
            return jsonify({'error': f'Maximum of {MAX_MAIN} main entries reached'}), 400
        order = main_count
    else:
        pool_count = sum(1 for e in data if e.get('type', 'main') == 'random')
        order      = pool_count

    image_filename = None
    image_url      = None
    file = request.files.get('image')
    if file and file.filename and allowed_file(file.filename):
        image_filename = save_upload(file)
    else:
        raw_url = request.form.get('image_url', '').strip()
        # Only accept http/https URLs to prevent javascript: injection
        if raw_url and raw_url.startswith(('http://', 'https://')):
            image_url = raw_url

    entry = {
        'id':             uuid.uuid4().hex,
        'order':          order,
        'type':           entry_type,
        'face_name':      request.form.get('face_name', '').strip(),
        'tag':            request.form.get('tag', '').strip(),
        'heading':        request.form.get('heading', '').strip(),
        'body':           request.form.get('body', '').strip(),
        'align':          request.form.get('align', 'left').strip(),
        'image_filename': image_filename,
        'image_url':      image_url,
        'pane_side':      request.form.get('pane_side', 'left').strip(),
        'pane_title':     request.form.get('pane_title', '').strip(),
        'pane_body':      request.form.get('pane_body', '').strip(),
        'pane_images':    [],
    }
    data.append(entry)
    save_data(data)
    return jsonify(entry), 201

@app.route('/api/entries/<entry_id>', methods=['PUT'])
@jwt_required()
def update_entry(entry_id):
    data  = load_data()
    entry = next((e for e in data if e['id'] == entry_id), None)
    if not entry:
        return jsonify({'error': 'Not found'}), 404

    body = request.get_json(silent=True) or {}
    for field in ('face_name', 'tag', 'heading', 'body', 'align', 'pane_side', 'pane_title', 'pane_body'):
        if field in body:
            entry[field] = str(body[field]).strip()

    if 'type' in body:
        new_type = str(body['type']).strip()
        if new_type in ('main', 'random'):
            old_type = entry.get('type', 'main')
            if new_type == 'main' and old_type != 'main':
                main_count = sum(1 for e in data
                                 if e.get('type', 'main') == 'main' and e['id'] != entry_id)
                if main_count >= MAX_MAIN:
                    return jsonify({'error': f'Maximum of {MAX_MAIN} main entries already reached'}), 400
                # Append as last main entry
                entry['order'] = main_count
            entry['type'] = new_type

    if 'image_url' in body:
        raw_url = str(body['image_url']).strip()
        if raw_url and raw_url.startswith(('http://', 'https://')):
            entry['image_url']      = raw_url
            entry['image_filename'] = None  # clear any local file ref
        else:
            entry['image_url'] = None

    save_data(data)
    return jsonify(entry), 200

@app.route('/api/entries/<entry_id>/image', methods=['POST'])
@jwt_required()
def update_entry_image(entry_id):
    data  = load_data()
    entry = next((e for e in data if e['id'] == entry_id), None)
    if not entry:
        return jsonify({'error': 'Not found'}), 404

    file = request.files.get('image')
    if not file or not file.filename or not allowed_file(file.filename):
        return jsonify({'error': 'Invalid or missing image file'}), 400

    safe_delete_image(entry.get('image_filename'))
    entry['image_filename'] = save_upload(file)
    entry['image_url']      = None  # clear any external URL
    save_data(data)
    return jsonify(entry), 200

@app.route('/api/entries/reorder', methods=['POST'])
@jwt_required()
def reorder_entries():
    body        = request.get_json(silent=True) or {}
    ordered_ids = body.get('ids', [])
    data        = load_data()
    id_map      = {e['id']: e for e in data}

    # Update order only for the provided IDs — leaves non-provided entries untouched
    for i, eid in enumerate(ordered_ids):
        if eid in id_map:
            id_map[eid]['order'] = i

    save_data(list(id_map.values()))
    return jsonify(list(id_map.values())), 200

@app.route('/api/entries/<entry_id>', methods=['DELETE'])
@jwt_required()
def delete_entry(entry_id):
    data  = load_data()
    entry = next((e for e in data if e['id'] == entry_id), None)
    if not entry:
        return jsonify({'error': 'Not found'}), 404

    safe_delete_image(entry.get('image_filename'))
    data = [e for e in data if e['id'] != entry_id]
    # Re-index main and pool entries independently
    main_sorted = sorted([e for e in data if e.get('type', 'main') == 'main'],
                         key=lambda e: e.get('order', 0))
    pool_sorted = sorted([e for e in data if e.get('type', 'main') == 'random'],
                         key=lambda e: e.get('order', 0))
    for i, e in enumerate(main_sorted):
        e['order'] = i
    for i, e in enumerate(pool_sorted):
        e['order'] = i
    save_data(data)
    return jsonify({'ok': True}), 200

# ── pane images ──────────────────────────────────────────────────────────────
@app.route('/api/entries/<entry_id>/pane-images', methods=['POST'])
@jwt_required()
def add_pane_image(entry_id):
    data  = load_data()
    entry = next((e for e in data if e['id'] == entry_id), None)
    if not entry:
        return jsonify({'error': 'Not found'}), 404

    if 'pane_images' not in entry or not isinstance(entry['pane_images'], list):
        entry['pane_images'] = []

    img_entry = {'id': uuid.uuid4().hex}

    # Try multipart file upload first
    file = request.files.get('image')
    if file and file.filename and allowed_file(file.filename):
        img_entry['type']     = 'upload'
        img_entry['filename'] = save_upload(file)
    else:
        # Fall back to JSON body with a URL
        body    = request.get_json(silent=True) or {}
        raw_url = str(body.get('url', '')).strip()
        if raw_url and raw_url.startswith(('http://', 'https://')):
            img_entry['type'] = 'url'
            img_entry['src']  = raw_url
        else:
            return jsonify({'error': 'Provide a valid image file or an http/https URL'}), 400

    entry['pane_images'].append(img_entry)
    save_data(data)
    return jsonify(img_entry), 201


@app.route('/api/entries/<entry_id>/pane-images/<img_id>', methods=['DELETE'])
@jwt_required()
def delete_pane_image(entry_id, img_id):
    data  = load_data()
    entry = next((e for e in data if e['id'] == entry_id), None)
    if not entry:
        return jsonify({'error': 'Not found'}), 404

    images = entry.get('pane_images', [])
    img    = next((i for i in images if i['id'] == img_id), None)
    if not img:
        return jsonify({'error': 'Pane image not found'}), 404

    if img.get('type') == 'upload':
        safe_delete_image(img.get('filename'))

    entry['pane_images'] = [i for i in images if i['id'] != img_id]
    save_data(data)
    return jsonify({'ok': True}), 200


# ── site settings ────────────────────────────────────────────────────────────
@app.route('/api/settings', methods=['GET'])
def get_settings():
    return jsonify(load_settings()), 200

@app.route('/api/settings', methods=['PUT'])
@jwt_required()
def update_settings():
    body = request.get_json(silent=True) or {}
    settings = load_settings()

    if 'site_title' in body:
        val = str(body['site_title']).strip()
        if len(val) <= 100:
            settings['site_title'] = val

    if 'meta_description' in body:
        val = str(body['meta_description']).strip()
        if len(val) <= 500:
            settings['meta_description'] = val

    if 'og_image' in body:
        val = str(body['og_image']).strip()
        if not val or val.startswith(('http://', 'https://')):
            settings['og_image'] = val

    if 'canonical_url' in body:
        val = str(body['canonical_url']).strip()
        if not val or val.startswith(('http://', 'https://')):
            settings['canonical_url'] = val

    if 'twitter_card' in body:
        val = str(body['twitter_card']).strip()
        if val in ('summary', 'summary_large_image'):
            settings['twitter_card'] = val

    # About / credit modal fields
    if 'about_label' in body:
        val = str(body['about_label']).strip()
        if len(val) <= 80:
            settings['about_label'] = val

    if 'about_title' in body:
        val = str(body['about_title']).strip()
        if len(val) <= 120:
            settings['about_title'] = val

    if 'about_body' in body:
        val = str(body['about_body']).strip()
        if len(val) <= 1000:
            settings['about_body'] = val

    for key in ('about_link_1_text', 'about_link_2_text', 'about_link_3_text'):
        if key in body:
            val = str(body[key]).strip()
            if len(val) <= 80:
                settings[key] = val

    for key in ('about_link_1_url', 'about_link_2_url', 'about_link_3_url'):
        if key in body:
            val = str(body[key]).strip()
            if not val or val.startswith(('http://', 'https://')):
                settings[key] = val

    for key in ('about_link_1_show', 'about_link_2_show', 'about_link_3_show'):
        if key in body:
            settings[key] = bool(body[key])

    save_settings(settings)
    return jsonify(settings), 200

# ── uploads ───────────────────────────────────────────────────────────────────
@app.route('/uploads/<path:filename>')
def serve_upload(filename):
    # Prevent path traversal — only serve bare filenames
    safe = os.path.basename(filename)
    return send_from_directory(UPLOAD_DIR, safe)

# ── static serving ─────────────────────────────────────────────────────────────
@app.route('/admin')
def admin_redirect():
    return redirect('/admin/', code=301)

@app.route('/admin/', defaults={'path': 'index.html'})
@app.route('/admin/<path:path>')
def serve_admin(path):
    return send_from_directory(ADMIN_DIR, path)

@app.route('/', defaults={'path': 'index.html'})
@app.route('/<path:path>')
def serve_dist(path):
    if path == 'index.html':
        filepath = os.path.join(DIST_DIR, 'index.html')
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        content = content.replace('__BUILD_ID__', BUILD_ID)
        return content, 200, {'Content-Type': 'text/html; charset=utf-8'}
    return send_from_directory(DIST_DIR, path)

# ── entry point ───────────────────────────────────────────────────────────────
if __name__ == '__main__':
    seed_users()
    print(f'[info] Serving gallery from  {DIST_DIR}')
    print(f'[info] Serving admin from    {ADMIN_DIR}')
    print(f'[info] Uploads stored in     {UPLOAD_DIR}')
    app.run(host='0.0.0.0', port=5000, debug=True)
