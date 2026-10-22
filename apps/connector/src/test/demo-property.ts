export const demoProperty = (code: string) => ({
  nickname: `Demo Nhà phố ${code}`,
  code,
  kind: 'townhouse',
  kind_details: {},
  use_mode: 'rental',
  legal_status: 'certified',
  current_address: { house_no: '12 Demo', street: 'Đường số 5', commune_code: '27475', province_code: '79' },
  certificate_address_text: 'Thửa 12, tờ bản đồ 5, Phường Tân Kiểng, Quận 7',
  acquired_on: '2020-05-01',
  acquisition_kind: 'purchase',
  acquisition_price_vnd: 3_500_000_000,
  notes: 'Demo, mua qua môi giới',
});
