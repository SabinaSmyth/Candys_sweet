-- SABI - Database Schema in 3rd Normal Form (3NF)
-- Suitable for Supabase (PostgreSQL)

-- 1. Raw Materials Table (Insumos y Packaging)
CREATE TABLE raw_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    category VARCHAR(50) NOT NULL CHECK (category IN ('Ingrediente', 'Packaging')),
    unit VARCHAR(50) NOT NULL,
    package_size NUMERIC(12, 4) NOT NULL CHECK (package_size > 0),
    package_cost NUMERIC(12, 2) NOT NULL CHECK (package_cost >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Recipes Table (Productos Finales)
CREATE TABLE recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    sheet_name VARCHAR(255),
    extra_expenses NUMERIC(12, 2) DEFAULT 0.0 CHECK (extra_expenses >= 0),
    margin NUMERIC(12, 4) DEFAULT 1.5 CHECK (margin >= 0),
    image TEXT, -- Stores compressed base64 image data
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. Recipe Ingredients Table (Relation between Recipes and Raw Materials)
CREATE TABLE recipe_ingredients (
    recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
    material_id UUID REFERENCES raw_materials(id) ON DELETE CASCADE,
    quantity NUMERIC(12, 4) NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (recipe_id, material_id)
);

-- Optional: View to calculate unit costs and recipe totals dynamically (maintaining 3NF)
CREATE VIEW view_materials_with_unit_cost AS
SELECT 
    id,
    name,
    category,
    unit,
    package_size,
    package_cost,
    CASE 
        WHEN unit IN ('KILOS', 'LITROS') THEN package_cost / (package_size * 1000.0)
        ELSE package_cost / package_size
    END AS unit_cost
FROM raw_materials;
