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
- `GET /api/plots`
- `POST /api/plots`
- `PATCH /api/plots/:id`
- `DELETE /api/plots/:id`

## PostgreSQL

Dat bien moi truong `DATABASE_URL` de bat luu tru PostgreSQL. Backend se tu chay
`schema.sql` khi start, tao cac bang:

- `users`: tai khoan/demo user key.
- `forest_plots`: lo rung, polygon GeoJSON/KML, ring, bounds, ket qua phan tich spectral.
- `cover_analysis`: lich su va cache ket qua `POST /api/cover` theo `plot_id`, geometry va options.

Frontend gui `X-User-Key` de gan du lieu voi user. Day la lop demo auth hien tai;
khi co dang nhap that, thay header nay bang user id/JWT tu he thong auth.

## Deploy public

Nen deploy backend nay len mot dich vu ho tro Python process dai han nhu Render, Railway hoac Fly.io.
Dat bien moi truong:

- `PORT`: cong do nha cung cap gan, thuong tu co san.
- `HOST`: de mac dinh `0.0.0.0`.
- `ALLOWED_ORIGINS`: domain frontend Vercel, vi du `https://personal-project.vercel.app`.
- `DATABASE_URL`: PostgreSQL connection string tren Render/Railway/Fly.

Sau khi co URL backend public, vao Vercel frontend va dat:

```text
VITE_COVER_API_URL=https://your-cover-api.example.com
```

Sau do redeploy frontend tren Vercel.
