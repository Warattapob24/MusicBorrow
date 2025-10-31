-- USERS TABLE
create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  student_id text unique,
  full_name text,
  role text check (role in ('student', 'admin')) not null default 'student',
  student_group text,
  created_at timestamptz default now()
);

-- INSTRUMENTS TABLE
create table if not exists instruments (
  id serial primary key,
  name text not null,
  type text,
  status text not null default 'available',
  current_borrower_id uuid references users(id),
  created_at timestamptz default now()
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
  damage_notes text
);

-- BADGES TABLE
create table if not exists badges (
  id serial primary key,
  user_id uuid references users(id),
  badge_name text,
  badge_description text,
  created_at timestamptz default now()
);
