-- Menuly Database Schema

-- Profiles table
CREATE TABLE profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  meal_slots TEXT[] DEFAULT ARRAY['breakfast', 'lunch', 'dinner'] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Recipes table
CREATE TABLE recipes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  cuisine_type TEXT,
  protein_type TEXT,
  meal_type TEXT[] DEFAULT ARRAY['dinner'] NOT NULL,
  prep_time INTEGER,
  cook_time INTEGER,
  servings INTEGER,
  instructions TEXT[] DEFAULT ARRAY[]::TEXT[],
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_favorite BOOLEAN DEFAULT false NOT NULL,
  last_made_date DATE,
  times_made INTEGER DEFAULT 0 NOT NULL,
  source_url TEXT,
  image_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Recipe ingredients table
CREATE TABLE recipe_ingredients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  quantity NUMERIC,
  unit TEXT,
  category TEXT DEFAULT 'other' NOT NULL,
  notes TEXT,
  is_optional BOOLEAN DEFAULT false NOT NULL,
  raw_text TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0 NOT NULL
);

-- Recipe history table
CREATE TABLE recipe_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  made_date DATE DEFAULT CURRENT_DATE NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Meal plans table
CREATE TABLE meal_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  week_start DATE NOT NULL,
  status TEXT DEFAULT 'draft' NOT NULL CHECK (status IN ('draft', 'finalized')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, week_start)
);

-- Meal plan items table
CREATE TABLE meal_plan_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  meal_plan_id UUID REFERENCES meal_plans(id) ON DELETE CASCADE NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  meal_slot TEXT NOT NULL,
  recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  custom_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CHECK (recipe_id IS NOT NULL OR custom_name IS NOT NULL)
);

-- Grocery lists table
CREATE TABLE grocery_lists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  meal_plan_id UUID REFERENCES meal_plans(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Grocery items table
CREATE TABLE grocery_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  grocery_list_id UUID REFERENCES grocery_lists(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  quantity NUMERIC,
  unit TEXT,
  category TEXT DEFAULT 'other' NOT NULL,
  is_checked BOOLEAN DEFAULT false NOT NULL,
  recipe_ids UUID[] DEFAULT ARRAY[]::UUID[],
  added_manually BOOLEAN DEFAULT false NOT NULL,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX idx_recipes_user_id ON recipes(user_id);
CREATE INDEX idx_recipes_cuisine ON recipes(cuisine_type);
CREATE INDEX idx_recipes_protein ON recipes(protein_type);
CREATE INDEX idx_recipes_favorite ON recipes(is_favorite) WHERE is_favorite = true;
CREATE INDEX idx_recipes_last_made ON recipes(last_made_date);
CREATE INDEX idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
CREATE INDEX idx_recipe_history_recipe ON recipe_history(recipe_id);
CREATE INDEX idx_recipe_history_date ON recipe_history(made_date);
CREATE INDEX idx_meal_plans_user_week ON meal_plans(user_id, week_start);
CREATE INDEX idx_meal_plan_items_plan ON meal_plan_items(meal_plan_id);
CREATE INDEX idx_grocery_lists_user ON grocery_lists(user_id);
CREATE INDEX idx_grocery_lists_active ON grocery_lists(is_active) WHERE is_active = true;
CREATE INDEX idx_grocery_items_list ON grocery_items(grocery_list_id);

-- Trigger: auto-update recipes.last_made_date and times_made on recipe_history insert
CREATE OR REPLACE FUNCTION update_recipe_on_history_insert()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE recipes
  SET
    last_made_date = NEW.made_date,
    times_made = times_made + 1,
    updated_at = now()
  WHERE id = NEW.recipe_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_recipe_on_history
AFTER INSERT ON recipe_history
FOR EACH ROW
EXECUTE FUNCTION update_recipe_on_history_insert();

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_recipes_updated_at BEFORE UPDATE ON recipes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_meal_plans_updated_at BEFORE UPDATE ON meal_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_grocery_lists_updated_at BEFORE UPDATE ON grocery_lists FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE grocery_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE grocery_items ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Recipes policies
CREATE POLICY "Users can view own recipes" ON recipes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own recipes" ON recipes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own recipes" ON recipes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own recipes" ON recipes FOR DELETE USING (auth.uid() = user_id);

-- Recipe ingredients policies (access via recipe ownership)
CREATE POLICY "Users can view recipe ingredients" ON recipe_ingredients FOR SELECT
  USING (EXISTS (SELECT 1 FROM recipes WHERE recipes.id = recipe_ingredients.recipe_id AND recipes.user_id = auth.uid()));
CREATE POLICY "Users can insert recipe ingredients" ON recipe_ingredients FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM recipes WHERE recipes.id = recipe_ingredients.recipe_id AND recipes.user_id = auth.uid()));
CREATE POLICY "Users can update recipe ingredients" ON recipe_ingredients FOR UPDATE
  USING (EXISTS (SELECT 1 FROM recipes WHERE recipes.id = recipe_ingredients.recipe_id AND recipes.user_id = auth.uid()));
CREATE POLICY "Users can delete recipe ingredients" ON recipe_ingredients FOR DELETE
  USING (EXISTS (SELECT 1 FROM recipes WHERE recipes.id = recipe_ingredients.recipe_id AND recipes.user_id = auth.uid()));

-- Recipe history policies
CREATE POLICY "Users can view own recipe history" ON recipe_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own recipe history" ON recipe_history FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Meal plans policies
CREATE POLICY "Users can view own meal plans" ON meal_plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own meal plans" ON meal_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own meal plans" ON meal_plans FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own meal plans" ON meal_plans FOR DELETE USING (auth.uid() = user_id);

-- Meal plan items policies (access via meal plan ownership)
CREATE POLICY "Users can view meal plan items" ON meal_plan_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM meal_plans WHERE meal_plans.id = meal_plan_items.meal_plan_id AND meal_plans.user_id = auth.uid()));
CREATE POLICY "Users can insert meal plan items" ON meal_plan_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM meal_plans WHERE meal_plans.id = meal_plan_items.meal_plan_id AND meal_plans.user_id = auth.uid()));
CREATE POLICY "Users can update meal plan items" ON meal_plan_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM meal_plans WHERE meal_plans.id = meal_plan_items.meal_plan_id AND meal_plans.user_id = auth.uid()));
CREATE POLICY "Users can delete meal plan items" ON meal_plan_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM meal_plans WHERE meal_plans.id = meal_plan_items.meal_plan_id AND meal_plans.user_id = auth.uid()));

-- Grocery lists policies
CREATE POLICY "Users can view own grocery lists" ON grocery_lists FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own grocery lists" ON grocery_lists FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own grocery lists" ON grocery_lists FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own grocery lists" ON grocery_lists FOR DELETE USING (auth.uid() = user_id);

-- Grocery items policies (access via grocery list ownership)
CREATE POLICY "Users can view grocery items" ON grocery_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM grocery_lists WHERE grocery_lists.id = grocery_items.grocery_list_id AND grocery_lists.user_id = auth.uid()));
CREATE POLICY "Users can insert grocery items" ON grocery_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM grocery_lists WHERE grocery_lists.id = grocery_items.grocery_list_id AND grocery_lists.user_id = auth.uid()));
CREATE POLICY "Users can update grocery items" ON grocery_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM grocery_lists WHERE grocery_lists.id = grocery_items.grocery_list_id AND grocery_lists.user_id = auth.uid()));
CREATE POLICY "Users can delete grocery items" ON grocery_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM grocery_lists WHERE grocery_lists.id = grocery_items.grocery_list_id AND grocery_lists.user_id = auth.uid()));

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION handle_new_user();

-- Enable realtime for grocery items
ALTER PUBLICATION supabase_realtime ADD TABLE grocery_items;
