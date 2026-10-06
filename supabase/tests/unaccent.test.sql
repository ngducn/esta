begin;

select plan(9);

select is(public.esta_unaccent('Đường Dĩ An'), 'duong di an', 'folds đ, tones and case');
select is(public.esta_unaccent('ĐẶNG THỊ HƯỜNG'), 'dang thi huong', 'folds stacked marks and uppercase');
select is(public.esta_unaccent(normalize('Hợp đồng', NFD)), 'hop dong', 'folds decomposed input like precomposed');
select is(public.esta_unaccent(null), null, 'passes null through');

select ok(public.esta_unaccent('Dĩ An') ilike '%' || public.esta_unaccent('di an') || '%', 'di an finds Dĩ An');
select ok(public.esta_unaccent('Hợp đồng') ilike '%' || public.esta_unaccent('hop dong') || '%', 'hop dong finds Hợp đồng');
select ok(public.esta_unaccent('Đường') ilike '%' || public.esta_unaccent('DUONG') || '%', 'DUONG finds Đường');
select ok(
  (select bool_and(public.esta_unaccent('Sổ hồng Bảo Lộc') ilike '%' || word || '%')
     from unnest(string_to_array(public.esta_unaccent('bao loc so'), ' ')) as word),
  'bao loc so finds Sổ hồng Bảo Lộc word by word'
);

select is(
  (select provolatile from pg_proc where oid = 'public.esta_unaccent(text)'::regprocedure),
  'i'::"char",
  'esta_unaccent is immutable, so expression indexes can use it'
);

select * from finish();
rollback;
