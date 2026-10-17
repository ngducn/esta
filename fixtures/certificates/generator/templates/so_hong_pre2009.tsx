import { area, Field, Heading, holderLine, Line, NationalHeader, Page, Signature, Table, Title, type CertificateTemplate, type Palette } from './parts.tsx';

const palette: Palette = { paper: '#fdf0f3', frame: '#c2185b', ink: '#2a1a20' };

export const soHongPre2009: CertificateTemplate = {
  handwritten: false,
  pages: [
    {
      sections: ['holders', 'structures', 'parcels', 'issued', 'book_entry_no', 'serial_no'],
      render: (facts) => (
        <Page palette={palette}>
          <NationalHeader />
          <Title color={palette.frame}>GIẤY CHỨNG NHẬN QUYỀN SỞ HỮU NHÀ Ở VÀ QUYỀN SỬ DỤNG ĐẤT Ở</Title>
          <Field label="Số" value={facts.serial_no} />
          <Heading>Chủ sở hữu nhà ở và sử dụng đất ở</Heading>
          {facts.holders.map((holder) => (
            <Line key={holder.id_number}>{holderLine(holder, holder === facts.holders[0] ? 'Ông' : 'Bà')}</Line>
          ))}
          <Field label="Quan hệ" value={facts.holders[0]?.relation ?? null} />
          <Field label="Địa chỉ thường trú" value={facts.holders[0]?.address_text ?? null} />
          <Heading>1. Nhà ở</Heading>
          {facts.structures.map((structure) => (
            <div key={structure.kind} style={{ display: 'flex', flexDirection: 'column' }}>
              <Field label="Loại nhà" value={structure.kind} />
              <Field label="Diện tích xây dựng" value={structure.footprint_m2 === null ? null : area(structure.footprint_m2)} />
              <Field label="Tổng diện tích sử dụng" value={structure.floor_area_m2 === null ? null : area(structure.floor_area_m2)} />
              <Field label="Kết cấu nhà" value={structure.structure_text} />
              <Field label="Số tầng" value={structure.floors} />
              <Field label="Năm xây dựng" value={structure.completed_year} />
            </div>
          ))}
          <Heading>2. Đất ở</Heading>
          {facts.parcels.map((parcel) => (
            <div key={parcel.parcel_no} style={{ display: 'flex', flexDirection: 'column' }}>
              <Table
                columns={['Thửa đất số', 'Tờ bản đồ số', 'Diện tích', 'Hình thức sử dụng', 'Mục đích']}
                rows={parcel.purposes.map((purpose) => [parcel.parcel_no ?? '', parcel.map_sheet_no ?? '', area(purpose.area_m2), parcel.use_form ?? '', purpose.land_use_code])}
              />
              <Field label="Địa chỉ" value={parcel.address_text} />
              <Field label="Thời hạn sử dụng" value={parcel.purposes[0]?.term ?? null} />
            </div>
          ))}
          <Signature place="TP. Hồ Chí Minh" issuedOn={facts.issued_on} issuedBy={facts.issued_by} />
          <div style={{ display: 'flex', marginTop: 'auto' }}>
            <Field label="Số đăng ký" value={facts.book_entry_no} />
          </div>
        </Page>
      ),
    },
    {
      sections: ['annotations', 'notes_text'],
      render: () => (
        <Page palette={palette}>
          <Heading>Sơ đồ nhà ở và đất ở</Heading>
          <div style={{ display: 'flex', height: 520, border: '1px dashed currentColor', margin: '8px 0 20px' }} />
          <Heading>Những thay đổi về chủ sở hữu và hiện trạng</Heading>
          <Table columns={['Ngày', 'Nội dung thay đổi', 'Xác nhận']} rows={[['', '', ''], ['', '', '']]} />
        </Page>
      ),
    },
  ],
};
