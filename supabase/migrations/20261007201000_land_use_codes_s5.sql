-- Spike S5 checked the P0-06 land use codes against Circular 08/2024/TT-BTNMT, Annex II section A,
-- as luatvietnam.vn and hethongphapluat.com list it (fetched 2026-10-17; DOMAIN-VN §3).
-- The 2024 list drops "nước" from the rice codes and names CSD the whole unused group, so the flat
-- unused land P0-06 called CSD is BCS. BHK left the 2024 list but stays: certificates issued under
-- the older lists carry it and remain valid (Land Law 2024, Article 256(3)).

update public.land_use_codes set name_vi = 'Đất chuyên trồng lúa', name_en = 'Specialized rice land' where code = 'LUC';
update public.land_use_codes set name_vi = 'Đất trồng lúa còn lại', name_en = 'Other rice land' where code = 'LUK';
update public.land_use_codes set name_vi = 'Đất chưa sử dụng', name_en = 'Unused land' where code = 'CSD';
update public.land_use_codes set name_en = 'Other annual crop land, flat terrain (pre-2024 code)' where code = 'BHK';

insert into public.land_use_codes (code, name_vi, name_en, land_group) values
  ('BCS', 'Đất bằng chưa sử dụng', 'Unused flat land', 'unused'),
  ('HNK', 'Đất trồng cây hằng năm khác', 'Other annual crop land', 'agricultural');
