# Lam Kinh Cover API

Backend public cho tinh do che phu, NDVI va gia tri uoc tinh bang Microsoft Planetary Computer.

## Chay local

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\python pc_cover_api.py
```

Mac/Linux:

```bash
cd backend
python -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/python pc_cover_api.py
```

API mac dinh:

- `GET /health`
- `POST /api/cover`

## Deploy public

Nen deploy backend nay len mot dich vu ho tro Python process dai han nhu Render, Railway hoac Fly.io.
Dat bien moi truong:

- `PORT`: cong do nha cung cap gan, thuong tu co san.
- `HOST`: de mac dinh `0.0.0.0`.
- `ALLOWED_ORIGINS`: domain frontend Vercel, vi du `https://personal-project.vercel.app`.

Sau khi co URL backend public, vao Vercel frontend va dat:

```text
VITE_COVER_API_URL=https://your-cover-api.example.com
```

Sau do redeploy frontend tren Vercel.
