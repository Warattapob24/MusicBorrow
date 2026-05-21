-- Badge System Redesign Migration (v2 - corrected table/column names)
-- Run this in Supabase SQL Editor

-- 0. Add rarity column to badge_definitions
ALTER TABLE public.badge_definitions
  ADD COLUMN IF NOT EXISTS rarity TEXT NOT NULL DEFAULT 'common'
  CHECK (rarity IN ('common', 'rare', 'epic', 'legendary'));

-- 1. Create badge_progression_tiers table
CREATE TABLE IF NOT EXISTS public.badge_progression_tiers (
  id BIGSERIAL PRIMARY KEY,
  badge_name TEXT NOT NULL,
  tier_name TEXT NOT NULL CHECK (tier_name IN ('bronze', 'silver', 'gold')),
  tier_order INT CHECK (tier_order IN (1, 2, 3)),
  required_count INT NOT NULL DEFAULT 0,
  icon_emoji TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(badge_name, tier_name)
);

-- 2. Create achievement_definitions table (club_rank → xp_level)
CREATE TABLE IF NOT EXISTS public.achievement_definitions (
  id BIGSERIAL PRIMARY KEY,
  achievement_name TEXT UNIQUE NOT NULL,
  description TEXT,
  condition_type TEXT NOT NULL CHECK (condition_type IN ('borrow_count', 'return_streak', 'practice_mins', 'xp_level')),
  condition_value INT NOT NULL,
  reward_badge_name TEXT REFERENCES public.badge_definitions(badge_name) ON DELETE CASCADE,
  reward_xp INT DEFAULT 0,
  icon_emoji TEXT,
  rarity TEXT NOT NULL DEFAULT 'common' CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create user_achievements table
CREATE TABLE IF NOT EXISTS public.user_achievements (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  achievement_id BIGINT NOT NULL REFERENCES public.achievement_definitions(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, achievement_id)
);

-- 4. Indices
CREATE INDEX IF NOT EXISTS idx_badge_progression_tiers_badge_name ON public.badge_progression_tiers(badge_name);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON public.user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_achievement_id ON public.user_achievements(achievement_id);
CREATE INDEX IF NOT EXISTS idx_achievement_definitions_reward_badge ON public.achievement_definitions(reward_badge_name);

-- 5. Enable RLS
ALTER TABLE public.badge_progression_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievement_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies

-- badge_progression_tiers: read-all, admin modify
CREATE POLICY "badge_progression_tiers_select" ON public.badge_progression_tiers
  FOR SELECT USING (true);

CREATE POLICY "badge_progression_tiers_insert_admin" ON public.badge_progression_tiers
  FOR INSERT WITH CHECK (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'admin')
  );

CREATE POLICY "badge_progression_tiers_update_admin" ON public.badge_progression_tiers
  FOR UPDATE USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'admin')
  );

-- achievement_definitions: read-all, admin modify
CREATE POLICY "achievement_definitions_select" ON public.achievement_definitions
  FOR SELECT USING (true);

CREATE POLICY "achievement_definitions_insert_admin" ON public.achievement_definitions
  FOR INSERT WITH CHECK (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'admin')
  );

CREATE POLICY "achievement_definitions_update_admin" ON public.achievement_definitions
  FOR UPDATE USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'admin')
  );

-- user_achievements: own read, system insert
CREATE POLICY "user_achievements_select_own" ON public.user_achievements
  FOR SELECT USING (
    auth.uid() = user_id OR
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'admin')
  );

CREATE POLICY "user_achievements_insert_system" ON public.user_achievements
  FOR INSERT WITH CHECK (true);

-- 7. RPC: get_user_achievement_progress
-- Uses: borrow_logs (student_id), practice_sessions (user_id), users (xp)
CREATE OR REPLACE FUNCTION public.get_user_achievement_progress(p_user_id UUID)
RETURNS TABLE (
  achievement_id BIGINT,
  achievement_name TEXT,
  condition_type TEXT,
  condition_value INT,
  condition_current INT,
  description TEXT,
  reward_badge_name TEXT,
  rarity TEXT,
  unlocked BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ad.id,
    ad.achievement_name,
    ad.condition_type,
    ad.condition_value,
    CAST(
      CASE
        WHEN ad.condition_type = 'borrow_count' THEN (
          SELECT COUNT(*)::INT FROM public.borrow_logs
          WHERE student_id = p_user_id AND borrow_timestamp IS NOT NULL
        )
        WHEN ad.condition_type = 'return_streak' THEN (
          SELECT COUNT(*)::INT FROM public.borrow_logs
          WHERE student_id = p_user_id
            AND return_timestamp IS NOT NULL
            AND return_timestamp > NOW() - INTERVAL '30 days'
        )
        WHEN ad.condition_type = 'practice_mins' THEN COALESCE(
          (SELECT SUM(duration_minutes)::INT FROM public.practice_sessions
           WHERE user_id = p_user_id),
          0
        )
        WHEN ad.condition_type = 'xp_level' THEN COALESCE(
          (SELECT xp::INT FROM public.users WHERE id = p_user_id),
          0
        )
        ELSE 0
      END AS INT
    ),
    ad.description,
    ad.reward_badge_name,
    ad.rarity,
    ua.id IS NOT NULL AS unlocked
  FROM public.achievement_definitions ad
  LEFT JOIN public.user_achievements ua ON ad.id = ua.achievement_id AND ua.user_id = p_user_id
  ORDER BY ad.rarity DESC, ad.achievement_name;
END;
$$ LANGUAGE plpgsql;

-- 8. RPC: get_badge_gallery_stats
-- Uses: badges (user_id, badge_name), borrow_logs (student_id)
CREATE OR REPLACE FUNCTION public.get_badge_gallery_stats(p_user_id UUID)
RETURNS TABLE (
  earned_count INT,
  total_available INT,
  completion_pct NUMERIC,
  rarest_earned TEXT,
  collecting_streak INT
) AS $$
DECLARE
  v_earned_count INT;
  v_total_available INT;
  v_rarest_earned TEXT;
  v_streak INT;
BEGIN
  SELECT COUNT(DISTINCT badge_name)::INT INTO v_earned_count
  FROM public.badges
  WHERE user_id = p_user_id;

  SELECT COUNT(*)::INT INTO v_total_available
  FROM public.badge_definitions;

  SELECT bd.badge_name INTO v_rarest_earned
  FROM public.badges ub
  JOIN public.badge_definitions bd ON ub.badge_name = bd.badge_name
  WHERE ub.user_id = p_user_id
  ORDER BY
    CASE bd.rarity
      WHEN 'legendary' THEN 1
      WHEN 'epic' THEN 2
      WHEN 'rare' THEN 3
      ELSE 4
    END
  LIMIT 1;

  -- Streak: consecutive days with at least one borrow
  SELECT COALESCE(
    (WITH RECURSIVE streak AS (
      SELECT DATE(NOW()) AS d, 1 AS n
      UNION ALL
      SELECT (d - INTERVAL '1 day')::DATE, n + 1
      FROM streak
      WHERE EXISTS (
        SELECT 1 FROM public.borrow_logs
        WHERE student_id = p_user_id
          AND DATE(borrow_timestamp) = (d - INTERVAL '1 day')::DATE
      ) AND n < 365
    )
    SELECT MAX(n) FROM streak),
    0
  )::INT INTO v_streak;

  RETURN QUERY SELECT
    v_earned_count,
    v_total_available,
    CASE WHEN v_total_available > 0
      THEN ROUND((v_earned_count * 100.0 / v_total_available)::NUMERIC, 2)
      ELSE 0::NUMERIC
    END,
    v_rarest_earned,
    v_streak;
END;
$$ LANGUAGE plpgsql;
