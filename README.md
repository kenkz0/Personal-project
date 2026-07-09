# Lam Kinh - Vietnam Forest 3D

Ung dung demo quan ly nhieu lo rung, truc quan hoa Sentinel-2 va xuat bao cao PDF.

## Chay local

```powershell
npm install
npm run dev
```

Lenh `npm run dev` se chay ca:

- Frontend Vite: `http://127.0.0.1:5173`
- Cover API local: `http://127.0.0.1:8765`

## Cau truc deploy public

Du an da tach thanh 2 phan:

- Frontend React/Vite: deploy len Vercel.
- Backend Microsoft Planetary Computer: deploy rieng trong thu muc `backend/`.

Ly do tach rieng: API tinh do che phu dung `geopandas`, `rioxarray`, `stackstac` va xu ly raster ve tinh, khong phu hop voi frontend static cua Vercel.

## Deploy frontend len Vercel

1. Import repo GitHub vao Vercel.
2. Framework: Vite.
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. Sau khi backend public co URL, them Environment Variable:

```text
VITE_COVER_API_URL=https://your-cover-api.example.com
```

Neu chua set `VITE_COVER_API_URL`, frontend se goi `/api/cover` nhu local.

## Deploy backend

Backend nam trong `backend/`.

Chay local rieng:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\python pc_cover_api.py
```

Deploy len Render/Railway/Fly.io. Repo da co `render.yaml` de deploy tren Render.

Bien moi truong backend:

- `HOST=0.0.0.0`
- `PORT`: de nha cung cap tu gan.
- `ALLOWED_ORIGINS`: domain Vercel frontend, vi du `https://personal-project.vercel.app`.

API:

- `GET /health`
- `POST /api/cover`
