import { area, Line, Page, type CertificateTemplate, type Palette } from './parts.tsx';

const palette: Palette = { paper: '#fdfcf5', frame: '#d9d4c3', ink: '#1f2a6b' };

const hand = { fontFamily: 'Hand', fontSize: 30 } as const;

export const paperOnly: CertificateTemplate = {
  handwritten: true,
  pages: [
    {
      sections: ['holders', 'parcels', 'notes_text', 'issued', 'book_entry_no', 'serial_no', 'annotations'],
      render: (facts) => {
        const buyer = facts.holders[0];
        const parcel = facts.parcels[0];
        return (
          <Page palette={palette}>
            <div style={{ display: 'flex', flexDirection: 'column', ...hand }}>
              <div style={{ display: 'flex', justifyContent: 'center', fontSize: 40, marginBottom: 24 }}>GIẤY SANG NHƯỢNG ĐẤT</div>
              <Line>Hôm nay ngày 12 tháng 3 năm 2008, tại nhà ông Trưởng ấp.</Line>
              <Line>Bên bán: ông Lý Văn Demo Tư, sinh năm 1950.</Line>
              <Line>{buyer === undefined ? '' : `Bên mua: bà ${buyer.full_name}, sinh năm ${buyer.birth_year ?? ''}, CCCD số ${buyer.id_number}.`}</Line>
              <Line>{buyer?.address_text === null || buyer === undefined ? '' : `Thường trú tại ${buyer.address_text}.`}</Line>
              <Line>
                {parcel === undefined
                  ? ''
                  : `Tôi đồng ý bán cho bà phần đất thửa số ${parcel.parcel_no ?? ''}, tờ bản đồ số ${parcel.map_sheet_no ?? ''}, diện tích ${area(parcel.area_m2)} (ngang 5 m, dài 20 m), tọa lạc tại ${parcel.address_text}.`}
              </Line>
              <Line>Giá 150.000.000 đồng, bên bán đã nhận đủ tiền.</Line>
              <Line>Hai bên cam kết không tranh chấp về sau.</Line>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 60, padding: '0 40px' }}>
                <div style={{ display: 'flex' }}>Bên bán</div>
                <div style={{ display: 'flex' }}>Người làm chứng</div>
                <div style={{ display: 'flex' }}>Bên mua</div>
              </div>
            </div>
          </Page>
        );
      },
    },
  ],
};
