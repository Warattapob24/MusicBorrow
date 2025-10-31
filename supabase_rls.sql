-- Enable RLS
alter table users enable row level security;
alter table instruments enable row level security;
alter table borrow_logs enable row level security;
alter table badges enable row level security;

-- USERS: Only self or admin can select/update
create policy "Users: Self or Admin can view" on users
  for select using (
    auth.role() = 'authenticated'
    and (auth.uid() = id or exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin'))
  );

create policy "Users: Self or Admin can update" on users
  for update using (
    auth.uid() = id or exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  );

-- USERS: Only self or admin can insert
create policy "Users: Self or Admin can insert" on users
  for insert with check (
    auth.uid() = id or exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  );

-- INSTRUMENTS: All authenticated users can select
create policy "Instruments: Anyone logged in can view" on instruments
  for select using (auth.role() = 'authenticated');

-- INSTRUMENTS: Only admin can insert/update/delete
create policy "Instruments: Admin can insert" on instruments
  for insert with check (
    exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  );
create policy "Instruments: Admin can update" on instruments
  for update using (
    exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  );
create policy "Instruments: Admin can delete" on instruments
  for delete using (
    exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  );

-- BORROW_LOGS: Only self or admin can view
create policy "BorrowLogs: Self or Admin can view" on borrow_logs
  for select using (
    auth.uid() = student_id
    or exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  );

-- BORROW_LOGS: Only self or admin can insert/update/delete
create policy "BorrowLogs: Self or Admin can insert" on borrow_logs
  for insert with check (
    auth.uid() = student_id or exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  );
create policy "BorrowLogs: Self or Admin can update" on borrow_logs
  for update using (
    auth.uid() = student_id or exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  );
create policy "BorrowLogs: Self or Admin can delete" on borrow_logs
  for delete using (
    auth.uid() = student_id or exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  );

-- BADGES: Only admin can insert/update/delete, all authenticated can select
create policy "Badges: Anyone logged in can view" on badges
  for select using (auth.role() = 'authenticated');
create policy "Badges: Admin can insert" on badges
  for insert with check (
    exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  );
create policy "Badges: Admin can update" on badges
  for update using (
    exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  );
create policy "Badges: Admin can delete" on badges
  for delete using (
    exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  );
