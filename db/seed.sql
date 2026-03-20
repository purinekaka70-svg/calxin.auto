USE calxin_auto;

INSERT INTO products (
  name,
  slug,
  category,
  price,
  stock_quantity,
  rating,
  image_url,
  description,
  document_url,
  document_provider,
  is_published
) VALUES
  ('Engine Assembly Complete', 'engine-assembly-complete', 'Engines', 45000.00, 12, 4.80, '/calxin.images/WhatsApp%20Image%202026-01-23%20at%204.58.16%20PM.jpeg', 'Complete engine assembly for common Japanese vehicle imports.', NULL, NULL, 1),
  ('Automatic Transmission', 'automatic-transmission', 'Transmissions', 38000.00, 8, 4.70, '/calxin.images/WhatsApp%20Image%202026-01-23%20at%204.58.18%20PM.jpeg', 'Automatic transmission unit inspected for smooth gear changes.', NULL, NULL, 1),
  ('Brake Pads Set', 'brake-pads-set', 'Brakes', 2500.00, 45, 4.90, '/calxin.images/WhatsApp%20Image%202026-01-23%20at%204.58.19%20PM.jpeg', 'Reliable brake pad set for everyday urban driving.', NULL, NULL, 1),
  ('Car Battery 12V 100A', 'car-battery-12v-100a', 'Electrical', 8500.00, 28, 4.80, '/calxin.images/WhatsApp%20Image%202026-01-23%20at%204.58.23%20PM.jpeg', 'High-capacity battery suited for larger vehicles and pickups.', NULL, NULL, 1),
  ('Radiator Complete', 'radiator-complete', 'Cooling', 11500.00, 14, 4.70, '/calxin.images/WhatsApp%20Image%202026-01-23%20at%204.58.30%20PM.jpeg', 'Cooling system radiator assembly with durable aluminum core.', NULL, NULL, 1),
  ('LED Headlights Pair', 'led-headlights-pair', 'Lighting', 8800.00, 17, 4.90, '/calxin.images/WhatsApp%20Image%202026-01-23%20at%205.01.09%20PM.jpeg', 'Bright LED headlight pair for improved road visibility.', NULL, NULL, 1);

INSERT INTO posts (
  title,
  slug,
  excerpt,
  content,
  image_url,
  document_url,
  document_provider,
  is_published
) VALUES
  ('How To Choose Quality Spare Parts', 'how-to-choose-quality-spare-parts', 'A short guide for selecting reliable auto spare parts in Mombasa.', 'Check part numbers, compare wear patterns, confirm stock availability, and only buy from trusted sellers who can explain the source of the part.', '/calxin.images/WhatsApp%20Image%202026-01-23%20at%204.59.04%20PM.jpeg', NULL, NULL, 1);
