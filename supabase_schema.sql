-- USERS TABLE
create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  student_id text unique,
  full_name text,
  role text check (role in ('student', 'admin')) not null default 'student',
  student_group text,
  created_at timestamptz default now(),
  -- Additional columns used in the application
  prefix text,
  first_name text,
  last_name text,
  nickname text,
  birth_date date,
  phone_number text,
  line_id text,
  class_level text,
  main_instrument text,
  profile_image_url text,
  total_practice_minutes int default 0,
  last_practice_date date,
  practice_streak int default 0
);

-- INSTRUMENTS TABLE
create table if not exists instruments (
  id serial primary key,
  name text not null,
  type text,
  status text not null default 'available',
  current_borrower_id uuid references users(id),
  created_at timestamptz default now(),
  image_url text,
  condition text,
  description text
);

-- BORROW LOGS TABLE
create table if not exists borrow_logs (
  id serial primary key,
  student_id uuid references users(id),
  instrument_id int references instruments(id),
  borrow_timestamp timestamptz default now(),
  return_timestamp timestamptz,
  is_take_home boolean default false,
  approval_status text,
  borrow_status text,
  terms_accepted boolean,
  damage_notes text,
  -- Additional columns used in the application
  latest_repair_status text,
  problem_description text,
  practice_minutes int default 0,
  force_returned boolean default false
);

-- BADGES TABLE
create table if not exists badges (
  id serial primary key,
  user_id uuid references users(id),
  badge_name text,
  badge_description text,
  created_at timestamptz default now(),
  awarded_at timestamptz default now()
);

-- NOTIFICATIONS TABLE
create table if not exists notifications (
  id serial primary key,
  user_id uuid references users(id),
  title text not null,
  body text,
  is_read boolean default false,
  created_at timestamptz default now()
);

-- GAME SESSIONS TABLE
create table if not exists game_sessions (
  id serial primary key,
  user_id uuid references users(id),
  game_name text not null,
  start_time timestamptz,
  end_time timestamptz,
  duration_minutes int,
  score int,
  created_at timestamptz default now()
);

-- PRACTICE SESSIONS TABLE
create table if not exists practice_sessions (
  id serial primary key,
  user_id uuid references users(id),
  instrument_id int references instruments(id),
  start_time timestamptz,
  end_time timestamptz,
  duration_minutes int,
  created_at timestamptz default now()
);

-- KNOWLEDGE LINKS TABLE
create table if not exists knowledge_links (
  id serial primary key,
  title text not null,
  url text not null,
  instrument_type text,
  submitted_by uuid references users(id),
  is_approved boolean default false,
  created_at timestamptz default now()
);

-- BADGE DEFINITIONS TABLE
create table if not exists badge_definitions (
  id serial primary key,
  badge_name text not null,
  badge_icon text,
  badge_description text,
  award_method text,
  goal_value int,
  game_name text,
  created_at timestamptz default now()
);
