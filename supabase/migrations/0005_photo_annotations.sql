-- Per-photo annotation layer: shapes (rectangles, circles, arrows) and text
-- the inspector draws on top of a photo. Stored as JSONB on the photos row
-- so we don't need a separate table for what is essentially document-shaped
-- data.
--
-- Each annotation is:
--   { id: string, type: "rect"|"circle"|"arrow"|"text",
--     color: "#hex", x1, y1, x2, y2: number,
--     text?: string }
-- Coordinates are normalized [0, 1] to match the existing bbox system.

alter table public.photos
  add column if not exists annotations jsonb not null default '[]'::jsonb;
