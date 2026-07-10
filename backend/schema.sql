CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE,
  display_name text,
  email text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS forest_plots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  source_name text NOT NULL DEFAULT 'Polygon KML',
  kml_text text,
  geojson jsonb NOT NULL,
  ring jsonb NOT NULL,
  holes jsonb NOT NULL DEFAULT '[]'::jsonb,
  bounds jsonb NOT NULL,
  center jsonb NOT NULL,
  area_ha double precision NOT NULL CHECK (area_ha >= 0),
  drawn boolean NOT NULL DEFAULT false,
  analysis jsonb,
  analysis_item jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS forest_plots_user_updated_idx
  ON forest_plots (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS cover_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plot_id uuid REFERENCES forest_plots(id) ON DELETE CASCADE,
  geometry_hash text NOT NULL,
  options_hash text NOT NULL,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL,
  source text,
  selected_scene_id text,
  selected_scene_datetime timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cover_analysis_plot_cache_idx
  ON cover_analysis (plot_id, options_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS cover_analysis_payload_cache_idx
  ON cover_analysis (geometry_hash, options_hash, created_at DESC);
